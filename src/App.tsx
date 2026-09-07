import { useState } from "react";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    setLoading(true);
    setMessages((prev) => [...prev, `あなた: ${input}`]);

    try {
      const res = await fetch("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, `AI: ${data.text}`]);
    } catch (error) {
      setMessages((prev) => [...prev, "AI: エラーが発生しました"]);
      console.error(error);
    }

    setInput("");
    setLoading(false);
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>AI Chat App</h1>

      <div
        style={{
          border: "1px solid #ccc",
          padding: "10px",
          minHeight: "200px",
          marginBottom: "10px",
        }}
      >
        {messages.map((msg, i) => (
          <p key={i}>{msg}</p>
        ))}
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="質問を入力..."
        style={{ width: "300px", marginRight: "10px" }}
      />
      <button onClick={handleSend} disabled={loading}>
        {loading ? "送信中..." : "送信"}
      </button>
    </div>
  );
}

export default App;