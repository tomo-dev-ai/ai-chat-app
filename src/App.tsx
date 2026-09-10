import type { Message } from "./message";
import { useState, useCallback } from "react";
import MessageList from "./MessageList";
import InputBox from "./InputBox";
import SendButton from "./SendButton";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // ★ useCallback で関数を安定化（子に渡すため）
const handleSend = useCallback(async () => {
  if (!input.trim()) return;

  setLoading(true);

  const newUserMessage: Message = { role: "user", content: input };

  // 今回のユーザー発言を含めた、サーバーに送る会話履歴
  const historyToSend = [...messages, newUserMessage];

  // 画面表示用：ユーザー発言 + AI応答の空枠を追加
  setMessages(prev => [
    ...prev,
    newUserMessage,
    { role: "assistant", content: "" }
  ]);

  try {
    const res = await fetch("http://localhost:3000/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: historyToSend }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder("utf-8");

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        setMessages(prev => {
          const last = prev[prev.length - 1];
          const updatedLast = { ...last, content: last.content + chunk };
          return [...prev.slice(0, -1), updatedLast];
        });
      }
    }
  } catch (error) {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      const updatedLast = { ...last, content: "エラーが発生しました" };
      return [...prev.slice(0, -1), updatedLast];
    });
    console.error(error);
  }

  setInput("");
  setLoading(false);
}, [input, messages]);

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
