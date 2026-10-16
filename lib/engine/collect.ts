import { getDomain } from "tldts";
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
import { probePaths } from "./sources/paths";
import { fetchJobs, jobCandidates } from "./sources/jobs";
import { fetchAppStore } from "./sources/appstore";
import { fetchWikidata } from "./sources/wikidata";
import { fetchDns } from "./sources/dns";
import { fetchHackerNews } from "./sources/hackernews";
import { radarRank, validRank } from "./anchors";

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

  // Rankings, registro y DNS van por el dominio registrable de la URL final (notion.so → notion.com).
  const finalHost = siteData ? new URL(siteData.finalUrl).hostname.toLowerCase() : input.domain;
  const rootDomain = getDomain(finalHost, { allowPrivateDomains: true }) ?? finalHost.replace(/^www\./, "");
  const baseUrl = siteData?.finalUrl ?? input.url;
  const companyName = siteData?.companyName ?? rootDomain.split(".")[0];

  await onStep("Analizando tráfico y presencia…");
  const [trancoR, radarR, rdapR, dnsR, hnR, sitemapR, rutasR, empleoR, appR, wikiR, pagespeedR, waybackR] = await Promise.all([
    run(fetchTranco(rootDomain, deps.fetcher)),
    deps.radarToken ? run(fetchRadar(rootDomain, deps.fetcher, deps.radarToken)) : notApplicable<never>(),
    run(fetchRdap(rootDomain, deps.fetcher)),
    run(fetchDns(rootDomain, deps.fetcher)),
    run(fetchHackerNews(rootDomain, deps.fetcher, now)),
    run(fetchSitemap(baseUrl, deps.getPage, now)),
    run(probePaths(baseUrl, deps.getPage)),
    run(fetchJobs(jobCandidates(siteData, rootDomain), deps.fetcher)),
    run(fetchAppStore({ appIds: siteData?.appStoreIds ?? [], companyName, rootDomain }, deps.fetcher)),
    run(fetchWikidata({ companyName, rootDomain }, deps.fetcher)),
    pagespeed,
    wayback,
  ]);

  const fuentes = {} as Record<CollectedSource, SourceStatus>;
  const take = <T>(outcome: Outcome<T>, ...ids: CollectedSource[]): T | null => {
    for (const id of ids) fuentes[id] = outcome.status;
    return outcome.status === "ok" ? outcome.value : null;
  };

  const raw: RawData = {
    url: input.url,
    domain: input.domain,
    rootDomain,
    collectedAt: now.toISOString(),
    site: take(siteR, "web", "tecnologias"),
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
    fuentes,
    unavailable: [],
  };
  raw.unavailable = (Object.keys(fuentes) as CollectedSource[]).filter((k) => fuentes[k] === "fallo");

  const hasTraffic = validRank(raw.tranco?.rank) !== null || radarRank(raw.radar) !== null;
  if (!raw.site && !hasTraffic) throw new InsufficientDataError();

  return raw;
}
