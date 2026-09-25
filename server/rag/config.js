// server/rag/config.js
//
// ingest.js(取り込み)と search.js(検索)で共通の設定。
// 取り込み時と検索時でモデルや次元数がずれると、ベクトル同士を比較できなくなるため、1か所で管理する。

// Embeddingモデルと、ベクトルの次元数(数値の個数)
// gemini-embedding-001 は既定で3072次元だが、768次元に縮めても精度の低下は小さく、
// 保存サイズと計算量を1/4にできる。また、午後に使う pgvector の索引(HNSW)は2000次元までしか
// 扱えないため、ここで768次元にそろえておく。
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

// 回答生成に使うモデル
export const GENERATION_MODEL = "gemini-3.5-flash-lite";
