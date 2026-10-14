import type { Fetcher, RadarData } from "../types";

export function parseRadar(json: unknown): RadarData {
  const details = (json as { result?: { details_0?: { bucket?: unknown } } })?.result?.details_0;
  const bucket = Number(details?.bucket);
  return { bucket: details && Number.isFinite(bucket) ? bucket : null };
}

export async function fetchRadar(domain: string, fetcher: Fetcher, token: string): Promise<RadarData> {
  const res = await fetcher(
    `https://api.cloudflare.com/client/v4/radar/ranking/domain/${encodeURIComponent(domain)}?format=json`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (res.status === 404) return { bucket: null };
  if (!res.ok) throw new Error(`Cloudflare Radar respondió ${res.status}`);
  return parseRadar(await res.json());
}
