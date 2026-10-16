import { readFileSync } from "node:fs";
import type { Fetcher } from "../../lib/engine/types";
import type { PageGetter } from "../../lib/engine/safe-fetch";

export const NOW = new Date("2026-10-14T00:00:00Z");

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");

export const fakeGetPage: PageGetter = async (url) => {
  if (url === "https://facturo.example/") return { url, status: 200, headers: {}, text: fixture("saas-home.html") };
  if (url === "https://facturo.example/precios") return { url, status: 200, headers: {}, text: fixture("saas-pricing.html") };
  return { url, status: 404, headers: {}, text: "" };
};

type Route = (url: string) => Response | Promise<Response>;

export function fakeFetcher(overrides: Record<string, Route> = {}): Fetcher {
  const routes: Record<string, Route> = {
    "tranco-list.eu": () => Response.json({ ranks: [{ date: "2026-09-01", rank: 50000 }, { date: "2026-10-01", rank: 60000 }] }),
    "api.cloudflare.com": () => Response.json({ result: { details_0: { bucket: "100000" } } }),
    "pagespeedonline": () => Response.json({ lighthouseResult: { categories: { performance: { score: 0.34 } } } }),
    "rdap.org": () => Response.json({ events: [{ eventAction: "registration", eventDate: "2015-03-02T00:00:00Z" }] }),
    "web.archive.org": (url) =>
      url.includes("collapse=digest")
        ? Response.json([["timestamp", "digest"], ["20251101000000", "A"]])
        : Response.json([["timestamp"], ["20150401000000"]]),
    "cloudflare-dns.com": (url) =>
      url.includes("type=MX")
        ? Response.json({ Status: 0, Answer: [{ type: 15, data: "1 aspmx.l.google.com." }] })
        : Response.json({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 include:_spf.google.com include:servers.mcsv.net ~all"' }] }),
    "hn.algolia.com": () => Response.json({ nbHits: 3, hits: [{ title: "Show HN: Facturo", points: 42 }] }),
    "itunes.apple.com": () => Response.json({ resultCount: 0, results: [] }),
    "wikidata.org": () => Response.json({ search: [] }),
    "greenhouse.io": () => new Response("", { status: 404 }),
    "api.lever.co": () => new Response("", { status: 404 }),
    "ashbyhq.com": () => new Response("", { status: 404 }),
    ...overrides,
  };
  return async (url) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`URL no simulada: ${url}`);
    return routes[key](url);
  };
}
