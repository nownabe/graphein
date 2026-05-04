import { GoogleGenAI, Type } from "@google/genai";

interface TaskDetails {
  title: string;
  deadline: string | null;
}

export interface GeminiClient {
  generateTaskDetails(messageText: string, postedAt: Date): Promise<TaskDetails>;
}

export function createGeminiClient(apiKey: string): GeminiClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generateTaskDetails(messageText: string, postedAt: Date): Promise<TaskDetails> {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Extract a task title and deadline from the following Slack message. The title should be concise. If a deadline is mentioned, return it in ISO 8601 format (YYYY-MM-DDTHH:mm). If no deadline is found, return null.

Use the message's posted date and time below as the reference point to resolve relative expressions like "tomorrow", "next Monday", "来週月曜", "明日の15時", etc.

Message posted at: ${postedAt.toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})

Message:
${messageText}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Concise task title" },
                deadline: {
                  type: Type.STRING,
                  nullable: true,
                  description: "Deadline in ISO 8601 format (YYYY-MM-DDTHH:mm), or null if unknown",
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
    },
  };
}
