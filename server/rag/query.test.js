// server/rag/query.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDate, extractPeriod } from "./query.js";

test("「9月10日」は defaultYear を補って YYYY-MM-DD になる", () => {
  assert.equal(extractDate("9月10日には何を学んだ?", 2026), "2026-09-10");
});

test("「9/10」の形式にも対応する", () => {
  assert.equal(extractDate("9/10の学習内容は?", 2026), "2026-09-10");
});

test("年が書かれていれば、defaultYear より優先する", () => {
  assert.equal(extractDate("2025年9月10日は?", 2026), "2025-09-10");
  assert.equal(extractDate("2025-09-10 は?", 2026), "2025-09-10");
  assert.equal(extractDate("2025/9/10 は?", 2026), "2025-09-10");
});

test("日付がなければ null", () => {
  assert.equal(extractDate("useCallbackが効かなかった原因は?", 2026), null);
});

test("存在しない日付は null", () => {
  assert.equal(extractDate("9月31日は?", 2026), null);
  assert.equal(extractDate("13/40は?", 2026), null);
});

// ---- extractPeriod(期間の取り出し)----
// 戻り値は { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }(両端を含む)。期間がなければ null

test("期間:1日だけの指定は from と to が同じ日になる", () => {
  assert.deepEqual(extractPeriod("9月10日には何を学んだ?", 2026), { from: "2026-09-10", to: "2026-09-10" });
});

test("期間:「9月」は月初から月末まで", () => {
  assert.deepEqual(extractPeriod("9月に学んだことを総括して", 2026), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(extractPeriod("10月の振り返り", 2026), { from: "2026-10-01", to: "2026-10-31" });
});

test("期間:年つきの月。月末はうるう年も考慮する", () => {
  assert.deepEqual(extractPeriod("2025年2月の振り返り", 2026), { from: "2025-02-01", to: "2025-02-28" });
  assert.deepEqual(extractPeriod("2024年2月の振り返り", 2026), { from: "2024-02-01", to: "2024-02-29" });
});

test("期間:「〜」「~」「から」でつないだ範囲", () => {
  const expected = { from: "2026-09-10", to: "2026-09-15" };
  assert.deepEqual(extractPeriod("9/10〜9/15の内容をまとめて", 2026), expected);
  assert.deepEqual(extractPeriod("9/10~9/15の内容をまとめて", 2026), expected);
  assert.deepEqual(extractPeriod("9月10日から9月15日までに学んだこと", 2026), expected);
});

test("期間:日付も月もなければ null", () => {
  assert.equal(extractPeriod("useCallbackが効かなかった原因は?", 2026), null);
});

test("期間:存在しない月や、始まりが終わりより後の範囲は null", () => {
  assert.equal(extractPeriod("13月のまとめ", 2026), null);
  assert.equal(extractPeriod("9/15〜9/10のまとめ", 2026), null);
});
