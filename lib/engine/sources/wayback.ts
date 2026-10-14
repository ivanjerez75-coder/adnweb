import type { Fetcher, WaybackData } from "../types";

const CDX = "https://web.archive.org/cdx/search/cdx";

const stampToDate = (stamp: string) => `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;

function rows(json: unknown): string[][] {
  return Array.isArray(json) ? (json as string[][]).slice(1) : [];
}

export function parseWayback(firstRows: unknown, changeRows: unknown): WaybackData {
  const first = rows(firstRows)[0]?.[0];
  const changes = rows(changeRows);
  return {
    firstCapture: first ? stampToDate(first) : null,
    lastChange: changes.length > 0 ? stampToDate(changes[changes.length - 1][0]) : null,
    changesLastYear: Math.max(0, changes.length - 1),
  };
}

async function getJson(url: string, fetcher: Fetcher): Promise<unknown> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Wayback respondió ${res.status}`);
  const text = (await res.text()).trim();
  return text ? JSON.parse(text) : [];
}

export async function fetchWayback(domain: string, fetcher: Fetcher, now: Date): Promise<WaybackData> {
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const from = yearAgo.toISOString().slice(0, 10).replace(/-/g, "");
  const host = encodeURIComponent(domain);

  const firstRows = await getJson(`${CDX}?url=${host}&output=json&fl=timestamp&limit=1`, fetcher);
  const changeRows = await getJson(
    `${CDX}?url=${host}&output=json&fl=timestamp,digest&collapse=digest&from=${from}&limit=500`,
    fetcher,
  );
  return parseWayback(firstRows, changeRows);
}
