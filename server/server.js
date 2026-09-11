// server.js
import express from "express";
import cors from "cors";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// 実行時のカレントディレクトリに関わらず、必ず server/.env を読み込む
dotenv.config({ path: new URL(".env", import.meta.url) });

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post("/api/chat", async (req, res) => {
  const prompt = req.body.prompt;

  if (!prompt) {
    return res.status(400).json({ text: "プロンプトが空です。" });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite", // 無料枠対応モデル
      contents: prompt,
    });

    res.json({ text: response.text });
  } catch (err) {
    console.error(err);
    if (err.status === 429) {
      return res.json({
        text: "現在の利用枠が上限に達しています。数十秒後に再度お試しください。",
      });
    }
    return res.json({ text: "エラーが発生しました。" });
  }
});

const SYSTEM_PROMPT = `あなたはReact/TypeScriptを学習しているエンジニアの学習をサポートするAIアシスタントです。
専門的な内容もわかりやすく、簡潔に説明してください。

関数(ツール)を実行した場合、その実行結果(functionResponse)は必ず事実として扱ってください。
「リアルタイム情報にはアクセスできない」のような拒否はせず、関数が返した値をそのまま使って具体的に回答してください。`;

// ==== function calling 用の関数定義 ====

// LLMに公開する関数のメタデータ(Gemini v1形式のスキーマ)
const FUNCTION_DECLARATIONS = [
  {
    name: "getWeather",
    description: "指定された都市の天気を返すダミー関数",
    parameters: {
      type: Type.OBJECT,
      properties: {
        city: {
          type: Type.STRING,
          description: "天気を調べたい都市名",
        },
      },
      required: ["city"],
    },
  },
];

// 実際に実行される関数(ダミー実装)
async function getWeather(city) {
  return `${city} の天気は晴れです（ダミー）`;
}

// 関数名 → 実装 のマップ。LLMが返した name をキーに呼び出す
const AVAILABLE_FUNCTIONS = {
  getWeather,
};

// 1ターンあたりのfunction call実行回数の上限(無限ループ防止)
const MAX_FUNCTION_CALLS = 2;

// ストリーミング中にfunction call実行をフロントエンドへ通知するための簡易マーカー。
// NUL文字はLLMの通常のテキスト出力に現れないため、区切り文字として利用する。
function toolCallMarker(name) {
  return `\u0000TOOL_CALL:${name}\u0000`;
}

// ==== ログ・コスト管理(usageMetadataベース) ====

// gemini-3.5-flash-lite の料金(100万トークンあたりのUSD、2026年9月時点)
const PRICE_PER_MILLION_INPUT = 0.3;
const PRICE_PER_MILLION_OUTPUT = 2.5;

function calculateCost(usageMetadata) {
  const inputTokens = usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = usageMetadata?.candidatesTokenCount ?? 0;
  const inputCost = (inputTokens / 1_000_000) * PRICE_PER_MILLION_INPUT;
  const outputCost = (outputTokens / 1_000_000) * PRICE_PER_MILLION_OUTPUT;

  return {
    inputTokens,
    outputTokens,
    totalCostUSD: inputCost + outputCost,
  };
}

function logUsage(label, usageMetadata) {
  const cost = calculateCost(usageMetadata);
  console.log(
    `[${label}] input:${cost.inputTokens} output:${cost.outputTokens} cost:$${cost.totalCostUSD.toFixed(6)}`
  );
  return cost;
}

