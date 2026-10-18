import { describe, it, expect } from "vitest";
import { z } from "zod";
import { limitarConcurrencia, runSection, searchModelsFromEnv } from "../../../lib/engine/v3/llm";
import { geminiSearchModel, AiUnavailableError, type JsonModel } from "../../../lib/engine/ai/providers";

const model = (name: string, answers: (string | Error)[]): JsonModel & { calls: number } => {
  const m = {
    name,
    calls: 0,
    generate: async () => {
      const a = answers[Math.min(m.calls, answers.length - 1)];
      m.calls++;
      if (a instanceof Error) throw a;
      return a;
    },
  };
  return m;
};

describe("limitarConcurrencia", () => {
  it("nunca ejecuta más de n tareas a la vez y devuelve los resultados", async () => {
    const limit = limitarConcurrencia(2);
    let inFlight = 0;
    let max = 0;
    const task = (i: number) =>
      limit(async () => {
        inFlight++;
        max = Math.max(max, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return i;
      });
    const results = await Promise.all([0, 1, 2, 3, 4, 5].map(task));
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(max).toBe(2);
  });

  it("una tarea fallida libera su hueco", async () => {
    const limit = limitarConcurrencia(1);
    await expect(limit(async () => { throw new Error("x"); })).rejects.toThrow("x");
    await expect(limit(async () => 7)).resolves.toBe(7);
  });
});

describe("runSection", () => {
  const schema = z.object({ a: z.number() });
  it("valida con el schema dado y reintenta ante JSON inválido", async () => {
    const m = model("m", ["no json", '{"a":"x"}', '```json\n{"a":1}\n```']);
    await expect(runSection("sec", "p", schema, [m], { sleep: async () => {} })).resolves.toEqual({ a: 1 });
    expect(m.calls).toBe(3);
  });
  it("lanza AiUnavailableError invalid si nunca valida", async () => {
    const m = model("m", ["{}"]);
    await expect(runSection("sec", "p", schema, [m], { sleep: async () => {} })).rejects.toMatchObject({ kind: "invalid" });
    await expect(runSection("sec", "p", schema, [m], { sleep: async () => {} })).rejects.toBeInstanceOf(AiUnavailableError);
  });
  it("pasa al siguiente modelo", async () => {
    const a = model("a", [new Error("429 quota")]);
    const b = model("b", ['{"a":2}']);
    await expect(runSection("sec", "p", schema, [a, b], { sleep: async () => {} })).resolves.toEqual({ a: 2 });
  });
});

describe("geminiSearchModel", () => {
  it("usa googleSearch y no fija responseMimeType", async () => {
    let args: { model: string; contents: string; config: Record<string, unknown> } | undefined;
    const m = geminiSearchModel("k", "gemini-x", {
      models: { generateContent: async (a) => { args = a; return { text: "hola" }; } },
    });
    await expect(m.generate("prompt")).resolves.toBe("hola");
    expect(args?.model).toBe("gemini-x");
    expect(args?.contents).toBe("prompt");
    expect(args?.config.tools).toEqual([{ googleSearch: {} }]);
    expect(args?.config).not.toHaveProperty("responseMimeType");
  });
});

describe("searchModelsFromEnv", () => {
  it("vacío sin clave", () => {
    expect(searchModelsFromEnv({})).toEqual([]);
  });
  it("un modelo por nombre de la cadena Gemini", () => {
    const ms = searchModelsFromEnv({ GEMINI_API_KEY: "k", GEMINI_MODELS: "a,b", GEMINI_MODEL: "c" });
    expect(ms.map((m) => m.name)).toEqual(["gemini-search:c", "gemini-search:a", "gemini-search:b"]);
  });
});
