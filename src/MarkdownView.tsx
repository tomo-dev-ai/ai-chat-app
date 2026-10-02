import { memo } from "react";
import ReactMarkdown from "react-markdown";

type Props = {
  children: string;
  className?: string;
};

// AIの回答などのMarkdown文字列を、見出し・箇条書き・コードとして表示する共通コンポーネント。
// Tailwindは標準のスタイルをリセットする(Preflight)ため、見た目は @tailwindcss/typography の
// prose クラスに任せる。react-markdown は既定で文字列中の生のHTMLを描画しないので、
// AIの出力に <script> などが混ざっていても実行されない(XSS対策)。
function MarkdownView({ children, className = "" }: Props) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownView);
