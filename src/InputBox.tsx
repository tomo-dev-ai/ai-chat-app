function InputBox({
  input,
  setInput,
}: {
  input: string;
  setInput: (v: string) => void;
}) {
  return (
    <input
      value={input}
      onChange={(e) => setInput(e.target.value)}
      placeholder="質問を入力..."
      className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  );
}

export default InputBox;
