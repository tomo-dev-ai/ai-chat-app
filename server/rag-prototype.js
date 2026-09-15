// server/rag-prototype.js
//
// 目的:
// Embedding(文章のベクトル化)とコサイン類似度による検索(Semantic Search)を
// 最小構成で体験するための実験スクリプト。
// 「質問に関連する文書を探す」部分(Retrieval)だけを動かして仕組みを体感する回。
// 検索結果をLLMに渡して回答を生成させる部分(Generation)は、次回以降に追加する。

import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// server.js と同じく、実行時のカレントディレクトリに関わらず server/.env を読み込む
dotenv.config({ path: new URL(".env", import.meta.url) });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 検索対象のドキュメント(本来はDBやファイルから読み込むが、
// 今日はまず動かすことを優先し、実際の学習メモの内容から3件だけ手で用意する)
const DOCUMENTS = [
  {
    id: "doc1_文字化け",
    text: "PowerShellのInvoke-RestMethodがリクエスト本文をUTF-8ではなくシステム既定の文字コードで送信するため、文字化けが発生した。UTF-8のファイルを作成し--data-binaryで送る方式に変更して解決した。",
  },
  {
    id: "doc2_404エラー",
    text: "GASのWebアプリはアクセス権限がない場合、401や403ではなくあえて404エラーを返す仕様になっている。これは権限の有無を外部に漏らさないための設計。",
  },
  {
    id: "doc3_API認証",
    text: "スクリプトプロパティにAPI_SECRETを追加し、doPostの先頭でリクエストボディのsecretと照合、不一致なら処理を中断する簡易認証を実装した。",
  },
];

// テストしたい質問文(ここを書き換えて、いろいろな聞き方を試してみてください)
const QUERY = "エンコーディングの不具合の原因は何でしたか?";

// 2つのベクトルの類似度を -1〜1 で返す(1に近いほど意味が近い)
function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

// テキスト1件をベクトル化する
async function embed(text) {
  const result = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
  });
  return result.embeddings[0].values;
}

async function main() {
  console.log(`質問: ${QUERY}\n`);

  const queryVector = await embed(QUERY);

  const scored = [];
  for (const doc of DOCUMENTS) {
    const docVector = await embed(doc.text);
    const score = cosineSimilarity(queryVector, docVector);
    scored.push({ ...doc, score });
  }

  scored.sort((a, b) => b.score - a.score);

  console.log("=== 類似度が高い順 ===");
  for (const doc of scored) {
    console.log(`[${doc.score.toFixed(4)}] ${doc.id}: ${doc.text.slice(0, 40)}...`);
  }
}

main().catch((err) => {
  console.error("エラーが発生しました:", err);
});
