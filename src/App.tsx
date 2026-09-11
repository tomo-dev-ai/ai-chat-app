import type { Message } from "./message";
import { useState, useCallback } from "react";
import MessageList from "./MessageList";
import InputBox from "./InputBox";
import SendButton from "./SendButton";

// サーバー(/api/chat/stream)がfunction call実行中に流す簡易マーカー。
// NUL文字で区切ることで通常のAI応答テキストと衝突しないようにしている。
const TOOL_CALL_MARKER_REGEX = /\u0000TOOL_CALL:([^\u0000]*)\u0000/g;

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  // ★ useCallback で関数を安定化（子に渡すため）
const handleSend = useCallback(async () => {
  if (!input.trim()) return;

  setLoading(true);
  setToolStatus(null);

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

        // ツール実行中マーカーを本文から取り除き、状態表示だけ更新する
        const toolCallMatches = [...chunk.matchAll(TOOL_CALL_MARKER_REGEX)];
        const visibleText = chunk.replace(TOOL_CALL_MARKER_REGEX, "");

        if (visibleText) {
          // 実テキストが届いたらツール実行中表示は消す
          setToolStatus(null);
          setMessages(prev => {
            const last = prev[prev.length - 1];
            const updatedLast = { ...last, content: last.content + visibleText };
            return [...prev.slice(0, -1), updatedLast];
          });
        } else if (toolCallMatches.length > 0) {
          setToolStatus(toolCallMatches[toolCallMatches.length - 1][1]);
        }
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

  setToolStatus(null);
  setInput("");
  setLoading(false);
}, [input, messages]);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>AI Chat App</h1>

      <MessageList messages={messages} />

      {toolStatus && (
        <div style={{ color: "#888", fontStyle: "italic", marginBottom: "10px" }}>
          🔧 ツール実行中 ({toolStatus})
        </div>
      )}

      <InputBox input={input} setInput={setInput} />

      <SendButton onSend={handleSend} loading={loading} />
    </div>
  );
}

export default App;
