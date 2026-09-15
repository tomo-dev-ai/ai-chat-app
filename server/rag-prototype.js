// server/rag-prototype.js
//
// 目的:
// Embedding(文章のベクトル化)とコサイン類似度による検索(Retrieval)に加えて、
// 検索結果をGeminiに渡して実際に回答させる(Generation)ところまでを、
// 最小構成で体験する実験スクリプト。
//
// 「関連資料が見つかったかどうか」の判定は、以下の2段構えにしている。
//   1. 1位の絶対スコアが低い(MIN_SCORE未満) → そもそも関連資料なし → 正直に「わからない」
//   2. 1位のスコアは十分高いが、1位と2位が僅差(GAP_THRESHOLD未満) → 複数の資料が同程度に
//      関連している可能性がある → 1位を根拠に回答はするが、その旨を注記する
// (差だけで判定すると、「全部無関係で団子」と「全部関連していて団子」を区別できないため)
//
// doc4_テスト用_類似資料 は、上記2の分岐(複数候補あり)を実際に再現するために、
// doc1と話題が近くなるよう意図的に作ったテスト用データ。実際の学習メモの内容ではない。

import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// server.js と同じく、実行時のカレントディレクトリに関わらず server/.env を読み込む
dotenv.config({ path: new URL(".env", import.meta.url) });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 検索対象のドキュメント(本来はDBやファイルから読み込むが、
// 今日はまず動かすことを優先し、実際の学習メモの内容から3件 + テスト用1件を手で用意する)
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
  {
    id: "doc4_テスト用_類似資料",
    text: "curlでPOSTリクエストを送る際、Content-Typeヘッダーにcharset=utf-8を明示しないと、サーバー側で文字コードの解釈がずれて日本語部分が正しく読み込まれないことがある。ヘッダーにcharsetを明記することで解決した。",
  },
];

// テストしたい質問文(ここを書き換えて、いろいろな聞き方を試してみてください。
// 資料に全く関係ない質問(例:「今日の天気は?」)に変えると、
// 「わからない」の分岐がどう動くかも確認できます)
const QUERY = "エンコーディングの不具合の原因は何でしたか?";

// 1位のスコアがこれ未満なら、そもそも関連資料がないとみなす暫定値。
// 今日実際に取れた2パターン(関連質問:1位0.6005 / 無関係質問:1位0.5113)の間を取った値。
// まだサンプルが2件しかないため、今後実データが増えたら調整が必要。
const MIN_SCORE = 0.55;

// 1位と2位のスコア差がこれ未満なら「複数の資料が同程度に関連しているかもしれない」とみなす暫定値。
// 【一時的に0.03→0.04に変更中】doc1(0.6005)とdoc4(0.6363)の差が0.0358で、
// 0.03だと「注記」分岐が発火しなかったため、旧ロジック(差だけで判定)と新ロジック
// (絶対スコア+差の2段構え)の違いを実際に再現して検証するための一時的な値。
// 検証が終わったら、この値のままにするか元に戻すかを改めて判断する。
const GAP_THRESHOLD = 0.04;

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

// 採用した資料だけを根拠に、Geminiに回答を生成させる(RAGのGeneration部分)
async function generateAnswer(query, contextDoc) {
  const prompt = `以下の資料だけを根拠に、質問に日本語で簡潔に答えてください。
資料に書かれていないことは、推測で答えずに「資料からはわかりません」と正直に答えてください。

【資料】
${contextDoc.text}

【質問】
${query}`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: prompt,
  });

  return response.text;
}

async function main() {
  console.log(`質問: ${QUERY}\n`);

  // ---- Retrieval: 質問に近い資料を探す ----
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

  const [top, second] = scored;
  const gap = second ? top.score - second.score : Infinity;
  console.log(`\n1位のスコア: ${top.score.toFixed(4)}(下限: ${MIN_SCORE})`);
  console.log(`1位と2位のスコア差: ${gap.toFixed(4)}(閾値: ${GAP_THRESHOLD})`);

  // ---- 1. 1位のスコア自体が低い → そもそも関連資料がない ----
  if (top.score < MIN_SCORE) {
    console.log("\n=== 回答 ===");
    console.log("関連する資料が見つかりませんでした。質問を具体的にしてみてください。");
    return;
  }

  // ---- 2. 1位は十分高いが、僅差 → 複数候補がある旨を注記(回答は続行) ----
  if (gap < GAP_THRESHOLD) {
    console.log(
      "\n(注記:上位の資料同士のスコアが僅差でした。複数の資料が同程度に関連している可能性があります。今回は最上位の資料のみを根拠にしています)"
    );
  }

  // ---- Generation: 採用した資料を根拠にGeminiへ回答させる ----
  console.log(`\n採用した資料: ${top.id}`);
  const answer = await generateAnswer(QUERY, top);

  console.log("\n=== 回答 ===");
  console.log(answer);
}

main().catch((err) => {
  console.error("エラーが発生しました:", err);
});
