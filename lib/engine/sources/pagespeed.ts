import type { Fetcher, PageSpeedData } from "../types";

type Campo = NonNullable<PageSpeedData["campo"]>;

export interface ParsedPageSpeed {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  campo: Campo | null;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function score(categories: Record<string, unknown> | null, id: string): number | null {
  const s = num(obj(categories?.[id])?.score);
  return s === null ? null : Math.round(s * 100);
}

function percentile(metrics: Record<string, unknown>, id: string): number | null {
  return num(obj(metrics[id])?.percentile);
}

/** Datos de campo (CrUX) de un bloque loadingExperience; null si no trae ninguna métrica. */
function parseExperience(exp: unknown, fuente: Campo["fuente"]): Campo | null {
  const metrics = obj(obj(exp)?.metrics);
  if (!metrics) return null;
  const lcpMs = percentile(metrics, "LARGEST_CONTENTFUL_PAINT_MS");
  const inpMs = percentile(metrics, "INTERACTION_TO_NEXT_PAINT");
  // CrUX da el CLS multiplicado por 100 (percentil entero).
  const clsRaw = percentile(metrics, "CUMULATIVE_LAYOUT_SHIFT_SCORE");
  const cls = clsRaw === null ? null : Math.round(clsRaw) / 100;
  if (lcpMs === null && inpMs === null && cls === null) return null;
  const cat = obj(exp)?.overall_category;
  const categoria = cat === "FAST" || cat === "AVERAGE" || cat === "SLOW" ? cat : null;
  return { fuente, lcpMs, inpMs, cls, categoria };
}

export function parsePageSpeed(json: unknown): ParsedPageSpeed {
  const root = obj(json);
  const categories = obj(obj(root?.lighthouseResult)?.categories);
  return {
    performance: score(categories, "performance"),
    accessibility: score(categories, "accessibility"),
    bestPractices: score(categories, "best-practices"),
    seo: score(categories, "seo"),
    campo: parseExperience(root?.loadingExperience, "url") ?? parseExperience(root?.originLoadingExperience, "origen"),
  };
}

class QuotaError extends Error {}

export async function fetchPageSpeed(url: string, fetcher: Fetcher, now: Date, apiKey?: string): Promise<PageSpeedData> {
  const run = async (strategy: "mobile" | "desktop") => {
    const params = new URLSearchParams({ url, strategy });
    // Móvil: las 4 categorías de Lighthouse; escritorio: solo rendimiento.
    const categories = strategy === "mobile" ? ["performance", "accessibility", "best-practices", "seo"] : ["performance"];
    for (const c of categories) params.append("category", c);
    if (apiKey) params.set("key", apiKey);
    const res = await fetcher(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 429) throw new QuotaError("PageSpeed: cuota agotada (429)");
    if (!res.ok) throw new Error(`PageSpeed respondió ${res.status}`);
    return parsePageSpeed(await res.json());
  };

  const [mobile, desktop] = await Promise.allSettled([run("mobile"), run("desktop")]);
  const m = mobile.status === "fulfilled" ? mobile.value : null;
  const d = desktop.status === "fulfilled" ? desktop.value : null;
  const result: PageSpeedData = {
    mobile: m?.performance ?? null,
    desktop: d?.performance ?? null,
    accesibilidad: m?.accessibility ?? null,
    buenasPracticas: m?.bestPractices ?? null,
    seo: m?.seo ?? null,
    campo: m?.campo ?? null,
    obtenidoEn: now.toISOString(),
  };
  if (!m && !d) {
    const quota = [mobile, desktop].find((r) => r.status === "rejected" && r.reason instanceof QuotaError);
    if (quota && quota.status === "rejected") return { ...result, error: (quota.reason as Error).message };
    throw new Error("PageSpeed no disponible");
  }
  return result;
}
