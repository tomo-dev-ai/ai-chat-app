import ReactMarkdown from "react-markdown";
import { memo } from "react";

const MessageList = memo(({ messages }: { messages: string[] }) => {
  console.log("MessageList rendered"); // デバッグ用

  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: "10px",
        minHeight: "200px",
        marginBottom: "10px",
      }}
    >
      {messages.map((msg, i) => (
        <ReactMarkdown key={i}>{msg}</ReactMarkdown>
      ))}
    </div>
  );
});

export default MessageList;
