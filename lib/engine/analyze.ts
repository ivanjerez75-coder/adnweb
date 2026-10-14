import { normalizeUrl } from "./url";
import { createSafeGetter } from "./safe-fetch";
import { collect, type CollectDeps, type StepReporter } from "./collect";
import { buildReport, type Report } from "./report";
import { geminiModel, groqModel, type JsonModel } from "./ai/providers";
import type { RawData } from "./types";

export interface AnalyzeDeps extends CollectDeps {
  models: JsonModel[];
}

export async function analyze(
  input: string,
  deps: AnalyzeDeps,
  onStep: StepReporter = () => {},
): Promise<{ raw: RawData; report: Report }> {
  const normalized = normalizeUrl(input);
  const raw = await collect(normalized, deps, onStep);
  const report = await buildReport(raw, deps, onStep);
  return { raw, report };
}

export function depsFromEnv(env: NodeJS.ProcessEnv = process.env): AnalyzeDeps {
  const models: JsonModel[] = [];
  if (env.GEMINI_API_KEY) models.push(geminiModel(env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined));
  if (env.GROQ_API_KEY) models.push(groqModel(env.GROQ_API_KEY, env.GROQ_MODEL || undefined));

  return {
    getPage: createSafeGetter(),
    fetcher: fetch,
    radarToken: env.CLOUDFLARE_RADAR_TOKEN || undefined,
    pagespeedKey: env.PAGESPEED_API_KEY || undefined,
    now: () => new Date(),
    models,
  };
}
