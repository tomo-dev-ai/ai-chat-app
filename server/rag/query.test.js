// server/rag/query.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDate } from "./query.js";

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
