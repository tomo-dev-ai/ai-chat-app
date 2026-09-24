import { memo } from "react";
import type { Message } from "./message";

type Props = {
  messages: Message[];
};

function MessageList({ messages }: Props) {
  return (
    <div className="flex flex-col gap-2 mb-5 max-h-100 overflow-y-auto">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`max-w-[75%] px-4 py-2 rounded-lg whitespace-pre-wrap ${
            msg.role === "user"
              ? "self-end bg-blue-100 text-right"
              : "self-start bg-green-50 text-left"
          }`}
        >
          {msg.content}
        </div>
      ))}
    </div>
  );
}

export default memo(MessageList);