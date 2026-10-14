import type { Fetcher, RdapData } from "../types";

export function parseRdap(json: unknown): RdapData {
  const events = (json as { events?: { eventAction?: string; eventDate?: string }[] })?.events ?? [];
  const registration = events.find((e) => e.eventAction === "registration")?.eventDate;
  return { registeredAt: registration ? registration.slice(0, 10) : null };
}

export async function fetchRdap(domain: string, fetcher: Fetcher): Promise<RdapData> {
  const res = await fetcher(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return { registeredAt: null };
  if (!res.ok) throw new Error(`RDAP respondió ${res.status}`);
  return parseRdap(await res.json());
}
