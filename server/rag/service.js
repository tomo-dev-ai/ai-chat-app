// server/rag/service.js
//
// 学習メモのRAG検索の本体。「質問を受け取り、検索して、回答と出典を返す」だけを担当し、
// 画面表示(console.log)やHTTPのことは知らない。
// → コマンドライン(search.js)と Web API(server.js の /api/rag/search)の両方から同じ処理を使える。
//
// 処理の流れ:
//   質問 → ①期間を取り出す(extractPeriod) → ②質問の種類をLLMで判定(classifyQuestion)
//     ├─ search (検索型):ベクトル検索で上位のチャンクだけを渡して回答する(これまでの処理)
//     └─ summary(総括型):期間内のチャンクを日付順に「全部」渡して要約する

import { GoogleGenAI, Type } from "@google/genai";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, GENERATION_MODEL } from "./config.js";
import { getPool, toVector } from "./db.js"; // server/.env もここで読み込まれる
import { extractPeriod } from "./query.js";

// 回答の根拠としてGeminiに渡すチャンクの件数(Top-K)
const TOP_K = 4;

// 質問に期間が含まれるときは、その期間のメモを広く見られるように件数を増やす
// (1日分のメモは 4〜18 チャンク程度)
const TOP_K_WITH_PERIOD = 20;

// 1位のスコアがこれ未満なら「関連する資料なし」とみなす。
// 2026-09-25に7つの質問で実測した1位のスコア(768次元・taskType指定あり・119チャンク):
//   関連する質問   : 0.7340 / 0.7375 / 0.7535 / 0.7223(日付の質問)
//   無関係な質問   : 0.5935(天気) / 0.5676(カレー) / 0.5959(Pythonスクレイピング)
// 無関係の最大(0.5959)と関連の最小(0.7223)のほぼ中間を取った値。
// まだ7件しか試していないため、資料や質問の傾向が変わったら再調整すること。
const MIN_SCORE = 0.65;

// 総括型でGeminiに渡す本文の上限(文字数)。
// 2026-10-02時点で9月の13日分が約4.5万文字。モデルの入力上限には十分な余裕があるが、
// 期間を指定しない質問で資料が増え続けると、時間とコストが際限なく増えるため上限を設ける。
// 超えた場合は「期間を絞ってください」と返す(将来は日ごとに要約してからまとめる map-reduce 方式も検討)
const MAX_SUMMARY_CHARS = 150_000;

let ai = null;
function getAi() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("server/.env に GEMINI_API_KEY を設定してください");
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

// ---- ② 質問の種類の判定 ----

// LLMに返させるJSONの形。enum で "search" か "summary" 以外を返せないようにする
const CLASSIFY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      enum: ["search", "summary"],
      description: "search=特定の情報を探す質問 / summary=期間や全体の学習内容をまとめる・振り返る質問",
    },
  },
  required: ["type"],
};

/**
 * 質問が「検索型(search)」か「総括型(summary)」かを、LLMに判定させる。
 * 判定に失敗したとき(APIエラー・想定外の応答)は、これまでどおりの検索型として続ける(フォールバック)。
 * @param {string} query
 * @returns {Promise<"search" | "summary">}
 */
async function classifyQuestion(query) {
  const prompt = `学習メモに対する次の質問を、どちらかに分類してください。
- search : 特定の出来事・エラー・用語・理由など、メモのどこかに書いてある情報を探す質問
           (例:「useCallbackが効かなかった原因は?」「9月10日にはどんなエラーが出た?」)
- summary: ある期間、または学習全体の内容を、まとめる・振り返る・総括する質問
           (例:「9月に学んだことを総括して」「先週の学習を振り返って」「これまでの進み具合は?」)

【質問】
${query}`;

  try {
    const response = await getAi().models.generateContent({
      model: GENERATION_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: CLASSIFY_SCHEMA,
        temperature: 0, // 分類なので、毎回できるだけ同じ答えになるようにする
      },
    });
    const { type } = JSON.parse(response.text);
    return type === "summary" ? "summary" : "search";
  } catch (err) {
    // 429(回数制限)だけは、続けても回答の生成で同じエラーになるので、そのまま呼び出し元に伝える
    if (err.status === 429) throw err;
    console.warn("[classifyQuestion] 判定に失敗したため、検索型として続けます:", err.message);
    return "search";
  }
}

// ---- 検索型(search) ----

// 質問文をベクトル化する(取り込み時と同じモデル・次元数で、taskType だけ「質問」にする)
async function embedQuery(query) {
  const response = await getAi().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: query,
    config: {
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });
  return response.embeddings[0].values;
}

