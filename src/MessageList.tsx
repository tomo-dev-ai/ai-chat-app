import { memo } from "react";
import MarkdownView from "./MarkdownView";
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
          className={`max-w-[75%] px-4 py-2 rounded-lg ${
            msg.role === "user"
              ? "self-end bg-blue-100 text-right whitespace-pre-wrap"
              : "self-start bg-green-50 text-left"
          }`}
        >
          {/* ユーザーの入力はそのまま、AIの回答はMarkdownとして表示する */}
          {msg.role === "user" ? msg.content : <MarkdownView>{msg.content}</MarkdownView>}
        </div>
      ))}
    </div>
  );
}

export default memo(MessageList);