// server/rag/search.js
//
// 目的:
// 学習メモのRAG検索を、コマンドラインから試すためのスクリプト。
// 検索の処理そのものは service.js にあり、ここは結果を画面に表示するだけ。
//
// 実行方法(serverフォルダで):
//   node rag/search.js "useCallbackが効かなかった原因は?"

import { askLearningNotes } from "./service.js";
import { closePool } from "./db.js";

async function main() {
  const query = process.argv[2];
  if (!query) {
    throw new Error('質問を指定してください。例: node rag/search.js "useCallbackが効かなかった原因は?"');
  }

  const result = await askLearningNotes(query);

  console.log(`質問: ${result.query}\n`);
  console.log(result.date ? `(日付 ${result.date} で絞り込み)` : "(日付での絞り込みなし)");

  if (result.status === "no_notes_for_date") {
    console.log(`${result.date} の学習メモは見つかりませんでした。`);
    return;
  }

  console.log(`=== 検索結果(${result.sources.length}件)===`);
  for (const s of result.sources) {
    console.log(`[${s.score.toFixed(4)}] ${s.id}`);
  }

  if (result.status === "no_relevant_notes") {
    console.log("\n1位のスコアが低いため、関連する資料は見つからなかったと判断しました。");
    return;
  }

  console.log("\n=== 回答 ===");
  console.log(result.answer);

  console.log("\n=== 出典 ===");
  result.sources.forEach((s, i) => {
    console.log(`[${i + 1}] ${s.source}${s.heading ? ` 【${s.heading}】` : ""}`);
  });
}

main()
  .catch((err) => {
    console.error("エラーが発生しました:", err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
