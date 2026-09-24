import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  // この値が変わったらエラー状態をリセットする(ページ移動時のリセットに使う)
  resetKey?: unknown;
};

type State = {
  error: Error | null;
};

// 子孫コンポーネントのレンダリング中に起きたエラーを受け止め、代わりの画面を表示する。
// Error Boundary は 2026年時点でもクラスコンポーネントでしか書けない。
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  // ① エラーが起きたら、次のレンダリングで使う state を返す(ここでは表示の切り替えだけ)
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  // ② エラーの記録(副作用)はここで行う。本番では Sentry などの監視サービスに送る
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  // ③ resetKey(URL)が変わったら、エラー状態を解除する
  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  // 「再試行」ボタン用。アロー関数にして this を固定する
  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="p-6 text-left">
          <h2 className="text-xl font-bold text-red-600 mb-2">
            画面の表示中にエラーが発生しました
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            「再試行」を押すか、左のメニューから別のページに移動してください。
          </p>
          {/* 開発中だけエラー内容を表示する(本番ではユーザーに見せない) */}
          {import.meta.env.DEV && (
            <pre className="text-xs bg-gray-100 text-gray-700 p-3 rounded mb-4 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.reset}
            className="bg-blue-500 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-600"
          >
            再試行
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;