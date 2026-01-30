import { GoogleGenAI, Type } from "@google/genai";
import { TarotReading } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateTarotReading = async (): Promise<TarotReading> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "为用户抽取一张塔罗牌。可以是为大阿卡纳或小阿卡纳。请用中文提供神秘但具有指引性的解读。",
      config: {
        systemInstruction: "你是一位神秘的塔罗牌占卜师。提供单张塔罗牌解读。输出必须是JSON格式。所有文本必须是中文。",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cardName: { type: Type.STRING, description: "卡牌名称 (例如：愚者, 圣杯王牌)" },
            keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3-4个简短有力的关键词，描述卡牌当前的能量"
            },
            meaning: { type: Type.STRING, description: "对卡牌意象和含义的诗意描述 (限50字以内)" },
            guidance: { type: Type.STRING, description: "一句直接、可执行的心灵指引或建议。" }
          },
          required: ["cardName", "keywords", "meaning", "guidance"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as TarotReading;
    }

    throw new Error("No response text generated");
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback in case of API error to ensure UI still works for demo purposes
    return {
      cardName: "命运之轮",
      keywords: ["宿命", "转折点", "循环", "机遇"],
      meaning: "命运的齿轮开始转动，编织着因果的丝线。低谷之后必有高峰，宇宙正在向有利于你的方向转变。",
      guidance: "拥抱即将到来的变化，这是更高意志的指引，顺势而为。"
    };
  }
};
