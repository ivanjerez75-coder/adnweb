import type { NormalizedUrl } from "./url";
import { BlockedUrlError, type PageGetter } from "./safe-fetch";
import type { Fetcher, RadarData, RawData, SourceId } from "./types";
import { fetchSite } from "./sources/site";
import { fetchTranco } from "./sources/tranco";
import { fetchRadar } from "./sources/radar";
import { fetchPageSpeed } from "./sources/pagespeed";
import { fetchRdap } from "./sources/rdap";
import { fetchWayback } from "./sources/wayback";

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
}

export type StepReporter = (step: string) => void | Promise<void>;

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

const settle = <T>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );

export async function collect(
  input: NormalizedUrl,
  deps: CollectDeps,
  onStep: StepReporter = () => {},
): Promise<RawData> {
  const now = deps.now();

  // Todas las fuentes arrancan en paralelo; los pasos solo marcan el progreso.
  const site = settle(fetchSite(input.url, deps.getPage));
  const tranco = settle(fetchTranco(input.domain, deps.fetcher));
  const radar = deps.radarToken
    ? settle(fetchRadar(input.domain, deps.fetcher, deps.radarToken))
    : settle<RadarData>(Promise.reject(new Error("Sin token de Cloudflare Radar")));
  const pagespeed = settle(fetchPageSpeed(input.url, deps.fetcher, deps.pagespeedKey));
  const rdap = settle(fetchRdap(input.domain, deps.fetcher));
  const wayback = settle(fetchWayback(input.domain, deps.fetcher, now));

  await onStep("Leyendo la web…");
  const siteResult = await site;
  if (!siteResult.ok && siteResult.error instanceof BlockedUrlError) throw siteResult.error;

  await onStep("Analizando tráfico y presencia…");
  const [trancoR, radarR, pagespeedR, rdapR, waybackR] = await Promise.all([tranco, radar, pagespeed, rdap, wayback]);

  const unavailable: SourceId[] = [];
  const pick = <T>(result: Settled<T>, ...ids: SourceId[]): T | null => {
    if (result.ok) return result.value;
    unavailable.push(...ids);
    return null;
  };

  const raw: RawData = {
    url: input.url,
    domain: input.domain,
    collectedAt: now.toISOString(),
    site: pick(siteResult, "web", "tecnologias"),
    tranco: pick(trancoR, "tranco"),
    radar: pick(radarR, "radar"),
    pagespeed: pick(pagespeedR, "pagespeed"),
    rdap: pick(rdapR, "rdap"),
    wayback: pick(waybackR, "wayback"),
    unavailable,
  };

  const hasTraffic = (raw.tranco?.rank ?? null) !== null || (raw.radar?.bucket ?? null) !== null;
  if (!raw.site && !hasTraffic) throw new InsufficientDataError();

  return raw;
}
