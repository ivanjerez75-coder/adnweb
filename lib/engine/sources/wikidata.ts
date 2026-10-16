import { getDomain } from "tldts";
import type { Fetcher, WikidataData } from "../types";

const API = "https://www.wikidata.org/w/api.php";
const HEADERS = { accept: "application/json", "user-agent": "DNAweb/0.1 (analizador de negocios digitales)" };
const CURRENCIES: Record<string, string> = { Q4916: "EUR", Q4917: "USD", Q25224: "GBP" };

interface Snak {
  datavalue?: { value?: unknown };
}

interface WikidataClaim {
  rank?: string;
  mainsnak?: Snak;
  qualifiers?: Record<string, Snak[]>;
}

export interface WikidataEntity {
  id: string;
  claims?: Record<string, WikidataClaim[]>;
  descriptions?: Record<string, { value: string }>;
  labels?: Record<string, { value: string }>;
}

const usable = (claims: WikidataClaim[] = []) => {
  const ok = claims.filter((c) => c.rank !== "deprecated");
  const preferred = ok.filter((c) => c.rank === "preferred");
  return preferred.length > 0 ? preferred : ok;
};

const yearOf = (time: unknown) => {
  const t = (time as { time?: unknown } | undefined)?.time;
  if (typeof t !== "string") return null;
  const y = Number(t.slice(1, 5));
  return Number.isFinite(y) ? y : null;
};

const pointInTime = (c: WikidataClaim) => yearOf(c.qualifiers?.P585?.[0]?.datavalue?.value);

const latest = (claims?: WikidataClaim[]) =>
  [...usable(claims)].sort((a, b) => (pointInTime(b) ?? 0) - (pointInTime(a) ?? 0))[0];

const quantity = (c?: WikidataClaim) => {
  const v = c?.mainsnak?.datavalue?.value as { amount?: unknown; unit?: unknown } | undefined;
  const n = typeof v?.amount === "string" ? Number(v.amount) : NaN;
  return Number.isFinite(n) ? { amount: n, unit: typeof v?.unit === "string" ? v.unit : "" } : null;
};

const entityId = (c: WikidataClaim) => {
  const id = (c.mainsnak?.datavalue?.value as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : null;
};

function officialDomains(e: WikidataEntity): string[] {
  return usable(e.claims?.P856)
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((u): u is string => typeof u === "string")
    .map((u) => {
      try {
        return getDomain(new URL(u).hostname, { allowPrivateDomains: true });
      } catch {
        return null;
      }
    })
    .filter((d): d is string => d !== null);
}

function labelIds(e: WikidataEntity): string[] {
  return [...usable(e.claims?.P112), ...usable(e.claims?.P159).slice(0, 1)]
    .map(entityId)
    .filter((id): id is string => id !== null)
    .slice(0, 10);
}

export function extractWikidata(e: WikidataEntity, labels: Record<string, string>): WikidataData {
  const founders = usable(e.claims?.P112)
    .map(entityId)
    .map((id) => (id ? labels[id] : undefined))
    .filter((l): l is string => typeof l === "string");
  const hqId = usable(e.claims?.P159).map(entityId)[0];
  const employeesClaim = latest(e.claims?.P1128);
  const employees = quantity(employeesClaim);
  const revenueClaim = latest(e.claims?.P2139);
  const revenue = quantity(revenueClaim);
  const currencyId = revenue?.unit.split("/").pop() ?? "";
  const currency = Object.prototype.hasOwnProperty.call(CURRENCIES, currencyId) ? CURRENCIES[currencyId] : undefined;

  return {
    id: e.id,
    description: e.descriptions?.es?.value ?? e.descriptions?.en?.value ?? null,
    inception: yearOf(usable(e.claims?.P571)[0]?.mainsnak?.datavalue?.value),
    founders,
    headquarters: hqId ? (labels[hqId] ?? null) : null,
    employees: employees ? employees.amount : null,
    employeesYear: employees && employeesClaim ? pointInTime(employeesClaim) : null,
    revenue:
      revenue && currency
        ? { amount: revenue.amount, currency, year: revenueClaim ? pointInTime(revenueClaim) : null }
        : null,
  };
}

async function api(params: Record<string, string>, fetcher: Fetcher): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ format: "json", origin: "*", ...params });
  const res = await fetcher(`${API}?${qs}`, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Wikidata respondió ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  if ("error" in body) throw new Error(`Wikidata devolvió un error: ${JSON.stringify(body.error)}`);
  return body;
}

export async function fetchWikidata(
  input: { companyName: string; domains: string[] },
  fetcher: Fetcher,
): Promise<WikidataData | null> {
  const search = await api(
    { action: "wbsearchentities", search: input.companyName, language: "en", uselang: "es", type: "item", limit: "5" },
    fetcher,
  );
  const ids = ((search.search as { id?: unknown }[] | undefined) ?? [])
    .map((s) => s.id)
    .filter((id): id is string => typeof id === "string")
    .slice(0, 5);
  if (ids.length === 0) return null;

  const got = await api({ action: "wbgetentities", ids: ids.join("|"), props: "claims|descriptions", languages: "es|en" }, fetcher);
  const entities = (got.entities ?? {}) as Record<string, WikidataEntity>;
  const domains = new Set(input.domains.map((d) => d.toLowerCase()));
  const match = ids.map((id) => entities[id]).find((e) => e && officialDomains(e).some((d) => domains.has(d.toLowerCase())));
  if (!match) return null;

  const wanted = labelIds(match);
  const labels: Record<string, string> = {};
  if (wanted.length > 0) {
    const l = await api({ action: "wbgetentities", ids: wanted.join("|"), props: "labels", languages: "es|en" }, fetcher);
    for (const [id, e] of Object.entries((l.entities ?? {}) as Record<string, WikidataEntity>)) {
      const label = e.labels?.es?.value ?? e.labels?.en?.value;
      if (label) labels[id] = label;
    }
  }
  return extractWikidata(match, labels);
}
