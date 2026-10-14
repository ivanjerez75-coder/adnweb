import type { Fetcher, TrancoData, Trend } from "../types";

interface TrancoRank {
  date: string;
  rank: number;
}

export function parseTranco(json: unknown): TrancoData {
  const ranks = ((json as { ranks?: TrancoRank[] })?.ranks ?? []).filter((r) => typeof r.rank === "number");
  if (ranks.length === 0) return { rank: null, trend: null };

  const sorted = [...ranks].sort((a, b) => a.date.localeCompare(b.date));
  const oldest = sorted[0].rank;
  const newest = sorted[sorted.length - 1].rank;

  // En un ranking, un número menor es mejor.
  let trend: Trend = "estable";
  if (newest < oldest * 0.9) trend = "sube";
  else if (newest > oldest * 1.1) trend = "baja";

  return { rank: newest, trend };
}

export async function fetchTranco(domain: string, fetcher: Fetcher): Promise<TrancoData> {
  const res = await fetcher(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Tranco respondió ${res.status}`);
  return parseTranco(await res.json());
}
