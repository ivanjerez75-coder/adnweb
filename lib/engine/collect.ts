import type { NormalizedUrl } from "./url";
import { BlockedUrlError, type PageGetter } from "./safe-fetch";
import type { CollectedSource, Fetcher, RawData, SourceStatus } from "./types";
import { fetchSite } from "./sources/site";
import { fetchTranco } from "./sources/tranco";
import { fetchRadar } from "./sources/radar";
import { fetchPageSpeed } from "./sources/pagespeed";
import { fetchRdap } from "./sources/rdap";
import { fetchWayback } from "./sources/wayback";
import { fetchSitemap } from "./sources/sitemap";
import { fetchPages, selectPages } from "./sources/pages";
import { probePaths } from "./sources/paths";
import { fetchJobs, jobCandidates } from "./sources/jobs";
import { fetchAppStore } from "./sources/appstore";
import { fetchWikidata } from "./sources/wikidata";
import { fetchDns } from "./sources/dns";
import { fetchHackerNews } from "./sources/hackernews";
import { radarRank, validRank } from "./anchors";
import { resolveDomains } from "./redirect";

export class InsufficientDataError extends Error {
  constructor(message = "No hemos podido reunir datos suficientes sobre esta web.") {
    super(message);
    this.name = "InsufficientDataError";
  }
}

export interface CollectDeps {
  getPage: PageGetter;
  fetcher: Fetcher;
  radarToken?: string;
  pagespeedKey?: string;
  now: () => Date;
  /** Plazo blando total de la recogida (por defecto 40 s). */
  deadlineMs?: number;
  /** Espera inyectable (pruebas). */
  sleep?: (ms: number) => Promise<void>;
}

export type StepReporter = (step: string) => void | Promise<void>;

const DEFAULT_DEADLINE_MS = 40_000;
/** Tope de la lectura en profundidad: lo que no llegue se descarta, el resto sigue dentro del plazo total. */
const PAGES_TIMEOUT_MS = 20_000;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    (timer as { unref?: () => void }).unref?.();
  });

type Outcome<T> = { status: "ok"; value: T } | { status: "no_aplica" } | { status: "fallo"; error: unknown };

