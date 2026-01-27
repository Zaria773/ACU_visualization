import { GoogleGenAI, Type } from "@google/genai";
import { FortuneData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateFortune = async (): Promise<FortuneData> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Generate a mystical tarot-style daily fortune. The content must be in Chinese (Simplified). Return a valid JSON object.",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "The name of the card or fortune (e.g., '星辰', '愚者', '命运之轮'). Max 4 characters.",
            },
            keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 short abstract keywords (e.g., '希望', '启示', '转折').",
            },
            message: {
              type: Type.STRING,
              description: "A poetic, inspiring, and slightly mysterious one-sentence fortune prediction.",
            },
            luckyElement: {
              type: Type.STRING,
              description: "A lucky item, color, or direction associated with this fortune.",
            }
          },
          required: ["title", "keywords", "message", "luckyElement"],
        },
        systemInstruction: "You are a mystical fortune teller using an ancient star chart. Your tone is elegant, mysterious, yet encouraging. Ensure the JSON is valid.",
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response text");
    
    return JSON.parse(text) as FortuneData;
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback data in case of API failure or missing key
    return {
      title: "静谧",
      keywords: ["内省", "等待", "星光"],
      message: "此时无声胜有声，星辰将在静默中为你指引方向。",
      luckyElement: "深蓝色"
    };
  }
};