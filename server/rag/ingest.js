// server/rag/ingest.js
//
// 目的:
// 学習メモを読み込み → 前処理 → チャンク分割 → Embedding → index.json に保存する。
// 資料が増えたとき・変わったときに1回だけ実行する(質問のたびに実行するものではない)。
//
// 実行方法(serverフォルダで):
//   node rag/ingest.js

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { chunkText } from "./chunker.js";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, INDEX_PATH } from "./config.js";

// server/.env を読み込む(実行時のカレントディレクトリに関わらず、このファイルから見た場所で指定)
dotenv.config({ path: new URL("../.env", import.meta.url) });

// 取り込み対象のファイル名(例:20260924_学習メモ.txt)
const FILE_PATTERN = /^\d{8}_学習メモ\.txt$/;

// 1回のAPI呼び出しでまとめてベクトル化する件数
// ※無料枠の回数制限(1分あたり100件)は「API呼び出し回数」ではなく「ベクトル化した件数」で数えられる
//   (2026-09-25に実測)。まとめて送っても制限を回避することはできず、通信の回数が減るだけ。
const BATCH_SIZE = 50;

// 回数制限(429)に当たったときに、待ってから再試行する最大回数
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 回数制限(429)のエラーなら、何秒待てばよいかを返す。それ以外のエラーなら null
 * (Geminiのエラーメッセージに含まれる「Please retry in 28.3s」を読み取る。見つからなければ60秒)
 */
function getRetryWaitSeconds(err) {
  const message = String(err?.message ?? "");
  const isRateLimit = err?.status === 429 || message.includes("RESOURCE_EXHAUSTED");
  if (!isRateLimit) return null;
  const match = message.match(/retry in ([\d.]+)s/);
  return match ? Math.ceil(Number(match[1])) + 1 : 60;
}

/**
 * 学習メモ特有のノイズを取り除き、chunker が扱いやすい形にそろえる
 * - 冒頭の「AI開発学習メモ / 日付：…」の2行を削除(日付はファイル名から取り、全チャンクの先頭に付ける)
 * - 毎日同じ定型文(「このファイルはその日の…参照してください。」)を削除
 * - 「=====」で囲まれた大見出しを【】形式に変換(9/4〜9/8のメモには【】の見出しがないため)
 */
export function cleanMemo(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^AI開発学習メモ\n日付：.*\n/, "")
    .replace(/このファイルはその日の学習内容のみを記録する日次メモです。[\s\S]*?参照してください。\n?/, "")
    .replace(/^=+\n(.+)\n=+$/gm, "【$1】");
}

/**
 * 複数のテキストを1回のAPI呼び出しでベクトル化する
 * @param {GoogleGenAI} ai
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(ai, texts) {
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: {
      taskType: "RETRIEVAL_DOCUMENT", // 「検索される側の文書」としてベクトル化する
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });
  const vectors = response.embeddings.map((e) => e.values);
  if (vectors.length !== texts.length) {
    throw new Error(`ベクトルの件数が一致しません(送信 ${texts.length} 件 / 受信 ${vectors.length} 件)`);
  }
  return vectors;
}

/**
 * embedBatch を呼び、回数制限(429)に当たった場合だけ、指定された秒数待ってから再試行する
 * (429以外のエラーや、再試行の上限を超えた場合は、そのままエラーにする)
 */
async function embedBatchWithRetry(ai, texts) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await embedBatch(ai, texts);
    } catch (err) {
      const waitSeconds = getRetryWaitSeconds(err);
      if (waitSeconds === null || attempt > MAX_RETRIES) {
        throw err;
      }
      console.log(`  回数制限に達しました。${waitSeconds}秒待って再試行します(${attempt}/${MAX_RETRIES})`);
      await sleep(waitSeconds * 1000);
    }
  }
}

/**
 * ファイル名(例:20260924_学習メモ.txt)から日付(例:2026-09-24)を取り出す
 */
export function dateFromFileName(fileName) {
  const [, y, m, d] = fileName.match(/^(\d{4})(\d{2})(\d{2})_/);
  return `${y}-${m}-${d}`;
}

async function main() {
  // ---- 設定の確認(足りなければ、何が足りないかを明示して止める) ----
  const dataDir = process.env.RAG_DATA_DIR;
  if (!dataDir) {
    throw new Error("server/.env に RAG_DATA_DIR(学習メモのフォルダ)を設定してください");
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("server/.env に GEMINI_API_KEY を設定してください");
  }

  // ---- 1. 学習メモを読み込んで、チャンクに分割する ----
  const files = (await readdir(dataDir)).filter((name) => FILE_PATTERN.test(name)).sort();
  if (files.length === 0) {
    throw new Error(`${dataDir} に学習メモ(YYYYMMDD_学習メモ.txt)が見つかりません`);
  }

  const chunks = [];
  for (const file of files) {
    const raw = await readFile(path.join(dataDir, file), "utf8");
    const date = dateFromFileName(file);
    const fileChunks = chunkText(cleanMemo(raw));
    for (const chunk of fileChunks) {
      chunks.push({
        id: `${file}#${chunk.index}`, // どのファイルの何番目か(出典表示に使う)
        source: file,
        date,
        heading: chunk.heading,
        // 先頭に日付を付けてからベクトル化する(「9/10に何を学んだ?」のような質問にも引っかかるように)
        text: `日付：${date}\n${chunk.text}`,
      });
    }
    console.log(`${file}: ${fileChunks.length} チャンク`);
  }
  console.log(`合計: ${files.length} ファイル / ${chunks.length} チャンク\n`);

  // ---- 2. チャンクをまとめてベクトル化する ----
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatchWithRetry(ai, batch.map((c) => c.text));
    batch.forEach((chunk, j) => {
      chunk.embedding = vectors[j];
    });
    console.log(`Embedding: ${i + batch.length} / ${chunks.length}`);
  }

  // ---- 3. index.json に保存する ----
  const index = {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    createdAt: new Date().toISOString(),
    chunks,
  };
  await writeFile(INDEX_PATH, JSON.stringify(index), "utf8");
  console.log(`\n保存しました: ${fileURLToPath(INDEX_PATH)}`);
}

main().catch((err) => {
  console.error("取り込みに失敗しました:", err.message);
  process.exitCode = 1; // 失敗したことを、呼び出し元(ターミナルやCI)に伝える
});
