// server/test-structured.js
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: "useStateとuseEffectの違いを教えてください",
    config: {
      responseMimeType: "application/json",
      responseSchema: CLASSIFY_SCHEMA,
    },
  });

  console.log(response.text);
}

main();