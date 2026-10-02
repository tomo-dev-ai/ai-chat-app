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

/**
 * 質問文から期間を取り出し、{ from: "YYYY-MM-DD", to: "YYYY-MM-DD" }(両端を含む)で返す。見つからなければ null
 *
 * 対応する書き方:
 *   9/10〜9/15 / 9/10~9/15 / 9月10日から9月15日   … 範囲
 *   9月10日 / 2026/9/10 など                        … 1日だけ(from と to が同じ日)
 *   9月 / 2026年9月                                 … 1か月(月初から月末まで)
 *
 * @param {string} query 質問文
 * @param {number} defaultYear 年が書かれていないときに使う年
 * @returns {{ from: string, to: string } | null}
 */
export function extractPeriod(query, defaultYear) {
  // ---- ステップ1:範囲(「〜」「～」「~」「から」で左右に分ける)----
  const parts = query.split(/〜|～|~|から/);
  if (parts.length >= 2) {
    const from = extractDate(parts[0], defaultYear);   // 左側から日付を取り出す
    const to = extractDate(parts[1], defaultYear);     // 右側から日付を取り出す
    if (from && to) {
      // "YYYY-MM-DD" は桁数がそろっているので、文字列のまま > で日付の前後を比べられる。
      // 範囲が逆のときは、下の「1日だけ」に進まず、ここで null を返す
      if (from > to) {
        return null;
      }
      return { from, to };
    }
  }

  // ---- ステップ2:1日だけ ----
  const date = extractDate(query, defaultYear);
  if (date) {
    return { from: date, to: date };
  }

  // ---- ステップ3:月(「9月」「2025年2月」)----
  const monthMatch = query.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月/);
  if (monthMatch) {
    const year = monthMatch[1] ? Number(monthMatch[1]) : defaultYear;
    const month = Number(monthMatch[2]);
    if (month < 1 || month > 12) {
      return null;
    }
    // 月末日:Date.UTC の月は0始まりなので、month(9月なら9)をそのまま渡すと「翌月」になり、
    // その0日=前月(対象の月)の末日になる。うるう年も Date が自動で考慮する
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { from: toIsoDate(year, month, 1), to: toIsoDate(year, month, lastDay) };
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
