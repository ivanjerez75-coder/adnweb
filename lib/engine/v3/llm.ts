import type { z } from "zod";
import {
  AI_BUDGET_MS,
  geminiModelNames,
  geminiSearchModel,
  generateWithSchema,
  type JsonModel,
} from "../ai/providers";

/** Limita cuántas tareas asíncronas corren a la vez (cola FIFO). */
export function limitarConcurrencia(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  const max = Math.max(1, Math.floor(n));
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

export interface RunSectionOpts {
  sleep?: (ms: number) => Promise<void>;
  budgetMs?: number;
  now?: () => number;
  attemptsPerModel?: number;
}

/** Una llamada de IA por sección, validada con su propio schema y con la cadena de modelos/reintentos habitual. */
export function runSection<T>(
  nombre: string,
  prompt: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  models: JsonModel[],
  opts: RunSectionOpts = {},
): Promise<T> {
  // `nombre` identifica la sección en logs/errores de quien llama.
  void nombre;
  return generateWithSchema(
    prompt,
    schema,
    models,
    opts.attemptsPerModel ?? 3,
    opts.sleep,
    opts.budgetMs ?? AI_BUDGET_MS,
    opts.now,
  );
}

/** Cadena Gemini (mismas variables que el análisis) con Google Search; vacía sin clave. */
export function searchModelsFromEnv(env: {
  GEMINI_API_KEY?: string;
  GEMINI_MODELS?: string;
  GEMINI_MODEL?: string;
}): JsonModel[] {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return [];
  return geminiModelNames(env).map((m) => geminiSearchModel(key, m));
}
