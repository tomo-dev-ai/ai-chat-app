-- ai-chat-app RAG用のテーブル定義
-- ※このファイルは「データベースが空の状態で初めて起動したとき」だけ自動実行される。
--   内容を変えて作り直したい場合は `docker compose down -v` でデータごと消してから起動し直す。

-- pgvector 拡張を有効にする(vector 型と、<=> などの演算子が使えるようになる)
CREATE EXTENSION IF NOT EXISTS vector;

-- 学習メモのチャンク1件 = 1行
CREATE TABLE IF NOT EXISTS chunks (
  id         text PRIMARY KEY,          -- 例: 20260924_学習メモ.txt#3
  source     text NOT NULL,             -- ファイル名(出典表示用)
  date       date NOT NULL,             -- 学習メモの日付(WHERE で絞り込む用)
  heading    text,                      -- 【】の見出し
  content    text NOT NULL,             -- チャンクの本文(ベクトル化したテキスト)
  embedding  vector(768) NOT NULL,      -- 768次元のベクトル(config.js の EMBEDDING_DIMENSIONS と一致させる)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ベクトル検索を速くするインデックス(HNSW)。vector_cosine_ops = コサイン距離(<=>)で検索する用
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- 日付での絞り込みを速くするインデックス
CREATE INDEX IF NOT EXISTS chunks_date_idx ON chunks (date);
