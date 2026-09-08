// server.js
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
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

app.post("/api/chat/stream", async (req, res) => {
  const prompt = req.body.prompt;

  // ★最初に1回だけヘッダー設定（ストリーミングは text/plain）
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  // ★空チェック（JSONではなくテキストで返す）
  if (!prompt || !prompt.trim()) {
    res.write("プロンプトが空です。");
    return res.end();
  }

  try {
    const response = await ai.models.generateContentStream({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
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

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});