// 質問ベクトルに近いチャンクを、PostgreSQL で上位 limit 件取り出す
// <=> は pgvector の「コサイン距離」(0に近いほど似ている)。1 - 距離 = コサイン類似度
// period を指定したときは、その期間のチャンクだけに絞り込んでから並べる(null なら絞り込まない)
async function searchChunks(queryVector, limit, period = null) {
  const { rows } = await getPool().query(
    `SELECT id, source, heading, content AS text,
            1 - (embedding <=> $1::vector) AS score
       FROM chunks
      WHERE ($3::date IS NULL OR date BETWEEN $3::date AND $4::date)
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    [toVector(queryVector), limit, period?.from ?? null, period?.to ?? null]
  );
  return rows;
}

// 検索で見つかったチャンクだけを根拠に、回答を生成する(RAGのGeneration部分)
// ※回答に使うモデルを差し替えたくなったら(Claude APIなど)、この関数だけを書き換えればよい
async function generateAnswer(query, hits) {
  const context = hits
    .map((hit, i) => `[${i + 1}] 出典: ${hit.source}${hit.heading ? ` 【${hit.heading}】` : ""}\n${hit.text}`)
    .join("\n\n---\n\n");

  const prompt = `あなたは学習者本人の学習メモを検索するアシスタントです。
以下の【資料】だけを根拠に、【質問】に日本語で簡潔に答えてください。
- 根拠にした資料の番号を、文末に [1] のように付けてください。
- 資料に書かれていないことは推測せず、「資料からはわかりません」と答えてください。

【資料】
${context}

【質問】
${query}`;

  const response = await getAi().models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
  });
  return response.text;
}

// ---- 総括型(summary) ----

// 期間内のチャンクを「全部」、日付順・メモの中の順番どおりに取り出す(ベクトル検索はしない)
// id は「ファイル名#番号」の文字列なので、そのまま並べると #10 が #2 より先になる(辞書順)。
// そのため、# の後ろを数値に変換して並べる
async function fetchChunksInPeriod(period) {
  const { rows } = await getPool().query(
    `SELECT id, source, heading, content AS text
       FROM chunks
      WHERE ($1::date IS NULL OR date BETWEEN $1::date AND $2::date)
      ORDER BY date, split_part(id, '#', 2)::int`,
    [period?.from ?? null, period?.to ?? null]
  );
  return rows;
}

// 期間内のメモ全体をもとに、総括を生成する
async function generateSummary(query, chunks) {
  const context = chunks
    .map((c) => `出典: ${c.source}${c.heading ? ` 【${c.heading}】` : ""}\n${c.text}`)
    .join("\n\n---\n\n");

  const prompt = `あなたは学習者本人の学習メモをもとに、学習を振り返るアシスタントです。
以下の【資料】(日付順に並んだ学習メモ)だけを根拠に、【質問】に日本語で答えてください。
- 前置き(「ご提示いただいた〜」など)は書かず、すぐに本題から始めてください。
- 日付ごとに羅列するのではなく、テーマ(技術・作ったもの・つまずいたことなど)ごとに整理してください。
- 各項目には、根拠となった日付を (9/10) のように付けてください。
- 資料に書かれていないことは推測しないでください。

【資料】
${context}

【質問】
${query}`;

  const response = await getAi().models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
  });
  return response.text;
}

// 総括型の出典は「チャンク」ではなく「どの日のメモを使ったか」を1ファイル1件で返す
function toFileSources(chunks) {
  const files = [...new Set(chunks.map((c) => c.source))];
  return files.map((source) => ({ id: source, source, heading: null, score: null }));
}

/**
 * 学習メモを検索して回答する
 * @param {string} query 質問文
 * @returns {Promise<{
 *   query: string,
 *   mode: "search" | "summary",               // 質問の種類(LLMで判定)
 *   period: { from: string, to: string } | null, // 質問から取り出した期間(なければ null)
 *   status: "answered" | "no_notes_for_period" | "no_relevant_notes" | "too_many_notes",
 *   answer: string | null,                    // 回答(status が answered のときだけ)
 *   sources: { id: string, source: string, heading: string | null, score: number | null }[]
 * }>}
 */
export async function askLearningNotes(query) {
  // ① 質問に期間があれば取り出す(年が書かれていなければ今年とみなす)
  const period = extractPeriod(query, new Date().getFullYear());

  // ② 質問の種類を判定する
  const mode = await classifyQuestion(query);
  const base = { query, mode, period };

  if (mode === "summary") {
    const chunks = await fetchChunksInPeriod(period);
    const sources = toFileSources(chunks);
    if (chunks.length === 0) {
      return { ...base, status: "no_notes_for_period", answer: null, sources };
    }
    const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
    if (totalChars > MAX_SUMMARY_CHARS) {
      return { ...base, status: "too_many_notes", answer: null, sources };
    }
    const answer = await generateSummary(query, chunks);
    return { ...base, status: "answered", answer, sources };
  }

  // 検索型(これまでの処理)
  const limit = period ? TOP_K_WITH_PERIOD : TOP_K;
  const queryVector = await embedQuery(query);
  const hits = await searchChunks(queryVector, limit, period);
  const sources = hits.map(({ id, source, heading, score }) => ({ id, source, heading, score }));

  if (hits.length === 0) {
    if (period) {
      return { ...base, status: "no_notes_for_period", answer: null, sources };
    }
    throw new Error("chunks テーブルが空です。先に `node rag/ingest.js` を実行してください");
  }

  // 1位のスコアが低ければ、回答を生成せずに終える(ハルシネーション対策)
  // ただし期間で絞り込んだ場合は、「その期間のメモである」こと自体が関連の根拠になるため判定しない
  if (!period && hits[0].score < MIN_SCORE) {
    return { ...base, status: "no_relevant_notes", answer: null, sources };
  }

  const answer = await generateAnswer(query, hits);
  return { ...base, status: "answered", answer, sources };
}
