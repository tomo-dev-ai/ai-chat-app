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
      style={{ width: "300px", marginRight: "10px" }}
    />
  );
}

export default InputBox;
