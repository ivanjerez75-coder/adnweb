import type { Fetcher, RadarData } from "../types";

// Solo se aceptan valores numéricos finitos y positivos: null, "", 0 o ">200000" no son un ranking.
function positiveNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseRadar(json: unknown): RadarData {
  const details = (json as { result?: { details_0?: { bucket?: unknown; rank?: unknown } } })?.result?.details_0;
  return { bucket: positiveNumber(details?.bucket), rank: positiveNumber(details?.rank) };
}

export async function fetchRadar(domain: string, fetcher: Fetcher, token: string): Promise<RadarData> {
  const res = await fetcher(
    `https://api.cloudflare.com/client/v4/radar/ranking/domain/${encodeURIComponent(domain)}?format=json`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (res.status === 404) return { bucket: null, rank: null };
  if (!res.ok) throw new Error(`Cloudflare Radar respondió ${res.status}`);
  return parseRadar(await res.json());
}
