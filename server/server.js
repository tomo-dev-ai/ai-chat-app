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

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});