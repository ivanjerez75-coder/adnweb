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

type Outcome = "found" | "absent" | "inconclusive";

const registrable = (host: string) => getDomain(host, { allowPrivateDomains: true }) ?? host.replace(/^www\./, "");

const normalizePath = (path: string) => path.toLowerCase().replace(/\/+$/, "");

/**
 * Clasifica una respuesta:
 * - found: 2xx/3xx en el mismo dominio y en la misma ruta (o anidada bajo ella).
 * - absent: 404 o 410.
 * - inconclusive: cualquier otra cosa (401/403/429/5xx, redirección a otra ruta,
 *   a la home o a otro dominio, URL no válida, o petición fallida).
 */
function classify(requestedPath: string, site: string, result: PromiseSettledResult<FetchedPage>): Outcome {
  if (result.status === "rejected") return "inconclusive";
  const page = result.value;
  if (page.status === 404 || page.status === 410) return "absent";
  if (page.status >= 400) return "inconclusive";

  let final: URL;
  try {
    final = new URL(page.url);
  } catch {
    return "inconclusive";
  }
  if (registrable(final.hostname.toLowerCase()) !== site) return "inconclusive";

  const want = normalizePath(requestedPath);
  const got = normalizePath(final.pathname);
  return got === want || got.startsWith(`${want}/`) ? "found" : "inconclusive";
}

export async function probePaths(siteUrl: string, get: PageGetter): Promise<PathProbeData> {
  const base = new URL(siteUrl);
  const site = registrable(base.hostname.toLowerCase());

  const [control, ...results] = await Promise.allSettled([
    get(`${base.origin}${SOFT_404_PATH}`),
    ...PROBE_PATHS.map(([, path]) => get(`${base.origin}${path}`)),
  ]);

  if (results.every((r) => r.status === "rejected")) throw new Error("No se pudieron comprobar las rutas");
  // Si la ruta inventada no da 404 (o no se puede comprobar), la web no informa: no se da nada por comprobado.
  if (classify(SOFT_404_PATH, site, control) !== "absent") return { found: [], checked: [] };

  const found = new Set<ProbeKind>();
  const checked = new Set<ProbeKind>();
  const outcomesByKind = new Map<ProbeKind, Outcome[]>();

  results.forEach((r, i) => {
    const [kind, path] = PROBE_PATHS[i];
    const outcome = classify(path, site, r);
    outcomesByKind.set(kind, [...(outcomesByKind.get(kind) ?? []), outcome]);
    if (outcome === "found") found.add(kind);
  });

  for (const [kind, outcomes] of outcomesByKind) {
    if (outcomes.includes("found") || outcomes.every((o) => o === "absent")) checked.add(kind);
  }

  return { found: KIND_ORDER.filter((k) => found.has(k)), checked: KIND_ORDER.filter((k) => checked.has(k)) };
}
