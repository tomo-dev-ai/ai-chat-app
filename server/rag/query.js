// server/rag/query.js
//
// 質問文の解析。今は「質問に含まれる日付」を取り出すだけ。
// ファイルやAPIに依存しない純粋な関数にして、単体テストできるようにしている。

/**
 * 質問文から日付を1つ取り出し、"YYYY-MM-DD" 形式で返す。見つからなければ null
 *
 * 対応する書き方:
 *   2026-09-10 / 2026/9/10 / 2026年9月10日   … 年あり
 *   9月10日 / 9/10                           … 年なし(defaultYear を使う)
 *
 * @param {string} query 質問文
 * @param {number} defaultYear 年が書かれていないときに使う年
 * @returns {string | null}
 */
export function extractDate(query, defaultYear) {
  // 年あり(先に調べる。そうしないと「2026/9/10」の「9/10」だけを拾ってしまう)
  const withYear = query.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/);
  if (withYear) {
    return toIsoDate(Number(withYear[1]), Number(withYear[2]), Number(withYear[3]));
  }
  // 年なし
  const withoutYear = query.match(/(\d{1,2})\s*[/月]\s*(\d{1,2})/);
  if (withoutYear) {
    return toIsoDate(defaultYear, Number(withoutYear[1]), Number(withoutYear[2]));
  }
  return null;
}

// 年・月・日の数値を "YYYY-MM-DD" にする。存在しない日付(9月31日など)は null
function toIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isValid) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
