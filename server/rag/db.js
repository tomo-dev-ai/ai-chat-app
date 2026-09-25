// server/rag/db.js
//
// PostgreSQL(pgvector)への接続を1か所にまとめる。ingest.js と search.js の両方から使う。
// 接続先は server/.env の DATABASE_URL で指定する(パスワードをコードに書かないため)。

import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: new URL("../.env", import.meta.url) });

if (!process.env.DATABASE_URL) {
  throw new Error("server/.env に DATABASE_URL を設定してください(.env.example を参照)");
}

// Pool:接続を使い回すための仕組み。クエリのたびに接続を作り直すより速い
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/**
 * JavaScriptの数値の配列を、pgvector が受け付ける文字列(例:"[0.1,0.2,0.3]")に変換する
 * SQL側では $1::vector のようにキャストして使う
 * @param {number[]} values
 */
export function toVector(values) {
  return JSON.stringify(values);
}
