import { GoogleGenAI } from "@google/genai";
import type { Fetcher } from "../types";
import type { z } from "zod";
import { aiOutputSchema, type AiOutput } from "./schema";

export interface JsonModel {
  name: string;
  /** timeoutMs: plazo máximo de esta llamada (se recorta a 60 s). */
  generate: (prompt: string, opts?: { timeoutMs?: number }) => Promise<string>;
}

export type AiFailureKind = "quota" | "invalid" | "unconfigured" | "unavailable";

export class AiUnavailableError extends Error {
  readonly kind: AiFailureKind;

  constructor(message: string, kind: AiFailureKind = "unavailable") {
    super(message);
    this.name = "AiUnavailableError";
    this.kind = kind;
  }
}

const AI_TIMEOUT_MS = 60_000;
/** Presupuesto total por defecto de la generación (el informe debe caber en el límite de Vercel). */
export const AI_BUDGET_MS = 45_000;
/** Margen mínimo para que merezca la pena un intento más. */
const MIN_ATTEMPT_MS = 3000;

const callTimeout = (opts?: { timeoutMs?: number }) => Math.min(AI_TIMEOUT_MS, opts?.timeoutMs ?? AI_TIMEOUT_MS);

export const DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest"];
export const OVERLOAD_BACKOFF_MS = [2000, 5000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function geminiModelNames(env: { GEMINI_MODELS?: string; GEMINI_MODEL?: string }): string[] {
  const listed = (env.GEMINI_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const chain = listed.length > 0 ? listed : [...DEFAULT_GEMINI_MODELS];
  const legacy = env.GEMINI_MODEL?.trim();
  return legacy ? [legacy, ...chain.filter((m) => m !== legacy)] : chain;
}

export function geminiModel(apiKey: string, model = DEFAULT_GEMINI_MODELS[0]): JsonModel {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: `gemini:${model}`,
    generate: async (prompt, opts) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.3,
          abortSignal: AbortSignal.timeout(callTimeout(opts)),
        },
      });
      return response.text ?? "";
    },
  };
}

/** Subconjunto del SDK que usa el modelo con búsqueda; inyectable para tests. */
export interface GeminiSearchClient {
  models: {
    generateContent: (args: {
      model: string;
      contents: string;
      config: Record<string, unknown>;
    }) => Promise<{ text?: string }>;
  };
}

/** Gemini con Google Search grounding. Sin responseMimeType (el grounding no siempre admite modo JSON). */
export function geminiSearchModel(
  apiKey: string,
  model = DEFAULT_GEMINI_MODELS[0],
  client?: GeminiSearchClient,
): JsonModel {
  const ai: GeminiSearchClient = client ?? (new GoogleGenAI({ apiKey }) as unknown as GeminiSearchClient);
  return {
    name: `gemini-search:${model}`,
    generate: async (prompt, opts) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.3,
          abortSignal: AbortSignal.timeout(callTimeout(opts)),
        },
      });
      return response.text ?? "";
    },
  };
}

export function groqModel(apiKey: string, model = "llama-3.3-70b-versatile", fetcher: Fetcher = fetch): JsonModel {
  return {
    name: `groq:${model}`,
    generate: async (prompt, opts) => {
      const res = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(callTimeout(opts)),
      });
      if (!res.ok) throw new Error(`Groq respondió ${res.status}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? "";
    },
  };
}

const stripFences = (text: string) => text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Solo se aplican a errores lanzados por generate(), nunca a errores de parseo.
const isQuotaError = (error: unknown) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(errorMessage(error));
const isOverloadedError = (error: unknown) => /\b503\b|UNAVAILABLE|overloaded/i.test(errorMessage(error));

type FailureReason = "quota" | "invalid" | "unavailable";

function failureKind(lastReasons: FailureReason[]): AiFailureKind {
  if (lastReasons.length === 0) return "unconfigured";
  if (lastReasons.every((r) => r === "quota")) return "quota";
  if (lastReasons.every((r) => r === "invalid")) return "invalid";
  return "unavailable";
}

export async function generateWithSchema<T>(
  prompt: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  models: JsonModel[],
  attemptsPerModel = 3,
  sleep: (ms: number) => Promise<void> = defaultSleep,
  budgetMs = AI_BUDGET_MS,
  now: () => number = () => Date.now(),
): Promise<T> {
  const errors: string[] = [];
  const lastReasons: FailureReason[] = [];
  const started = now();
  const remaining = () => budgetMs - (now() - started);
  let outOfTime = false;

  models: for (const model of models) {
    let lastReason: FailureReason = "unavailable";
    let overloadRetries = 0;
    for (let attempt = 0; attempt < attemptsPerModel; attempt++) {
      if (remaining() < MIN_ATTEMPT_MS) {
        outOfTime = true;
        break models;
      }
      let text: string;
      try {
        text = await model.generate(prompt, { timeoutMs: remaining() });
      } catch (error) {
        errors.push(`${model.name}: ${errorMessage(error)}`);
        if (isQuotaError(error)) {
          lastReason = "quota";
          break; // cupo agotado: pasar al siguiente proveedor
        }
        lastReason = "unavailable";
        if (isOverloadedError(error)) {
          // Saturación pasajera: esperar y reintentar el mismo modelo sin gastar un intento.
          if (overloadRetries < OVERLOAD_BACKOFF_MS.length) {
            const wait = OVERLOAD_BACKOFF_MS[overloadRetries++];
            if (remaining() < MIN_ATTEMPT_MS) {
              outOfTime = true;
              break models;
            }
            // Una espera que no deja margen para otro intento se salta: se pasa al siguiente modelo.
            if (wait + MIN_ATTEMPT_MS > remaining()) break;
            await sleep(wait);
            attempt--;
            continue;
          }
          break; // sigue saturado: pasar al siguiente modelo
        }
        continue;
      }
      lastReason = "invalid";
      try {
        const parsed = schema.safeParse(JSON.parse(stripFences(text)));
        if (parsed.success) return parsed.data;
        errors.push(`${model.name}: JSON con forma incorrecta`);
      } catch (error) {
        errors.push(`${model.name}: respuesta no es JSON (${errorMessage(error)})`);
      }
    }
    lastReasons.push(lastReason);
  }

  if (outOfTime) {
    throw new AiUnavailableError(
      `Se agotó el tiempo para generar el informe con IA (${Math.round(budgetMs / 1000)} s).${errors.length > 0 ? ` ${errors.join(" | ")}` : ""}`,
      "unavailable",
    );
  }

  const kind = failureKind(lastReasons);
  throw new AiUnavailableError(
    kind === "unconfigured" ? "No hay ningún proveedor de IA configurado." : errors.join(" | "),
    kind,
  );
}

export function generateAiOutput(
  prompt: string,
  models: JsonModel[],
  attemptsPerModel = 3,
  sleep: (ms: number) => Promise<void> = defaultSleep,
  budgetMs = AI_BUDGET_MS,
  now: () => number = () => Date.now(),
): Promise<AiOutput> {
  return generateWithSchema(prompt, aiOutputSchema, models, attemptsPerModel, sleep, budgetMs, now);
}