export async function collect(
  input: NormalizedUrl,
  deps: CollectDeps,
  onStep: StepReporter = () => {},
): Promise<RawData> {
  const now = deps.now();
  const deadline = (deps.sleep ?? defaultSleep)(deps.deadlineMs ?? DEFAULT_DEADLINE_MS).then(
    (): Outcome<never> => ({ status: "fallo", error: new Error("Tiempo agotado") }),
  );

  const run = <T>(promise: Promise<T | null>): Promise<Outcome<T>> =>
    Promise.race([
      promise.then(
        (value): Outcome<T> => (value === null ? { status: "no_aplica" } : { status: "ok", value }),
        (error): Outcome<T> => ({ status: "fallo", error }),
      ),
      deadline,
    ]);
  const notApplicable = <T>(): Promise<Outcome<T>> => Promise.resolve({ status: "no_aplica" });

  // Lo que no depende de la URL final arranca ya.
  const site = run(fetchSite(input.url, deps.getPage));
  const pagespeed = run(fetchPageSpeed(input.url, deps.fetcher, deps.pagespeedKey));
  const wayback = run(fetchWayback(input.domain, deps.fetcher, now));

  await onStep("Leyendo la web…");
  const siteR = await site;
  if (siteR.status === "fallo" && siteR.error instanceof BlockedUrlError) throw siteR.error;
  const siteData = siteR.status === "ok" ? siteR.value : null;

  // Las fuentes externas usan el dominio final solo si es la misma empresa (notion.so → notion.com);
  // una redirección a Instagram, Linktree o un parking no puede darnos su ranking, Wikidata o DNS.
  const finalHost = siteData ? new URL(siteData.finalUrl).hostname : null;
  const { rootDomain, inputRoot, finalDomain, adopted, domains } = resolveDomains(input.domain, finalHost);
  /** La página final es de otro (plataforma u otra empresa): su nombre, apps y tableros no son de este negocio. */
  const foreign = finalDomain !== null && !adopted;
  const ownSite = foreign ? null : siteData;
  const companyNameFromPage = !!ownSite?.companyName;
  const companyName = ownSite?.companyName ?? inputRoot.split(".")[0];
  const baseUrl = ownSite?.finalUrl ?? input.url;

  await onStep("Analizando tráfico y presencia…");
  // El sitemap de la página final sería el de la plataforma.
  const sitemapP = foreign ? notApplicable<never>() : run(fetchSitemap(baseUrl, deps.getPage, now));
  // La lectura en profundidad usa las URLs candidatas del sitemap, pero no espera al resto de fuentes.
  const paginasP = ownSite
    ? sitemapP.then((sm) =>
        run(
          (async () => {
            const docs = await fetchPages(selectPages(ownSite, sm.status === "ok" ? sm.value : null), deps.getPage, {
              timeoutMs: PAGES_TIMEOUT_MS,
            });
            if (docs.length === 0) throw new Error("No se pudo leer ninguna página");
            return docs;
          })(),
        ),
      )
    : notApplicable<never>();
  const [trancoR, radarR, rdapR, dnsR, hnR, sitemapR, rutasR, empleoR, appR, wikiR, pagespeedR, waybackR, paginasR] = await Promise.all([
    run(fetchTranco(rootDomain, deps.fetcher)),
    deps.radarToken ? run(fetchRadar(rootDomain, deps.fetcher, deps.radarToken)) : notApplicable<never>(),
    run(fetchRdap(rootDomain, deps.fetcher)),
    run(fetchDns(rootDomain, deps.fetcher)),
    run(fetchHackerNews(rootDomain, deps.fetcher, now)),
    sitemapP,
    run(probePaths(baseUrl, deps.getPage)),
    run(fetchJobs(jobCandidates(ownSite, rootDomain), deps.fetcher)),
    run(fetchAppStore({ appIds: ownSite?.appStoreIds ?? [], companyName, domains }, deps.fetcher)),
    run(fetchWikidata({ companyName, domains }, deps.fetcher)),
    pagespeed,
    wayback,
    paginasP,
  ]);

  const fuentes = {} as Record<CollectedSource, SourceStatus>;
  const take = <T>(outcome: Outcome<T>, ...ids: CollectedSource[]): T | null => {
    for (const id of ids) fuentes[id] = outcome.status;
    return outcome.status === "ok" ? outcome.value : null;
  };

  const pageRead = take(siteR, "web", "tecnologias");
  const raw: RawData = {
    version: 3,
    url: input.url,
    domain: input.domain,
    rootDomain,
    finalDomain,
    companyNameFromPage,
    collectedAt: now.toISOString(),
    // La página de otro se leyó (web "ok"), pero no es la web del negocio: no alimenta hechos ni señales.
    site: foreign ? null : pageRead,
    foreignSite: foreign ? pageRead : null,
    tranco: take(trancoR, "tranco"),
    radar: take(radarR, "radar"),
    pagespeed: take(pagespeedR, "pagespeed"),
    rdap: take(rdapR, "rdap"),
    wayback: take(waybackR, "wayback"),
    sitemap: take(sitemapR, "sitemap"),
    rutas: take(rutasR, "rutas"),
    empleo: take(empleoR, "empleo"),
    appstore: take(appR, "appstore"),
    wikidata: take(wikiR, "wikidata"),
    dns: take(dnsR, "dns"),
    hackernews: take(hnR, "hackernews"),
    paginas: take(paginasR, "paginas"),
    fuentes,
    unavailable: [],
  };
  if (foreign) {
    // Tras una redirección no adoptada, PageSpeed y las tecnologías detectadas son las de la
    // plataforma (Instagram, Linktree…), no las del negocio: no aplican.
    raw.pagespeed = null;
    fuentes.pagespeed = "no_aplica";
    fuentes.tecnologias = "no_aplica";
  }
  raw.unavailable = (Object.keys(fuentes) as CollectedSource[]).filter((k) => fuentes[k] === "fallo");

  const hasTraffic = validRank(raw.tranco?.rank) !== null || radarRank(raw.radar) !== null;
  // Sin web propia (la de otro no cuenta) ni tráfico no hay nada cierto que contar.
  if (!raw.site && !hasTraffic) throw new InsufficientDataError();

  return raw;
}
