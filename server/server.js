// server.js
import express from "express";
import cors from "cors";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

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
専門的な内容もわかりやすく、簡潔に説明してください。`;

app.post("/api/chat/stream", async (req, res) => {
  const history = req.body.history;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  if (!Array.isArray(history) || history.length === 0) {
    res.write("会話履歴が空です。");
    return res.end();
  }

  // Message[] 形式(role: "user" | "assistant") を Gemini の contents 形式に変換
  const contents = history.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  try {
    const response = await ai.models.generateContentStream({
      model: "gemini-3.5-flash-lite",
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    for await (const chunk of response) {
      if (chunk.text) {
        res.write(chunk.text);
      }
    }

    res.end();
  } catch (err) {
    console.error(err);
    res.write("エラーが発生しました。");
    res.end();
  }
});

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
    `[/api/fc] [${label}] input:${cost.inputTokens} output:${cost.outputTokens} cost:$${cost.totalCostUSD.toFixed(6)}`
  );
  return cost;
}

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

    const cost1 = logUsage("1回目(functionCall判定)", first.usageMetadata);

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

    const cost2 = logUsage("2回目(最終回答)", final.usageMetadata);
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