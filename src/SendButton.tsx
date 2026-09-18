function SendButton({
  onSend,
  loading,
}: {
  onSend: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onSend}
      disabled={loading}
      className="bg-blue-500 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? "送信中..." : "送信"}
    </button>
  );
}

export default SendButton;
