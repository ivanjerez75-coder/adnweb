import { getDomain } from "tldts";
import type { FetchedPage, PageGetter } from "../safe-fetch";
import type { PathProbeData, ProbeKind } from "../types";

export const PROBE_PATHS: [ProbeKind, string][] = [
  ["blog", "/blog"],
  ["precios", "/pricing"],
  ["precios", "/precios"],
  ["empleo", "/careers"],
  ["empleo", "/jobs"],
  ["empleo", "/empleo"],
  ["about", "/about"],
  ["about", "/nosotros"],
];

export const SOFT_404_PATH = "/dnaweb-comprobacion-404";

const KIND_ORDER: ProbeKind[] = ["blog", "precios", "empleo", "about"];

const registrable = (host: string) => getDomain(host, { allowPrivateDomains: true }) ?? host.replace(/^www\./, "");

export async function probePaths(siteUrl: string, get: PageGetter): Promise<PathProbeData> {
  const base = new URL(siteUrl);
  const site = registrable(base.hostname.toLowerCase());

  const exists = (page: FetchedPage) => {
    if (page.status >= 400) return false;
    const final = new URL(page.url);
    return registrable(final.hostname.toLowerCase()) === site && final.pathname !== "/" && final.pathname !== "";
  };

  const [soft, ...results] = await Promise.allSettled([
    get(`${base.origin}${SOFT_404_PATH}`),
    ...PROBE_PATHS.map(([, path]) => get(`${base.origin}${path}`)),
  ]);

  if (results.every((r) => r.status === "rejected")) throw new Error("No se pudieron comprobar las rutas");
  // Si una ruta inventada "existe", la web responde 200 a todo y las rutas no informan.
  if (soft.status === "fulfilled" && exists(soft.value)) return { found: [], checked: [] };

  const found = new Set<ProbeKind>();
  const checked = new Set<ProbeKind>();
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const kind = PROBE_PATHS[i][0];
    checked.add(kind);
    if (exists(r.value)) found.add(kind);
  });

  return { found: KIND_ORDER.filter((k) => found.has(k)), checked: KIND_ORDER.filter((k) => checked.has(k)) };
}
