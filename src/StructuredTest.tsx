// src/StructuredTest.tsx
import { useState } from "react";

function StructuredTest() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"stream" | "schema">("stream");
  const [raw, setRaw] = useState("");
  const [json, setJson] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const callStreamAPI = async () => {
    setLoading(true);
    setRaw("");
    setJson(null);

    try {
      const res = await fetch("http://localhost:3000/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: [
            { role: "user", content: input }
          ]
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setRaw(fullText);
        }
      }

      try {
        const parsed = JSON.parse(fullText);
        setJson(parsed);
      } catch {
        setJson(null);
      }

    } catch (err) {
      console.error(err);
      setRaw("エラーが発生しました");
    }

    setLoading(false);
  };

  const callSchemaAPI = async () => {
    setLoading(true);
    setRaw("");
    setJson(null);

    try {
      const res = await fetch("http://localhost:3000/api/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
      });

      const text = await res.text();
      setRaw(text);

      try {
        const parsed = JSON.parse(text);
        setJson(parsed);
      } catch {
        setJson(null);
      }

    } catch (err) {
      console.error(err);
      setRaw("エラーが発生しました");
    }

    setLoading(false);
  };

  const handleSend = () => {
    if (mode === "stream") {
      callStreamAPI();
    } else {
      callSchemaAPI();
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h2>Structured Output Test</h2>

      {/* モード切り替え */}
      <div style={{ marginBottom: "10px" }}>
        <button
          onClick={() => setMode("stream")}
          style={{ marginRight: "10px", background: mode === "stream" ? "#cfc" : "#eee" }}
        >
          ストリーミングJSON
        </button>

        <button
          onClick={() => setMode("schema")}
          style={{ background: mode === "schema" ? "#cfc" : "#eee" }}
        >
          responseSchema
        </button>
      </div>

      {/* 入力欄 */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="文章を入力"
        style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
      />

      <button onClick={handleSend} disabled={loading}>
        {loading ? "処理中..." : "送信"}
      </button>

      {/* Raw Response */}
      <h3>Raw Response（生データ）</h3>
      <pre style={{ background: "#eef", padding: "10px", minHeight: "120px" }}>
        {raw || "まだデータがありません"}
      </pre>

      {/* Parsed JSON */}
      <h3>Parsed JSON</h3>
      <pre style={{ background: "#efe", padding: "10px", minHeight: "120px" }}>
        {json ? JSON.stringify(json, null, 2) : "まだJSONがありません"}
      </pre>
    </div>
  );
}

export default StructuredTest;
