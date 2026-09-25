// server/rag/chunker.js
//
// 目的:
// 学習メモなどの長い文章を、検索しやすい大きさの「チャンク」に分割する。
// ファイル読み込みやAPI呼び出しには依存せず、「文字列を受け取って配列を返す」だけにしておく
// (単体テストしやすく、別の資料・別のプロジェクトでも再利用できるようにするため)。

/**
 * ステップ1:本文を【見出し】ごとのセクションに分ける
 *
 * @param {string} text 学習メモ全体の文字列
 * @returns {{ heading: string | null, body: string }[]}
 *   heading: 【】の中身(【】は含めない)。最初の見出しより前の部分は null
 *   body:    見出し行を除いた本文(前後の空白・改行は取り除く)
 */
export function splitSections(text) {

  // 1. CRLF(\r\n)を LF(\n)にそろえる
  const normalized = text.replace(/\r\n/g, "\n");

  // 2. 1行ずつに分ける
  const lines = normalized.split("\n");

  // 3. 行を順番に見ていく
  //      見出し行(【…】だけの行)なら → それまでに溜めた行を1セクションとして確定し、新しいセクションを始める
  //      それ以外の行なら         → 今のセクションの行として溜める
  const sections = [];          // 結果の配列
  let heading = null;           // 今のセクションの見出し(最初は null)
  let bodyLines = [];           // 今のセクションに溜めている行

  const flush = () => {
    // 5. 確定するとき、本文を trim() して、空ならスキップする
    const body = bodyLines.join("\n").trim();
    if (body !== "") {
      sections.push({ heading, body });
    }
  };

  for (const line of lines) {
    const m = line.match(/^【(.+)】$/);

    if (m) {
      flush();
      heading = m[1];
      bodyLines = [];
    } else {
      bodyLines.push(line);
    }
  }

  // 4. 最後に、溜まっている分も確定する
  // 溜めた行を1セクションとして確定する(手順5:空ならスキップ)
  flush();

  return sections;
}

/**
 * ステップ2・3:長すぎる本文を、maxChars 文字以内の「ピース」に分ける
 *
 * 切る場所の優先順位(できるだけ意味のまとまりを壊さない順):
 *   1. 行(箇条書き1項目)の区切り
 *   2. 1行が長すぎる場合は「。」の区切り
 *   3. 1文でも長すぎる場合は、maxChars 文字で機械的に切る(最後の手段)
 *
 * @param {string} body 1セクション分の本文
 * @param {number} maxChars 1ピースの最大文字数
 * @returns {string[]}
 */
export function splitIntoPieces(body, maxChars) {
  // (1) まず「これ以上は分けない最小単位(ユニット)」の配列を作る
  const units = [];
  for (const line of body.split("\n")) {
    if (line.length <= maxChars) {
      units.push(line);
      continue;
    }
    // 長すぎる行は「。」の直後で切る(「。」は前の文に残す)
    const sentences = line.split(/(?<=。)/);
    for (const sentence of sentences) {
      if (sentence.length <= maxChars) {
        units.push(sentence);
      } else {
        // 1文でも長すぎる場合は maxChars 文字ずつ機械的に切る
        for (let i = 0; i < sentence.length; i += maxChars) {
          units.push(sentence.slice(i, i + maxChars));
        }
      }
    }
  }

  // (2) ユニットを、maxChars を超えない範囲で前から詰めていく
  const pieces = [];
  let current = "";
  for (const unit of units) {
    const candidate = current === "" ? unit : current + "\n" + unit;
    if (candidate.length <= maxChars) {
      current = candidate;   // まだ入る → 詰める
    } else {
      pieces.push(current);  // 入らない → 今のピースを確定して、次のピースを始める
      current = unit;
    }
  }
  if (current !== "") {
    pieces.push(current);
  }
  return pieces;
}

/**
 * ステップ4:学習メモ全体をチャンクの配列にする(このファイルの「入口」)
 *
 * - セクション(【見出し】)をまたいでは結合しない(話題の境目なので)
 * - 各チャンクの先頭に見出しを付ける(見出しの言葉でも検索に引っかかるように)
 * - 同じセクション内の2つ目以降のチャンクには、直前のピースの末尾 overlap 文字を先頭に重ねる
 *
 * @param {string} text 学習メモ全体の文字列
 * @param {{ maxChars?: number, overlap?: number }} [options]
 * @returns {{ index: number, heading: string | null, text: string }[]}
 */
export function chunkText(text, { maxChars = 400, overlap = 60 } = {}) {
  const chunks = [];
  for (const { heading, body } of splitSections(text)) {
    const pieces = splitIntoPieces(body, maxChars);
    pieces.forEach((piece, i) => {
      const overlapText = i > 0 ? pieces[i - 1].slice(-overlap) : "";
      const content = overlapText ? overlapText + "\n" + piece : piece;
      chunks.push({
        index: chunks.length,
        heading,
        text: heading ? `【${heading}】\n${content}` : content,
      });
    });
  }
  return chunks;
}
