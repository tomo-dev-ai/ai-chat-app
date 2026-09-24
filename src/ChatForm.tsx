import { useState } from "react";
import InputBox from "./InputBox";
import SendButton from "./SendButton";

type Props = {
  onSend: (text: string) => Promise<void>;
  loading: boolean;
};

// 入力中の文字(input)をこのコンポーネントの中だけで管理する。
// 1文字打つたびの再レンダリングがChatFormの中で完結し、親のAppまで広がらない。
function ChatForm({ onSend, loading }: Props) {
  const [input, setInput] = useState("");

  const handleSubmit = async () => {
    if (!input.trim()) return;
    await onSend(input); // 送信処理そのものは親(App)に任せ、文字列だけ渡す
    setInput("");
  };

  return (
    <div className="flex gap-2">
      <InputBox input={input} setInput={setInput} />
      <SendButton onSend={handleSubmit} loading={loading} />
    </div>
  );
}

export default ChatForm;