app.post("/api/chat/stream", async (req, res) => {
  const history = req.body.history;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  if (!Array.isArray(history) || history.length === 0) {
    res.write("会話履歴が空です。");
    return res.end();
  }

  // Message[] 形式(role: "user" | "assistant") を Gemini の contents 形式に変換。
  // この配列はターン内でのみ書き換える(functionCall/functionResponseの
  // 中間ステップを会話履歴として保存しないため、historyそのものは変更しない)。
  let contents = history.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  try {
    let functionCallCount = 0;

    // function calling 判定・実行ループ(最大 MAX_FUNCTION_CALLS 回)
    while (functionCallCount < MAX_FUNCTION_CALLS) {
      // 非ストリーミングで1回実行し、functionCallの有無だけを判定する
      const judge = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        },
      });

      logUsage(
        `/api/chat/stream 判定${functionCallCount + 1}回目`,
        judge.usageMetadata
      );

      const functionCalls = judge.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        // function call不要 → このまま通常のストリーミング応答へ進む
        break;
      }

      const fc = functionCalls[0];
      const fn = AVAILABLE_FUNCTIONS[fc.name];
      const functionResult = fn
        ? await fn(fc.args?.city)
        : `未知の関数です: ${fc.name}`;

      functionCallCount++;

      // フロントエンドへ「ツール実行中」を通知(本文とは別マーカーとして送信)
      res.write(toolCallMarker(fc.name));

      // モデルの返答内容(functionCallを含む)をターン内のcontentsにのみ積む
      const modelContent = judge.candidates[0].content;
      contents = [
        ...contents,
        modelContent,
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: fc.name,
                response: { result: functionResult },
              },
            },
          ],
        },
      ];
    }

    // 最終回答をストリーミング。上限到達時はtoolsを渡さず、
    // ここまでのfunctionResponseを踏まえたテキスト回答を強制する。
    const stream = await ai.models.generateContentStream({
      model: "gemini-3.5-flash-lite",
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    let streamUsage = null;
    for await (const chunk of stream) {
      if (chunk.usageMetadata) {
        streamUsage = chunk.usageMetadata;
      }
      if (chunk.text) {
        res.write(chunk.text);
      }
    }

    if (streamUsage) {
      logUsage("/api/chat/stream ストリーミング(最終回答)", streamUsage);
    }

    res.end();
  } catch (err) {
    console.error(err);
    res.write("エラーが発生しました。");
    res.end();
  }
});

app.post("/api/fc", async (req, res) => {
  console.log("=== /api/fc が呼ばれました ===", req.body);
  const history = req.body.history;

  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ text: "会話履歴が空です。" });
  }

  // Message[] 形式(role: "user" | "assistant") を Gemini の contents 形式に変換
  const contents = history.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  try {
    // 1回目: function call が必要かどうかをLLMに判定させる
    const first = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      },
    });

    const cost1 = logUsage("/api/fc 1回目(functionCall判定)", first.usageMetadata);

    const functionCalls = first.functionCalls;

    // function calling が発動しなかった場合はそのままテキストを返す
    if (!functionCalls || functionCalls.length === 0) {
      return res.json({
        text: first.text,
        usage: { calls: [cost1], totalCostUSD: cost1.totalCostUSD },
      });
    }

    const fc = functionCalls[0];
    const fn = AVAILABLE_FUNCTIONS[fc.name];
    const functionResult = fn
      ? await fn(fc.args?.city)
      : `未知の関数です: ${fc.name}`;

    // モデルの返答内容(functionCallを含む)をそのまま履歴に積む
    const modelContent = first.candidates[0].content;

    const followUpContents = [
      ...contents,
      modelContent,
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: fc.name,
              response: { result: functionResult },
            },
          },
        ],
      },
    ];

    // 2回目: 関数の実行結果を渡して最終回答を生成
    const final = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: followUpContents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    const cost2 = logUsage("/api/fc 2回目(最終回答)", final.usageMetadata);
    const totalCostUSD = cost1.totalCostUSD + cost2.totalCostUSD;

    console.log(`[/api/fc] 合計コスト(USD): ${totalCostUSD.toFixed(6)}`);

    res.json({
      text: final.text,
      functionCall: { name: fc.name, args: fc.args, result: functionResult },
      usage: {
        calls: [cost1, cost2],
        totalCostUSD,
      },
    });
  } catch (err) {
    console.error(err);
    if (err.status === 429) {
      return res.status(429).json({
        text: "現在の利用枠が上限に達しています。数十秒後に再度お試しください。",
      });
    }
    return res.status(500).json({ text: "エラーが発生しました。" });
  }
});

const CLASSIFY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: ["React", "TypeScript", "AI開発", "その他"],
    },
    summary: {
      type: Type.STRING,
      description: "質問内容を15文字程度で要約したもの",
    },
  },
  required: ["category", "summary"],
};

app.post("/api/json", async (req, res) => {
  const prompt = req.body.prompt;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,   // ★ 文字列でOK
      config: {
        responseMimeType: "application/json",
        responseSchema: CLASSIFY_SCHEMA,   // ★ config の中に入れる
      },
    });

    res.send(response.text);  // ★ プロパティとして読む

  } catch (err) {
    console.error(err);
    res.json({ error: "エラーが発生しました" });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});