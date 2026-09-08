function SendButton({
  onSend,
  loading,
}: {
  onSend: () => void;
  loading: boolean;
}) {
  return (
    <button onClick={onSend} disabled={loading}>
      {loading ? "送信中..." : "送信"}
    </button>
  );
}

export default SendButton;
