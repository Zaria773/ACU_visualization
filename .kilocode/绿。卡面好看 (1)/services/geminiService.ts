
import { GoogleGenAI, Type } from "@google/genai";
import { Fortune } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateFortune = async (): Promise<Fortune> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "生成一个神秘的塔罗牌占卜结果。保持简短、诗意且神秘。请务必使用中文回答。",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            luckLevel: {
              type: Type.STRING,
              description: "运势标题，例如 '星辰共鸣', '大吉', '静谧之虚'。",
            },
            keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3个抽象的名词关键词，例如 '勇气', '静默', '晨曦'。",
            },
            message: {
              type: Type.STRING,
              description: "一句深刻、诗意的指引句子，富有哲理。",
            },
            element: {
                type: Type.STRING,
                description: "One of: Fire, Water, Air, Earth, Aether"
            }
          },
          required: ["luckLevel", "keywords", "message"],
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as Fortune;
    }
    throw new Error("No response text");
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback data in case of error
    return {
      luckLevel: "静谧之虚",
      keywords: ["迷雾", "等待", "内观"],
      message: "你要寻找的答案，早已在你的静默中低语。",
      element: "Aether"
    };
  }
};
