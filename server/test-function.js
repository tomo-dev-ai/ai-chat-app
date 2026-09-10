// server/test-function.js
import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// gemini-3.5-flash-lite の料金(2026年9月時点、100万トークンあたりのUSD)
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

// ① LLMに公開する関数の定義(Gemini v1形式のスキーマ)
const FUNCTION_DECLARATIONS = [
  {
    name: "getWeather",
    description: "指定された都市の天気を返すダミー関数",
    parameters: {
      type: Type.OBJECT,
      properties: {
        city: { type: Type.STRING, description: "天気を調べたい都市名" },
      },
      required: ["city"],
    },
  },
];

// ② 実際の関数(あなたのコード側)
async function getWeather(city) {
  // 本番では外部APIを呼ぶ。今は最小例なのでダミー値。
  return `${city} の天気は晴れです（ダミー）`;
}

const AVAILABLE_FUNCTIONS = { getWeather };

async function main() {
  // ③ ユーザー入力
  const prompt = "東京の天気を教えて";
  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  // ④ 1回目: LLMに投げる
  const first = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents,
    config: {
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
    },
  });

  // ⑤ function calling が発動したか確認
  const functionCalls = first.functionCalls;
  if (!functionCalls || functionCalls.length === 0) {
    console.log("functionCall が返ってきませんでした");
    console.log("Text Response:", first.text);
    return;
  }

  const fc = functionCalls[0];
  console.log("functionCall:", fc);

  // ⑥ LLMが指定した関数名と引数を取り出して実行
  const { name, args } = fc;
  const fn = AVAILABLE_FUNCTIONS[name];
  const functionResult = fn ? await fn(args.city) : "未知の関数です";

  console.log("Function Result:", functionResult);

  // モデルの返答内容をそのまま使う(thoughtSignatureを保持するため)
  const modelContent = first.candidates[0].content;

  // ⑦ これまでの会話の流れをcontentsとして組み立てる
  const followUpContents = [
    ...contents,
    modelContent,
    {
      role: "user",
      parts: [
        {
          functionResponse: {
            name,
            response: { result: functionResult },
          },
        },
      ],
    },
  ];

  // ⑧ 関数結果を渡して最終回答を生成
  const final = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: followUpContents,
  });

  console.log("Final Answer:", final.text);

  const call1Cost = logUsage("1回目(functionCall)", first.usageMetadata);
  const call2Cost = logUsage("2回目(最終回答)", final.usageMetadata);
  const totalCost = (call1Cost.totalCostUSD + call2Cost.totalCostUSD).toFixed(6);

  console.log("合計コスト(USD):", totalCost);
}

main();
