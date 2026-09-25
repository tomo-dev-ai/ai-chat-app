// server/rag/search.js
//
// 目的:
// 質問文を受け取り、index.json(ingest.jsで作った仮のVector DB)から近いチャンクを探し、
// それを根拠にGeminiで回答を生成する。回答には、どの学習メモを根拠にしたか(出典)を表示する。
//
// 実行方法(serverフォルダで):
//   node rag/search.js "useCallbackが効かなかった原因は?"

import { readFile } from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, GENERATION_MODEL, INDEX_PATH } from "./config.js";

dotenv.config({ path: new URL("../.env", import.meta.url) });

// 回答の根拠としてGeminiに渡すチャンクの件数(Top-K)
const TOP_K = 4;

// 1位のスコアがこれ未満なら「関連する資料なし」とみなす。
// 2026-09-25に7つの質問で実測した1位のスコア(768次元・taskType指定あり・119チャンク):
//   関連する質問   : 0.7340 / 0.7375 / 0.7535 / 0.7223(日付の質問)
//   無関係な質問   : 0.5935(天気) / 0.5676(カレー) / 0.5959(Pythonスクレイピング)
// 無関係の最大(0.5959)と関連の最小(0.7223)のほぼ中間を取った値。
// まだ7件しか試していないため、資料や質問の傾向が変わったら再調整すること。
const MIN_SCORE = 0.65;

// 2つのベクトルの類似度を -1〜1 で返す(1に近いほど意味が近い)
function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// index.json を読み込み、取り込み時の設定と今の設定が一致しているかを確認する
async function loadIndex() {
  let raw;
  try {
    raw = await readFile(INDEX_PATH, "utf8");
  } catch {
    throw new Error("index.json がありません。先に `node rag/ingest.js` を実行してください");
  }
  const index = JSON.parse(raw);
  if (index.model !== EMBEDDING_MODEL || index.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `index.json の作成時の設定(${index.model} / ${index.dimensions}次元)と、` +
        `今の設定(${EMBEDDING_MODEL} / ${EMBEDDING_DIMENSIONS}次元)が違います。ingest.js をやり直してください`
    );
  }
  return index;
}

// 質問文をベクトル化する(取り込み時と同じモデル・次元数で、taskType だけ「質問」にする)
async function embedQuery(ai, query) {
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: query,
    config: {
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });
  return response.embeddings[0].values;
}

// 検索で見つかったチャンクだけを根拠に、回答を生成する(RAGのGeneration部分)
// ※回答に使うモデルを差し替えたくなったら(Claude APIなど)、この関数だけを書き換えればよい
async function generateAnswer(ai, query, hits) {
  const context = hits
    .map((hit, i) => `[${i + 1}] 出典: ${hit.source}${hit.heading ? ` 【${hit.heading}】` : ""}\n${hit.text}`)
    .join("\n\n---\n\n");

  const prompt = `あなたは学習者本人の学習メモを検索するアシスタントです。
以下の【資料】だけを根拠に、【質問】に日本語で簡潔に答えてください。
- 根拠にした資料の番号を、文末に [1] のように付けてください。
- 資料に書かれていないことは推測せず、「資料からはわかりません」と答えてください。

【資料】
${context}

【質問】
${query}`;

  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
  });
  return response.text;
}

async function main() {
  const query = process.argv[2];
  if (!query) {
    throw new Error('質問を指定してください。例: node rag/search.js "useCallbackが効かなかった原因は?"');
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("server/.env に GEMINI_API_KEY を設定してください");
  }

  const index = await loadIndex();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // ---- Retrieval:質問に近いチャンクを上位 TOP_K 件探す ----
  const queryVector = await embedQuery(ai, query);
  const ranked = index.chunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.embedding) }))
    .sort((a, b) => b.score - a.score);
  const hits = ranked.slice(0, TOP_K);

  console.log(`質問: ${query}\n`);
  console.log(`=== 検索結果(上位${TOP_K}件 / 全${index.chunks.length}件)===`);
  for (const hit of hits) {
    const preview = hit.text.replace(/\n/g, " ").slice(0, 50);
    console.log(`[${hit.score.toFixed(4)}] ${hit.id}  ${preview}…`);
  }

  // ---- 1位のスコアが低ければ、回答を生成せずに終える(ハルシネーション対策) ----
  if (hits[0].score < MIN_SCORE) {
    console.log(`\n1位のスコアが ${MIN_SCORE} 未満のため、関連する資料は見つからなかったと判断しました。`);
    return;
  }

  // ---- Generation:見つかったチャンクを根拠に回答を生成する ----
  const answer = await generateAnswer(ai, query, hits);
  console.log("\n=== 回答 ===");
  console.log(answer);

  console.log("\n=== 出典 ===");
  hits.forEach((hit, i) => {
    console.log(`[${i + 1}] ${hit.source}${hit.heading ? ` 【${hit.heading}】` : ""}`);
  });
}

main().catch((err) => {
  console.error("エラーが発生しました:", err.message);
  process.exitCode = 1;
});
