import { useState } from "react";
import MarkdownView from "./MarkdownView";

// サーバー(/api/rag/search)が返すデータの型
type RagSource = {
  id: string;
  source: string;
  heading: string | null;
  score: number | null; // 総括型ではチャンクを検索しないので null
};

type RagResult = {
  query: string;
  mode: "search" | "summary"; // 検索型 / 総括型(サーバー側でLLMが判定)
  period: { from: string; to: string } | null;
  status: "answered" | "no_notes_for_period" | "no_relevant_notes" | "too_many_notes";
  answer: string | null;
  sources: RagSource[];
};

// 期間を「2026-09-01 〜 2026-09-30」、1日だけなら「2026-09-10」の形で表示する
function formatPeriod(period: { from: string; to: string }) {
  return period.from === period.to ? period.from : `${period.from} 〜 ${period.to}`;
}

// 学習メモのRAG検索ページ
function RagSearch() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<RagResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("http://localhost:3000/api/rag/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        // サーバーが返したエラーメッセージ(400・429・500)をそのまま表示する
        setError(data.error ?? "エラーが発生しました。");
        return;
      }
      setResult(data as RagResult);
    } catch {
      // サーバーが起動していない、ネットワークエラーなど
      setError("サーバーに接続できませんでした。server.js が起動しているか確認してください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl text-left">
      <h2 className="text-xl font-bold mb-1">学習メモ検索(RAG)</h2>
      <p className="text-sm text-gray-500 mb-4">
        学習メモの内容をもとに回答します。「9月10日には何を学んだ?」「9月に学んだことを総括して」のように日付や期間を含めると、そのメモに絞って回答します。
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          name="query"
          aria-label="質問"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={500}
          placeholder="例:useCallbackが効かなかった原因は?"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="bg-blue-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "検索中..." : "検索"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600 mb-4">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500">
            {result.mode === "summary" ? "総括" : "検索"}
            {result.period
              ? ` ・ 期間 ${formatPeriod(result.period)} のメモが対象`
              : result.mode === "summary"
                ? " ・ すべてのメモが対象"
                : ""}
          </p>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-2">回答</h3>
            {result.status === "answered" && (
              <MarkdownView>{result.answer ?? ""}</MarkdownView>
            )}
            {result.status === "no_notes_for_period" && result.period && (
              <p className="text-sm text-gray-600">{formatPeriod(result.period)} の学習メモは見つかりませんでした。</p>
            )}
            {result.status === "too_many_notes" && (
              <p className="text-sm text-gray-600">
                対象のメモが多すぎるため総括できませんでした。「9月」のように期間を絞って質問してください。
              </p>
            )}
            {result.status === "no_relevant_notes" && (
              <p className="text-sm text-gray-600">
                関連する学習メモが見つかりませんでした。質問を具体的にしてみてください。
              </p>
            )}
          </section>

          {result.status === "answered" && (
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2">出典</h3>
              <ol className="flex flex-col gap-1 text-sm">
                {result.sources.map((s, i) => (
                  <li key={s.id} className="flex gap-2">
                    <span className="text-gray-400 w-8 shrink-0">[{i + 1}]</span>
                    <span className="flex-1">
                      {s.source}
                      {s.heading && <span className="text-gray-500"> 【{s.heading}】</span>}
                    </span>
                    {s.score !== null && (
                      <span className="text-xs text-gray-400 tabular-nums">{s.score.toFixed(3)}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default RagSearch;
