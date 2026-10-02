# AI Chat App (React + TypeScript + Vite + Gemini API)

Gemini API を使ったAIチャットアプリです。React + TypeScript + Vite のフロントエンドと、Express製のバックエンド(`server/`)で構成されています。

## 主な機能

- **チャット(ストリーミング)**: `/api/chat/stream` による会話履歴保持・system prompt対応のストリーミング応答
- **structured output**: `responseSchema`によるJSON形式での応答生成(テストページ: [src/StructuredTest.tsx](src/StructuredTest.tsx)、テストスクリプト: [server/test-structured.js](server/test-structured.js))
- **function calling**: LLMが関数呼び出しを判断し、実行結果をもとに最終回答を生成するAPI(`/api/fc`、テストスクリプト: [server/test-function.js](server/test-function.js))
- **利用トークン・コストのログ記録**: `usageMetadata`をもとに入出力トークン数とコスト(USD)を算出・記録する`calculateCost`/`logUsage`(`server/server.js`)
- **RAG(学習メモ検索)**: 自分の学習メモを分割・ベクトル化してPostgreSQL(pgvector)に保存し、質問に対して出典つきで回答する(画面: `/rag`、API: `/api/rag/search`、コマンドライン版もあり。詳細は[後述](#rag学習メモ検索serverrag))

## 画面構成(フロントエンド)

| URL | ページ | 内容 |
| --- | --- | --- |
| `/` | チャット([src/App.tsx](src/App.tsx)) | 会話履歴付きのストリーミングチャット。function calling実行中は「ツール実行中」を表示 |
| `/rag` | 学習メモ検索([src/RagSearch.tsx](src/RagSearch.tsx)) | 学習メモへの質問と、出典(ファイル名・見出し・スコア)の表示 |
| `/structured` | [src/StructuredTest.tsx](src/StructuredTest.tsx) | structured output(JSON応答)の動作確認 |
| `/test` | [src/Test.tsx](src/Test.tsx) | フォーム・useReducer・Context・カスタムフックの練習用ページ。Error Boundaryの動作確認ボタンあり |
| `/tanstack` | [src/TanStackQueryTest.tsx](src/TanStackQueryTest.tsx) | TanStack Queryのキャッシュ(staleTime)・楽観的更新・URLクエリによる並び替えの動作確認 |

## フロントエンドの設計

- **ルーティング**: React Router。ルート定義は[src/AppRoutes.tsx](src/AppRoutes.tsx)、共通レイアウト(ヘッダー・サイドメニュー・フッター)は[src/Layout.tsx](src/Layout.tsx)
- **スタイリング**: Tailwind CSS v4。Viteのひな形由来の基本スタイル([src/index.css](src/index.css))は`@layer base`に置き、Tailwindのクラスが優先されるようにしている
- **コード分割**: チャット以外のページは`React.lazy` + `Suspense`で、開いたときに読み込む。初回に読み込むJSを276.65 kB → 234.88 kB(約15%)削減
- **エラーハンドリング**:
  - 画面のレンダリング中のエラーは、ページ単位のError Boundary([src/ErrorBoundary.tsx](src/ErrorBoundary.tsx))で受け止める。エラー時もヘッダー・メニューは残り、「再試行」またはページ移動で復帰できる
  - API通信のエラーは、送信処理(`handleSend`)内の`try-catch`で処理し、チャット上に「エラーが発生しました」と表示する
- **パフォーマンス**(React Developer ToolsのProfilerで計測したうえで対応):
  - 入力中の文字(`input`)のstateを[src/ChatForm.tsx](src/ChatForm.tsx)に閉じ込め(state colocation)、1文字入力するたびにApp全体が再レンダリングされないようにした
  - メッセージ一覧([src/MessageList.tsx](src/MessageList.tsx))は`React.memo`で、入力中の不要な再レンダリングを防止
  - React Compilerは未導入のため、必要な箇所のみ手動でメモ化している
- **Markdown表示**: AIの回答は共通コンポーネント[src/MarkdownView.tsx](src/MarkdownView.tsx)(`react-markdown` + `@tailwindcss/typography`の`prose`)で表示し、チャットと`/rag`で見た目をそろえている。生のHTMLは描画しない(`rehype-raw`は使わない)ため、AIの出力にHTMLが混ざっても実行されない
- **ツール実行中の表示**: サーバーは、function calling実行中にNUL文字(`\u0000`)で囲んだ`TOOL_CALL:関数名`を本文に混ぜて送信し、フロントでこれを取り除いて「ツール実行中」の表示に使っている

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

`server/.env.example` をコピーして `server/.env` を作り、値を設定します(`.env`はgitignore対象です)。

```
GEMINI_API_KEY=your-api-key-here
# 以下はRAG機能を使う場合のみ
RAG_DATA_DIR=C:\work\学習\202609
DATABASE_URL=postgres://rag:パスワード@127.0.0.1:5432/ragdb
```

### 3. 起動

```bash
# バックエンド(http://localhost:3000)
cd server
node server.js

# フロントエンド(別ターミナルでルートから)
npm run dev
```

### 4. 静的解析

```bash
npm run lint
```

ESLint(`react-hooks`のルールを含む)でコードをチェックします。コミット前の実行を推奨します。

## API エンドポイント(`server/server.js`)

| エンドポイント | 概要 |
| --- | --- |
| `POST /api/chat` | 単発プロンプトに対する応答を返す |
| `POST /api/chat/stream` | 会話履歴(`history`)とsystem promptをもとにストリーミング応答を返す |
| `POST /api/json` | `responseSchema`を使い、structured output(JSON)を返す |
| `POST /api/rag/search` | 学習メモのRAG検索。`{ query }`を受け取り、回答・出典・状態(`answered` / `no_notes_for_date` / `no_relevant_notes`)を返す。質問は空・500文字超を400で拒否 |
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

## RAG(学習メモ検索、`server/rag/`)

自分の学習メモ(`YYYYMMDD_学習メモ.txt`)を対象にして、「useCallbackが効かなかった原因は?」のような**検索型**の質問と、「9月に学んだことを総括して」のような**総括型**の質問の両方に、**根拠となったメモの出典つき**で回答します(画面: `/rag`、コマンドライン: `search.js`)。

### 構成

```mermaid
flowchart LR
  subgraph 取り込み["取り込み(ingest.js / 資料が変わったときに1回)"]
    A[学習メモ .txt] --> B[前処理<br/>定型文の除去・見出しの統一]
    B --> C[chunker.js<br/>見出し→行→句点で分割<br/>+オーバーラップ]
    C --> D[Gemini Embedding<br/>768次元]
  end
  D --> E[(PostgreSQL + pgvector<br/>chunks テーブル)]
  subgraph 質問["質問のたび(service.js)"]
    Q[質問] --> P[期間を取り出す<br/>extractPeriod]
    P --> K{質問の種類<br/>Geminiで判定}
    K -- 検索型 --> F[Gemini Embedding]
    F --> G[SQLでコサイン距離が<br/>近い順に上位4件<br/>期間ありは最大20件]
    G --> H{1位のスコア<br/>≥ 0.65 ?}
    H -- No --> I[関連資料なしと回答]
    H -- Yes --> J[Geminiで回答生成<br/>出典番号つき]
    K -- 総括型 --> S[期間内のチャンクを<br/>日付順にすべて取得]
    S --> T[Geminiでテーマ別に要約<br/>日付つき]
  end
  E --> G
  E --> S
```

| ファイル | 役割 |
| --- | --- |
| [server/rag/chunker.js](server/rag/chunker.js) | 文章をチャンクに分割する(ファイル・APIに依存しない純粋な関数。単体テストあり) |
| [server/rag/ingest.js](server/rag/ingest.js) | 学習メモの読み込み → 前処理 → 分割 → Embedding → DBに保存 |
| [server/rag/service.js](server/rag/service.js) | 本体。期間の取り出し → 質問の種類の判定 → 検索型ならpgvectorで検索、総括型なら期間内を全件取得 → 出典つきで回答生成し、結果を値として返す(画面表示やHTTPには依存しない) |
| [server/rag/search.js](server/rag/search.js) | コマンドライン版。service.js を呼んで結果を表示するだけ |
| [server/rag/query.js](server/rag/query.js) | 質問文から日付・期間(範囲・1日・月)を取り出す(単体テストあり) |
| [server/rag/db.js](server/rag/db.js) | PostgreSQLへの接続(Pool) |
| [server/rag/config.js](server/rag/config.js) | 取り込みと検索で共通の設定(モデル名・次元数) |
| [compose.yaml](compose.yaml) / [db/init/01_schema.sql](db/init/01_schema.sql) | 開発用DB(PostgreSQL 18 + pgvector)の起動設定とテーブル定義 |

### セットアップと実行

```bash
# 1. 開発用DBの起動(Docker Desktopが必要。初回のみ .env.example をコピーして .env を作り、POSTGRES_PASSWORD を設定)
docker compose up -d

# 2. 学習メモの取り込み(server/.env に RAG_DATA_DIR と DATABASE_URL が必要。
#    RAG_DATA_DIR の直下と、その中の月フォルダ(202609 など)にある YYYYMMDD_学習メモ.txt が対象)
cd server
node rag/ingest.js

# 3. 質問する
node rag/search.js "useCallbackが効かなかった原因は?"
node rag/search.js "9月10日には何を学んだ?"   # 日付を含む質問は、その日のメモに絞って検索
node rag/search.js "9月に学んだことを総括して" # 総括型:期間内のメモ全体を要約

# 単体テスト(chunker.js / query.js)
npm test
```

### 設計上の判断

- **チャンク分割**: まず【見出し】単位で分け、400文字を超える部分だけ「行 → 句点 → 文字数」の順で細かく切る(再帰的分割)。各チャンクの先頭に日付と見出しを付け、同じ見出し内では前のチャンクの末尾60文字を重ねて、文脈の切れ目を和らげている
- **ノイズの除去**: 各メモ冒頭の「タイトル・日付」だけの短いチャンクが、無関係な質問で上位に来てしまったため、取り込み時に除外し、日付は全チャンクの先頭に付ける形に変更した
- **Embeddingの次元数**: `gemini-embedding-001`の既定は3072次元だが、768次元に縮めている(保存サイズと計算量が1/4になり、pgvectorのHNSWインデックスの上限である2000次元にも収まるため)。取り込み時は`RETRIEVAL_DOCUMENT`、質問時は`RETRIEVAL_QUERY`を指定
- **関連資料なしの判定(ハルシネーション対策)**: 1位のスコアが`MIN_SCORE`(0.65)未満なら回答を生成しない。値は7つの質問の実測値(関連: 0.72〜0.75、無関係: 0.57〜0.60)の中間から決めた。さらにプロンプトでも「資料にないことは推測しない」と指示する2段構え
- **APIの回数制限**: Embeddingの無料枠は「1分あたり100件」で、まとめて送っても件数で数えられる。429エラーのときだけ、エラーに含まれる待ち時間だけ待って最大3回再試行する(認証エラーなど、待っても直らないエラーは再試行しない)
- **日付での絞り込み(SQL+ベクトル検索の組み合わせ)**: ベクトル検索は「意味の近さ」で比べるため、「9月10日」と「2026-09-10」を厳密に照合できず、別の日のメモが上位に来ることがあった。質問から日付を取り出せた場合は`WHERE date = ...`で絞り込んでからベクトルの近さで並べ、その日のメモ全体(最大20件)を根拠にする。この場合は「その日のメモであること」自体が関連の根拠になるため、`MIN_SCORE`の判定は行わない
- **期間の指定**: 「9/10〜9/15」「9月10日から9月15日」(範囲)、「9月10日」(1日)、「9月」「2025年2月」(月)を`extractPeriod`で取り出し、`WHERE date BETWEEN`で絞り込む。範囲 → 1日 → 月の順に調べる(「9月10日」に「9月」が含まれるため)
- **質問の種類の判定(検索型/総括型)**: ベクトル検索は「答えが書いてある場所を探す」のは得意だが、上位数件しか渡さないため「全体をまとめる」質問には向かない。そこで、Geminiのstructured output(`enum: ["search", "summary"]`、`temperature: 0`)で質問の種類を判定し、処理を切り替える。キーワード判定よりも言い回しの揺れに強い。判定に失敗したときは検索型として続ける(フォールバック)。代わりに、1回の質問でのAPI呼び出しが1回増える
- **総括型の処理**: 期間内のチャンクを日付順・メモ内の順番どおりに**すべて**取り出し、1回でGeminiに渡して、テーマ別・日付つきで要約させる(stuff方式)。9月分(13日)で約4.5万文字と、モデルの入力上限に十分収まるため。`id`は文字列で`#10`が`#2`より先に並ぶため、`split_part(id, '#', 2)::int`で数値として並べる。本文が15万文字を超える場合は、期間を絞るよう案内する
- **処理の分離**: 検索の本体(`service.js`)は結果を値として返すだけにし、表示はコマンドライン版(`search.js`)、HTTPは`server.js`が担当する。同じ処理を両方から使い回せる。DB接続(Pool)は初めて使うときに作るため、`DATABASE_URL`が未設定でもチャット機能は起動できる
- **DBへの保存**: 「全件削除 → 全件追加」をトランザクションで行い、途中で失敗しても中途半端なデータが残らないようにしている
- **セキュリティ**: 学習メモの本文はリポジトリに含めず、読み込み先は`.env`で指定する。開発用DBは`127.0.0.1`でのみ待ち受ける

### 既知の制約

- 「先週」「9月前半」のような、相対的・あいまいな期間の指定には未対応(範囲・1日・月のみ)
- 取り込みは毎回全件をEmbeddingし直す(内容が変わっていないチャンクのベクトルは再利用していない)
- 総括型は期間内の本文を1回で渡すため、本文が15万文字を超える期間(数か月分など)には答えられない
- 学習メモを追加・修正したら、`node rag/ingest.js`で取り込み直すまで検索・総括に反映されない
- Markdownの太字が、日本語の記号の前後で効かない場合がある(例:`**チャンキング（Chunking）**について` は、閉じの`**`の直前が全角の記号、直後が文字のため、CommonMarkの仕様上、太字の終わりと認識されない)。`remark-cjk-friendly`で対応可能だが未導入

## 今後の改善候補

- ストリーミングの本文とツール実行情報を、NUL文字区切りではなくJSON Lines / SSEのイベント種別で分けて送る
- メッセージの`key`を配列の番号ではなく、メッセージごとのIDにする
- GitHub Actionsで`npm run lint`とビルドをPRごとに自動実行する
- テストコード(Vitest)を追加する(RAGの`chunker.js`は`node:test`でテスト済み)
- RAG: 変更のあったファイルだけを取り込み直す(更新日時やハッシュ値で判定)。画面に最終取り込み日時を表示する
- RAG: 長い期間の総括に、日ごとに要約してからまとめる方式(map-reduce)で対応する
- RAG: 「先週」「9月前半」のような相対的な期間の指定に対応する
