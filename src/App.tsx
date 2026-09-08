import { useState, useCallback } from "react";
import MessageList from "./MessageList";
import InputBox from "./InputBox";
import SendButton from "./SendButton";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // ★ useCallback で関数を安定化（子に渡すため）
  const handleSend = useCallback(async () => {
    if (!input.trim()) return;

    setLoading(true);
    setMessages((prev) => [...prev, `あなた: ${input}`, "AI: "]);

    try {
      const res = await fetch("http://localhost:3000/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let aiText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          aiText += decoder.decode(value, { stream: true });

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = `AI: ${aiText}`;
            return updated;
          });
        }
      }
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = "AI: エラーが発生しました";
        return updated;
      });
      console.error(error);
    }

    setInput("");
    setLoading(false);
  }, [input]);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>AI Chat App</h1>

      <MessageList messages={messages} />

      <InputBox input={input} setInput={setInput} />

      <SendButton onSend={handleSend} loading={loading} />
    </div>
  );
}

export default App;
