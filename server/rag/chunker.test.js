// server/rag/chunker.test.js
//
// chunker.js の単体テスト。Node.js標準のテストランナー(node:test)を使うので、
// 追加のインストールは不要。serverフォルダで `node --test` を実行すると動く。

import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSections } from "./chunker.js";

test("【見出し】ごとにセクションに分かれる", () => {
  const text = "【A】\nあ\nい\n【B】\nう";
  assert.deepEqual(splitSections(text), [
    { heading: "A", body: "あ\nい" },
    { heading: "B", body: "う" },
  ]);
});

test("最初の見出しより前の文章は heading が null になる", () => {
  const text = "前書き\n【A】\nあ";
  assert.deepEqual(splitSections(text), [
    { heading: null, body: "前書き" },
    { heading: "A", body: "あ" },
  ]);
});

test("本文の前後の空白・改行は取り除き、本文が空のセクションは返さない", () => {
  const text = "\n\n【A】\n\n  あ  \n\n【B】\n   \n【C】\nう\n";
  assert.deepEqual(splitSections(text), [
    { heading: "A", body: "あ" },
    { heading: "C", body: "う" },
  ]);
});

test("Windowsの改行(CRLF)でも正しく分かれる", () => {
  const text = "【A】\r\nあ\r\nい\r\n【B】\r\nう\r\n";
  assert.deepEqual(splitSections(text), [
    { heading: "A", body: "あ\nい" },
    { heading: "B", body: "う" },
  ]);
});

test("見出しが1つもない場合は、全体が1つのセクションになる", () => {
  assert.deepEqual(splitSections("あ\nい"), [{ heading: null, body: "あ\nい" }]);
});

test("行の途中にある【】は見出しとして扱わない", () => {
  const text = "【A】\nこれは【重要】な話\nです";
  assert.deepEqual(splitSections(text), [
    { heading: "A", body: "これは【重要】な話\nです" },
  ]);
});
