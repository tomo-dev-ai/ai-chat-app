import type { Message } from "./message";

type Props = {
  messages: Message[];
};

function MessageList({ messages }: Props) {
  return (
    <div style={{ marginBottom: "20px" }}>
      {messages.map((msg, idx) => (
        <div
          key={idx}
          style={{
            margin: "8px 0",
            padding: "10px",
            borderRadius: "6px",
            background: msg.role === "user" ? "#e0f7fa" : "#f1f8e9",
            textAlign: msg.role === "user" ? "right" : "left",
            whiteSpace: "pre-wrap",
          }}
        >
          {msg.content}
        </div>
      ))}
    </div>
  );
}

export default MessageList;
