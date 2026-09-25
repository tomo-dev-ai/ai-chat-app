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
  const flush = () => {
    // 5. 確定するとき、本文を trim() して、空ならスキップする
    const body = bodyLines.join("\n").trim();
    if (body !== "") {
      sections.push({ heading, body });
    }
  };

  const sections = [];          // 結果の配列
  let heading = null;           // 今のセクションの見出し(最初は null)
  let bodyLines = [];           // 今のセクションに溜めている行

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
