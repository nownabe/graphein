import { GoogleGenAI, Type } from "@google/genai";
import { env } from "../env";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

interface TaskDetails {
  title: string;
  deadline: string | null;
}

export async function generateTaskDetails(
  messageText: string,
): Promise<TaskDetails> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `以下のSlackメッセージからタスクのタイトルと期限を抽出してください。タイトルは簡潔に、期限はメッセージに含まれていれば ISO 8601 形式 (YYYY-MM-DD) で返してください。期限が不明な場合は null としてください。

メッセージ:
${messageText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "タスクのタイトル" },
            deadline: {
              type: Type.STRING,
              nullable: true,
              description: "期限 (YYYY-MM-DD形式、不明な場合はnull)",
            },
          },
          required: ["title", "deadline"],
        },
      },
    });

    return JSON.parse(response.text ?? "{}") as TaskDetails;
  } catch (err) {
    console.error("Gemini API error, using fallback:", err);
    // Fallback: use the first line of the message as the title
    const title = messageText.split("\n")[0].slice(0, 100) || "Untitled task";
    return { title, deadline: null };
  }
}
