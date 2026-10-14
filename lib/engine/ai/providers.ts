import { GoogleGenAI } from "@google/genai";
import type { Fetcher } from "../types";
import { aiOutputSchema, type AiOutput } from "./schema";

export interface JsonModel {
  name: string;
  generate: (prompt: string) => Promise<string>;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export function geminiModel(apiKey: string, model = "gemini-2.5-flash"): JsonModel {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: `gemini:${model}`,
    generate: async (prompt) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: 0.3 },
      });
      return response.text ?? "";
    },
  };
}

export function groqModel(apiKey: string, model = "llama-3.3-70b-versatile", fetcher: Fetcher = fetch): JsonModel {
  return {
    name: `groq:${model}`,
    generate: async (prompt) => {
      const res = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Groq respondió ${res.status}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? "";
    },
  };
}

const stripFences = (text: string) => text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

const isQuotaError = (error: unknown) =>
  error instanceof Error && /429|RESOURCE_EXHAUSTED|quota/i.test(error.message);

export async function generateAiOutput(
  prompt: string,
  models: JsonModel[],
  attemptsPerModel = 3,
): Promise<AiOutput> {
  const errors: string[] = [];

  for (const model of models) {
    for (let attempt = 0; attempt < attemptsPerModel; attempt++) {
      let text: string;
      try {
        text = await model.generate(prompt);
      } catch (error) {
        errors.push(`${model.name}: ${error instanceof Error ? error.message : String(error)}`);
        if (isQuotaError(error)) break; // cupo agotado: pasar al siguiente proveedor
        continue;
      }
      try {
        const parsed = aiOutputSchema.safeParse(JSON.parse(stripFences(text)));
        if (parsed.success) return parsed.data;
        errors.push(`${model.name}: JSON con forma incorrecta`);
      } catch (error) {
        errors.push(`${model.name}: respuesta no es JSON (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }

  throw new AiUnavailableError(errors.length ? errors.join(" | ") : "No hay ningún proveedor de IA configurado.");
}
