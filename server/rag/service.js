// server/rag/service.js
//
// 学習メモのRAG検索の本体。「質問を受け取り、検索して、回答と出典を返す」だけを担当し、
// 画面表示(console.log)やHTTPのことは知らない。
// → コマンドライン(search.js)と Web API(server.js の /api/rag/search)の両方から同じ処理を使える。

import { GoogleGenAI } from "@google/genai";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, GENERATION_MODEL } from "./config.js";
import { getPool, toVector } from "./db.js"; // server/.env もここで読み込まれる
import { extractDate } from "./query.js";

// 回答の根拠としてGeminiに渡すチャンクの件数(Top-K)
const TOP_K = 4;

// 質問に日付が含まれるときは、その日のメモ全体を見られるように件数を増やす
// (1日分のメモは 5〜18 チャンク程度)
const TOP_K_WITH_DATE = 20;

// 1位のスコアがこれ未満なら「関連する資料なし」とみなす。
// 2026-09-25に7つの質問で実測した1位のスコア(768次元・taskType指定あり・119チャンク):
//   関連する質問   : 0.7340 / 0.7375 / 0.7535 / 0.7223(日付の質問)
//   無関係な質問   : 0.5935(天気) / 0.5676(カレー) / 0.5959(Pythonスクレイピング)
// 無関係の最大(0.5959)と関連の最小(0.7223)のほぼ中間を取った値。
// まだ7件しか試していないため、資料や質問の傾向が変わったら再調整すること。
const MIN_SCORE = 0.65;

let ai = null;
function getAi() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("server/.env に GEMINI_API_KEY を設定してください");
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

// 質問文をベクトル化する(取り込み時と同じモデル・次元数で、taskType だけ「質問」にする)
async function embedQuery(query) {
  const response = await getAi().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: query,
    config: {
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });
  return response.embeddings[0].values;
}

// 質問ベクトルに近いチャンクを、PostgreSQL で上位 limit 件取り出す
// <=> は pgvector の「コサイン距離」(0に近いほど似ている)。1 - 距離 = コサイン類似度
// date を指定したときは、その日付のチャンクだけに絞り込んでから並べる(null なら絞り込まない)
async function searchChunks(queryVector, limit, date = null) {
  const { rows } = await getPool().query(
    `SELECT id, source, heading, content AS text,
            1 - (embedding <=> $1::vector) AS score
       FROM chunks
      WHERE ($3::date IS NULL OR date = $3::date)
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    [toVector(queryVector), limit, date]
  );
  return rows;
}

// 検索で見つかったチャンクだけを根拠に、回答を生成する(RAGのGeneration部分)
// ※回答に使うモデルを差し替えたくなったら(Claude APIなど)、この関数だけを書き換えればよい
async function generateAnswer(query, hits) {
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

  const response = await getAi().models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
  });
  return response.text;
}

/**
 * 学習メモを検索して回答する
 * @param {string} query 質問文
 * @returns {Promise<{
 *   query: string,
 *   date: string | null,                      // 質問から取り出した日付(なければ null)
 *   status: "answered" | "no_notes_for_date" | "no_relevant_notes",
 *   answer: string | null,                    // 回答(status が answered のときだけ)
 *   sources: { id: string, source: string, heading: string | null, score: number }[]
 * }>}
 */
export async function askLearningNotes(query) {
  // 質問に日付があれば取り出す(年が書かれていなければ今年とみなす)
  const date = extractDate(query, new Date().getFullYear());
  const limit = date ? TOP_K_WITH_DATE : TOP_K;

  const queryVector = await embedQuery(query);
  const hits = await searchChunks(queryVector, limit, date);
  const sources = hits.map(({ id, source, heading, score }) => ({ id, source, heading, score }));

  if (hits.length === 0) {
    if (date) {
      return { query, date, status: "no_notes_for_date", answer: null, sources };
    }
    throw new Error("chunks テーブルが空です。先に `node rag/ingest.js` を実行してください");
  }

  // 1位のスコアが低ければ、回答を生成せずに終える(ハルシネーション対策)
  // ただし日付で絞り込んだ場合は、「その日のメモである」こと自体が関連の根拠になるため判定しない
  if (!date && hits[0].score < MIN_SCORE) {
    return { query, date, status: "no_relevant_notes", answer: null, sources };
  }

  const answer = await generateAnswer(query, hits);
  return { query, date, status: "answered", answer, sources };
}
