// server/rag/chunker.test.js
//
// chunker.js の単体テスト。Node.js標準のテストランナー(node:test)を使うので、
// 追加のインストールは不要。serverフォルダで `node --test` を実行すると動く。

import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSections, splitIntoPieces, chunkText } from "./chunker.js";

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

// ---- ステップ2・3:splitIntoPieces ----

test("maxChars 以内の本文は、1ピースのまま", () => {
  assert.deepEqual(splitIntoPieces("あいう\nえお", 10), ["あいう\nえお"]);
});

test("長い本文は、行の区切りで maxChars 以内にまとめ直す", () => {
  // 各行4文字、改行込みで「4+1+4=9文字」までは1ピースに入る
  const body = "ああああ\nいいいい\nうううう";
  assert.deepEqual(splitIntoPieces(body, 10), ["ああああ\nいいいい", "うううう"]);
});

test("1行が長すぎる場合は「。」の直後で切る", () => {
  const body = "あいうえお。かきくけこ。さしす";
  assert.deepEqual(splitIntoPieces(body, 8), ["あいうえお。", "かきくけこ。", "さしす"]);
});

test("「。」がなく1文が長すぎる場合は、maxChars 文字ずつ機械的に切る", () => {
  assert.deepEqual(splitIntoPieces("あいうえおかきくけこ", 4), ["あいうえ", "おかきく", "けこ"]);
});

// ---- ステップ4:chunkText ----

test("短いセクションは1チャンクずつになり、先頭に見出しが付き、index は通し番号", () => {
  const text = "【A】\nあ\n【B】\nい";
  assert.deepEqual(chunkText(text), [
    { index: 0, heading: "A", text: "【A】\nあ" },
    { index: 1, heading: "B", text: "【B】\nい" },
  ]);
});

test("同じセクション内の2つ目以降のチャンクは、直前の末尾 overlap 文字を先頭に重ねる", () => {
  const text = "【A】\nああああ\nいいいい\nうううう";
  const chunks = chunkText(text, { maxChars: 10, overlap: 2 });
  assert.deepEqual(chunks.map((c) => c.text), [
    "【A】\nああああ\nいいいい",
    "【A】\nいい\nうううう", // 「いい」が前のチャンクの末尾2文字
  ]);
});

test("見出しのない部分は、見出しを付けずに本文だけになる", () => {
  assert.deepEqual(chunkText("前書き"), [{ index: 0, heading: null, text: "前書き" }]);
});
