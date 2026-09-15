# AI Chat App (React + TypeScript + Vite + Gemini API)

Gemini API を使ったAIチャットアプリです。React + TypeScript + Vite のフロントエンドと、Express製のバックエンド(`server/`)で構成されています。

## 主な機能

- **チャット(ストリーミング)**: `/api/chat/stream` による会話履歴保持・system prompt対応のストリーミング応答
- **structured output**: `responseSchema`によるJSON形式での応答生成(テストページ: [src/StructuredTest.tsx](src/StructuredTest.tsx)、テストスクリプト: [server/test-structured.js](server/test-structured.js))
- **function calling**: LLMが関数呼び出しを判断し、実行結果をもとに最終回答を生成するAPI(`/api/fc`、テストスクリプト: [server/test-function.js](server/test-function.js))
- **利用トークン・コストのログ記録**: `usageMetadata`をもとに入出力トークン数とコスト(USD)を算出・記録する`calculateCost`/`logUsage`(`server/server.js`)

## セットアップ

### 1. 依存パッケージのインストール

```bash
# フロントエンド(ルート)
npm install

# バックエンド
cd server
npm install
```

### 2. 環境変数の設定

`server/.env` に Gemini API キーを設定します(`.env`はgitignore対象です)。

```
GEMINI_API_KEY=your-api-key-here
```

### 3. 起動

```bash
# バックエンド(http://localhost:3000)
cd server
node server.js

# フロントエンド(別ターミナルでルートから)
npm run dev
```

## API エンドポイント(`server/server.js`)

| エンドポイント | 概要 |
| --- | --- |
| `POST /api/chat` | 単発プロンプトに対する応答を返す |
| `POST /api/chat/stream` | 会話履歴(`history`)とsystem promptをもとにストリーミング応答を返す |
| `POST /api/json` | `responseSchema`を使い、structured output(JSON)を返す |
| `POST /api/fc` | 会話履歴をもとにfunction callingを実行し、必要に応じて関数の実行結果を踏まえた最終回答を返す。トークン数・コストを含む`usage`情報も返す |

いずれのエンドポイントも `usageMetadata` をもとにトークン数・コスト(USD)をサーバーログに出力します。

## RAGプロトタイプ(`server/rag-prototype.js`)

Embedding(文章のベクトル化)とコサイン類似度による検索(Retrieval)に加えて、検索結果をGeminiに渡して実際に回答させる(Generation)ところまでを体験する実験用スクリプトです。上記のAPIエンドポイントとは独立しており、単体で実行して動作を確認するためのものです。

### 実行方法

```bash
cd server
node rag-prototype.js
```

### 仕組み

- 検索対象(`DOCUMENTS`)は、実際の学習メモ3件+動作検証用のテストデータ1件を手動で用意したもの
- 質問文(`QUERY`)と各ドキュメントをそれぞれEmbeddingし、コサイン類似度が最も高いドキュメントを検索
- 「関連資料が見つかったかどうか」を2段構えで判定
  - 1位の絶対スコアが`MIN_SCORE`未満 → そもそも関連資料なしとみなし、正直に「わからない」と回答
  - 1位のスコアは十分高いが、1位と2位のスコア差が`GAP_THRESHOLD`未満 → 複数の資料が同程度に関連している可能性がある旨を注記したうえで、最上位の資料を根拠に回答(差だけで判定すると「全部無関係で団子」と「全部関連していて団子」を区別できないため、絶対スコアとの2段構えにしている)
- 採用した資料のみを根拠にGeminiへ日本語で簡潔に回答させる(資料に書かれていない内容は推測せず「資料からはわかりません」と答えるようプロンプトで指示)

### 設計上の注意点

`MIN_SCORE`・`GAP_THRESHOLD`は、現時点では少数のテストサンプルから決めた暫定値です。実データが増えた際は、値の見直しが必要です。

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
