# DNAweb — Plan: Motor v2 (más fuentes y más fiabilidad)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar el motor de DNAweb con 7 fuentes gratuitas nuevas, hechos de tres estados (sí/no/desconocido), señales positivas, ancla de ingresos, ficha de empresa y una cadena de modelos Gemini con reintentos, sin romper el contrato `collect` + `buildReport` + `analyze`.

**Architecture:** Cada fuente nueva es un módulo independiente en `lib/engine/sources/` con su función `fetchX` y sus parsers puros. `collect.ts` las orquesta con un plazo total y calcula el estado de cada fuente. `facts.ts` combina fuentes en hechos de tres estados, y `signals.ts` emite señales positivas y negativas a partir de esos hechos. `report.ts` añade `empresa`, `hechos` y `fuentes`, y valida fortalezas y debilidades contra señales reales.

**Tech Stack:** TypeScript, Vitest 5, cheerio, zod 3, @google/genai, tldts, undici (existentes). No se añaden dependencias.

**Spec:** `docs/superpowers/specs/2026-10-15-dnaweb-motor-v2-design.md` (amplía `docs/superpowers/specs/2026-10-14-dnaweb-mvp-design.md`).

## Global Constraints

- MVP 100 % gratuito: ninguna fuente nueva requiere pago, clave ni tarjeta.
- `lib/engine/` no importa nada de `react`, `next` ni `@/app`. Usa imports relativos.
- Toda llamada de red pasa por el `Fetcher` o el `PageGetter` inyectados. Las URLs del sitio analizado (robots, sitemap, rutas) siempre van por `PageGetter` (SSRF).
- Ninguna prueba hace llamadas de red reales.
- Textos visibles para el usuario, en español.
- Señal negativa de presencia solo con hecho `"no"`. Regla del hecho: `"si"` si cualquier fuente lo ve; `"no"` si ≥ 2 fuentes independientes lo comprobaron y ninguna lo vio; si no, `"desconocido"`.
- Identificación de empresa: App Store y Wikidata solo se aceptan si el dominio registrable (tldts `getDomain(host, { allowPrivateDomains: true })`) coincide con el de la web analizada.
- Plazo total de recogida: 40 s (`deadlineMs`, inyectable).
- Modelos Gemini por defecto: `gemini-3.5-flash,gemini-flash-lite-latest`. Reintentos ante 503: 2000 ms y 5000 ms.
- Ingresos por empleado (EUR): saas 150 000, ecommerce 250 000, marketplace 200 000, contenido_ads 120 000, servicios 100 000, app 150 000, otro 120 000. Cambio a EUR: USD 0,92, GBP 1,17.
- Directorio: `C:\Users\ivanj\OneDrive\Desktop\dnaweb`, rama `feat/motor-v2`.
- Los mensajes de commit terminan con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx next typegen && npx tsc --noEmit` y `npm run lint` limpios al final de cada tarea.

## Review Focus

1. **Webs que responden 200 a cualquier ruta (SPA con soft-404).** La comprobación de rutas no debe marcar todas las secciones como existentes. Prueba en la Task 4.
2. **Empresa con nombre parecido en App Store o Wikidata.** Debe rechazarse si su web no coincide con el dominio analizado. Pruebas en las Tasks 6 y 7.
3. **Sitemap que se referencia a sí mismo o sitemap gigante.** Sin bucles y con límites de 4 archivos / 5 MB / 50 000 URLs. Prueba en la Task 3.
4. **Una fuente que nunca responde.** El análisis termina en el plazo, con esa fuente en `fallo`. Prueba en la Task 10.
5. **Regresión del caso Notion.** Una home sin enlaces visibles, pero con `/blog/…` en el sitemap, no produce `sin_blog`. Pruebas en las Tasks 11 y 12.

## Estructura de archivos

```
lib/engine/types.ts                 (modificar) tipos nuevos, polaridad, RawData v2
lib/engine/sources/site-parse.ts    (modificar) nombre de empresa, sameAs, enlaces a empleo y apps
lib/engine/sources/sitemap.ts       (nuevo) robots + sitemap
lib/engine/sources/paths.ts         (nuevo) comprobación de rutas con detector soft-404
lib/engine/sources/jobs.ts          (nuevo) Greenhouse / Lever / Ashby
lib/engine/sources/appstore.ts      (nuevo) iTunes lookup/search
lib/engine/sources/wikidata.ts      (nuevo) wbsearchentities + wbgetentities
lib/engine/sources/dns.ts           (nuevo) Cloudflare DoH MX/TXT
lib/engine/sources/hackernews.ts    (nuevo) Algolia HN
lib/engine/collect.ts               (modificar) dominio final, fuentes nuevas, plazo, estados
lib/engine/facts.ts                 (nuevo) hechos de tres estados
lib/engine/signals.ts               (modificar) señales positivas y negativas v2
lib/engine/anchors.ts               (modificar) anclas de ingresos
lib/engine/report.ts                (modificar) recorte de ingresos v2, empresa, hechos, fuentes, fortalezas
lib/engine/claims.ts                (nuevo) validación de fortalezas/debilidades
lib/engine/empresa.ts               (nuevo) ficha de empresa
lib/engine/ai/providers.ts          (modificar) cadena de modelos y reintentos
lib/engine/ai/schema.ts             (modificar) fortalezas/debilidades como objetos
lib/engine/ai/prompt.ts             (modificar) datos de empresa, hechos, polaridad
lib/engine/analyze.ts               (modificar) depsFromEnv con cadena de modelos
.env.example                        (modificar)
docs/decisiones/0005-fuentes-v2.md, 0006-hechos-tres-estados.md (nuevos)
tests/engine/*.test.ts, fake-network.ts, raw-fixture.ts, ai-fixture.ts
```

---

### Task 1: Tipos v2 y polaridad de señales

**Files:**
- Modify: `lib/engine/types.ts`, `lib/engine/signals.ts`, `lib/engine/report.ts:96-101`, `lib/engine/sources/site-parse.ts` (solo `buildSiteData`)
- Modify (tests): `tests/engine/raw-fixture.ts`, `tests/engine/signals.test.ts`, `tests/engine/opportunities.test.ts`, `tests/engine/ai.test.ts` y cualquier literal `Signal` que `tsc` señale
- Test: `tests/engine/signals.test.ts`

**Interfaces:**
- Produces (types.ts): `SignalPolarity = "positiva" | "negativa"`; `Signal.polarity: SignalPolarity`; `SourceId` añade `"sitemap" | "rutas" | "empleo" | "appstore" | "wikidata" | "dns" | "hackernews"`; `TechCategory` añade `"ventas" | "productividad"`; `Presence`, `SourceStatus`, `ProbeKind`, `SitemapSection`, `JobPlatform`, `JobBoardRef`, `SitemapData`, `PathProbeData`, `JobsData`, `AppStoreData`, `WikidataData`, `EmailProvider`, `DnsData`, `HackerNewsData`; `SiteData` añade `companyName: string | null`, `jobBoards: JobBoardRef[]`, `appStoreIds: string[]`.
- `RawData` NO cambia en esta tarea (lo hace la Task 10).

- [ ] **Step 1: Escribir la prueba que falla**

Añade al final de `tests/engine/signals.test.ts`:

```ts
describe("polaridad", () => {
  it("todas las señales actuales son negativas", () => {
    const raw = makeRaw({ site: makeSite({ hasBlog: false, pricesFound: [], technologies: [] }), pagespeed: { mobile: 20, desktop: 20 } });
    const signals = extractSignals(raw, NOW);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.polarity === "negativa")).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- signals`
Expected: FAIL (`polarity` es `undefined`).

- [ ] **Step 3: Ampliar `types.ts`**

Sustituye `SourceId`, `Signal` y `TechCategory`, y añade los tipos nuevos al final del archivo:

```ts
export type SourceId =
  | "web"
  | "tecnologias"
  | "tranco"
  | "radar"
  | "pagespeed"
  | "rdap"
  | "wayback"
  | "mercado"
  | "sitemap"
  | "rutas"
  | "empleo"
  | "appstore"
  | "wikidata"
  | "dns"
  | "hackernews";

export type SignalPolarity = "positiva" | "negativa";

export interface Signal {
  id: string;
  family: SignalFamily;
  source: SourceId;
  label: string;
  polarity: SignalPolarity;
}

export type TechCategory =
  | "ecommerce"
  | "cms"
  | "pagos"
  | "analitica"
  | "publicidad"
  | "chat"
  | "email"
  | "framework"
  | "ventas"
  | "productividad";
```

```ts
export type Presence = "si" | "no" | "desconocido";

export type SourceStatus = "ok" | "fallo" | "no_aplica";

export type ProbeKind = "blog" | "precios" | "empleo" | "about";

export type SitemapSection = "blog" | "ayuda" | "precios" | "empleo" | "docs";

export type JobPlatform = "greenhouse" | "lever" | "ashby";

export interface JobBoardRef {
  platform: JobPlatform;
  token: string;
}

export interface SitemapData {
  urlCount: number;
  sections: SitemapSection[];
  languages: string[];
  /** Fecha YYYY-MM-DD del lastmod más reciente. */
  lastModified: string | null;
  /** URLs de blog con lastmod en los últimos 90 días. */
  recentBlogPosts: number;
}

export interface PathProbeData {
  /** Secciones que existen. */
  found: ProbeKind[];
  /** Secciones comprobadas (al menos una petición respondió). */
  checked: ProbeKind[];
}

export interface JobsData {
  platform: JobPlatform;
  token: string;
  openings: number;
  byArea: Record<string, number>;
  linkedFromSite: boolean;
}

export interface AppStoreData {
  name: string;
  rating: number | null;
  ratingCount: number;
  url: string;
  linkedFromSite: boolean;
}

export interface WikidataData {
  id: string;
  description: string | null;
  /** Año de fundación. */
  inception: number | null;
  founders: string[];
  headquarters: string | null;
  employees: number | null;
  revenue: { amount: number; currency: string; year: number | null } | null;
}

export type EmailProvider = "Google Workspace" | "Microsoft 365" | "Otro" | "Ninguno";

export interface DnsData {
  emailProvider: EmailProvider;
  tools: Technology[];
}

export interface HackerNewsData {
  total: number;
  lastYear: number;
  top: { title: string; points: number } | null;
}
```

Añade a `SiteData`, después de `technologies`:

```ts
  companyName: string | null;
  jobBoards: JobBoardRef[];
  appStoreIds: string[];
```

- [ ] **Step 4: Añadir la polaridad a las señales existentes**

En `lib/engine/signals.ts` cambia el import y el helper `add`:

```ts
import type { RawData, Signal, SignalFamily, SignalPolarity, SourceId } from "./types";
```

```ts
  const add = (id: string, family: SignalFamily, source: SourceId, label: string, polarity: SignalPolarity = "negativa") =>
    signals.push({ id, family, source, label, polarity });
```

En `lib/engine/report.ts`, en el `map` de `marketSignals`, añade `polarity: "negativa",`. Las señales de mercado sirven de contexto para huecos y oportunidades.

En `lib/engine/sources/site-parse.ts`, en el objeto que devuelve `buildSiteData`, añade después de `technologies,`:

```ts
    companyName: null,
    jobBoards: [],
    appStoreIds: [],
```

- [ ] **Step 5: Actualizar los datos de prueba**

En `tests/engine/raw-fixture.ts`, dentro de `makeSite`, antes de `...overrides`:

```ts
    companyName: "Facturo",
    jobBoards: [],
    appStoreIds: [],
```

Ejecuta `npx tsc --noEmit`. En cada literal de tipo `Signal` que falle por falta de `polarity` (helper `sig()` de `opportunities.test.ts`, señales de `ai.test.ts`, objetos esperados en `signals.test.ts`), añade `polarity: "negativa"`. No cambies nada más de esas pruebas.

- [ ] **Step 6: Ejecutar y comprobar que pasa**

Run: `npm test`
Expected: PASS en todo.
Run: `npx next typegen && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/engine tests/engine
git commit -m "Add v2 engine types and signal polarity"
```

---

### Task 2: Nombre de empresa, sameAs y enlaces a empleo y apps

**Files:**
- Modify: `lib/engine/sources/site-parse.ts`
- Test: `tests/engine/site-parse.test.ts`

**Interfaces:**
- Consumes: `JobBoardRef`, `JobPlatform` (Task 1).
- Produces: `ParsedPage` añade `companyName: string | null`, `jobBoards: JobBoardRef[]`, `appStoreIds: string[]`; `parsePage` mezcla los `sameAs` de JSON-LD Organization en `socialLinks` sin pisar los existentes; `buildSiteData` rellena `companyName` (de la primera página), `jobBoards` y `appStoreIds` (sin duplicados).

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade al final de `tests/engine/site-parse.test.ts`:

```ts
describe("parsePage — datos de empresa", () => {
  const html = `<!doctype html><html lang="en"><head><title>Acme | Project tools</title>
<meta property="og:site_name" content="Acme Site">
<script type="application/ld+json">{"@context":"https://schema.org","@type":["Organization","Brand"],"name":"Acme Inc","sameAs":["https://twitter.com/acme","https://www.instagram.com/acme/"]}</script>
<script src="https://boards.greenhouse.io/embed/job_board/js?for=acmeinc"></script></head>
<body><a href="https://jobs.lever.co/acme/123">Jobs</a><a href="https://apps.apple.com/us/app/acme/id123456789">iOS</a><a href="https://twitter.com/acme">X</a></body></html>`;
  const parsed = parsePage(html, "https://acme.example/");

  it("toma el nombre de la Organization de JSON-LD", () => {
    expect(parsed.companyName).toBe("Acme Inc");
  });

  it("admite @type como lista", () => {
    expect(parsed.jsonLdTypes).toEqual(["Organization", "Brand"]);
  });

  it("añade las redes de sameAs sin pisar los enlaces", () => {
    expect(parsed.socialLinks).toEqual({ x: "https://twitter.com/acme", instagram: "https://www.instagram.com/acme/" });
  });

  it("detecta tableros de empleo enlazados y embebidos", () => {
    expect(parsed.jobBoards).toEqual([
      { platform: "lever", token: "acme" },
      { platform: "greenhouse", token: "acmeinc" },
    ]);
  });

  it("detecta ids de App Store", () => {
    expect(parsed.appStoreIds).toEqual(["123456789"]);
  });
});

describe("parsePage — nombre de empresa sin JSON-LD", () => {
  it("usa og:site_name", () => {
    const html = `<html><head><title>Beta — Facturas</title><meta property="og:site_name" content="Beta App"></head><body></body></html>`;
    expect(parsePage(html, "https://beta.example/").companyName).toBe("Beta App");
  });
  it("usa el título hasta el separador", () => {
    const html = `<html><head><title>Gamma | Home</title></head><body></body></html>`;
    expect(parsePage(html, "https://gamma.example/").companyName).toBe("Gamma");
  });
  it("devuelve null sin título", () => {
    expect(parsePage("<html><body></body></html>", "https://x.example/").companyName).toBeNull();
  });
  it("Facturo sale del título del fixture", () => {
    expect(parsePage(fixture("saas-home.html"), HOME).companyName).toBe("Facturo");
  });
});

describe("buildSiteData — datos de empresa", () => {
  it("toma el nombre de la home y une tableros y apps sin duplicados", () => {
    const a = parsePage(`<html><head><title>Uno | x</title></head><body><a href="https://jobs.lever.co/uno">J</a><a href="https://apps.apple.com/app/id1">A</a></body></html>`, "https://uno.example/");
    const b = parsePage(`<html><head><title>Otra | y</title></head><body><a href="https://jobs.lever.co/uno/9">J</a><a href="https://apps.apple.com/es/app/x/id2">A</a></body></html>`, "https://uno.example/about");
    const site = buildSiteData("https://uno.example/", [a, b], []);
    expect(site.companyName).toBe("Uno");
    expect(site.jobBoards).toEqual([{ platform: "lever", token: "uno" }]);
    expect(site.appStoreIds).toEqual(["1", "2"]);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `npm test -- site-parse`
Expected: FAIL (`companyName`, `jobBoards` y `appStoreIds` no existen).

- [ ] **Step 3: Implementar**

En `lib/engine/sources/site-parse.ts`:

1. Cambia el import de tipos:

```ts
import type { JobBoardRef, JobPlatform, SiteData, SitePage, Technology } from "../types";
```

2. Añade a `ParsedPage`:

```ts
  companyName: string | null;
  jobBoards: JobBoardRef[];
  appStoreIds: string[];
```

3. Sustituye la función `collectTypes` por:

```ts
interface JsonLdInfo {
  types: string[];
  orgNames: string[];
  sameAs: string[];
}

const ORG_TYPES = new Set(["Organization", "Corporation", "Company", "OnlineStore", "OnlineBusiness", "LocalBusiness", "NGO"]);

function walkJsonLd(node: unknown, out: JsonLdInfo): void {
  if (Array.isArray(node)) {
    node.forEach((n) => walkJsonLd(n, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const rawType = obj["@type"];
  const types = Array.isArray(rawType)
    ? rawType.filter((t): t is string => typeof t === "string")
    : typeof rawType === "string"
      ? [rawType]
      : [];
  for (const t of types) if (!out.types.includes(t)) out.types.push(t);
  if (types.some((t) => ORG_TYPES.has(t))) {
    if (typeof obj.name === "string" && obj.name.trim()) out.orgNames.push(obj.name.trim());
    const sameAs = Array.isArray(obj.sameAs) ? obj.sameAs : [obj.sameAs];
    for (const s of sameAs) if (typeof s === "string") out.sameAs.push(s);
  }
  if (Array.isArray(obj["@graph"])) walkJsonLd(obj["@graph"], out);
}

const JOB_HOSTS: Record<string, JobPlatform> = {
  "boards.greenhouse.io": "greenhouse",
  "job-boards.greenhouse.io": "greenhouse",
  "jobs.lever.co": "lever",
  "jobs.ashbyhq.com": "ashby",
};
const GREENHOUSE_EMBED_RE = /greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/gi;
const TITLE_SEPARATOR_RE = /\s+[—–|\-:·]\s+/;

function titlePrefix(title: string): string | null {
  const first = title.split(TITLE_SEPARATOR_RE)[0]?.trim();
  return first ? first.slice(0, 60) : null;
}
```

4. En `parsePage`, sustituye el bloque de JSON-LD por:

```ts
  const jsonLd: JsonLdInfo = { types: [], orgNames: [], sameAs: [] };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walkJsonLd(JSON.parse($(el).text()), jsonLd);
    } catch {
      // JSON-LD mal formado: se ignora
    }
  });
  const ogSiteName = clean($('meta[property="og:site_name"]').attr("content") ?? "");
```

5. Antes del bucle `$("a[href]").each`, declara:

```ts
  const jobBoards: JobBoardRef[] = [];
  const appStoreIds: string[] = [];
  const addJobBoard = (platform: JobPlatform, token: string) => {
    if (/^[a-z0-9_.-]+$/i.test(token) && token !== "embed" && !jobBoards.some((j) => j.platform === platform && j.token === token)) {
      jobBoards.push({ platform, token });
    }
  };
```

Dentro del bucle, justo después de la línea `if (host === "apps.apple.com" || host === "play.google.com") hasAppLinks = true;`, añade:

```ts
    const jobPlatform = JOB_HOSTS[abs.hostname.toLowerCase()];
    const firstSegment = abs.pathname.split("/").filter(Boolean)[0];
    if (jobPlatform && firstSegment) addJobBoard(jobPlatform, firstSegment);
    if (host === "apps.apple.com") {
      const id = abs.pathname.match(/\/id(\d+)/)?.[1];
      if (id && !appStoreIds.includes(id)) appStoreIds.push(id);
    }
```

Después del bucle añade:

```ts
  for (const m of html.matchAll(GREENHOUSE_EMBED_RE)) addJobBoard("greenhouse", m[1]);
  for (const s of jsonLd.sameAs) {
    try {
      const u = new URL(s);
      const network = SOCIAL_HOSTS[bareHost(u.hostname)];
      if (network && !socialLinks[network]) socialLinks[network] = u.toString();
    } catch {
      // URL de sameAs inválida: se ignora
    }
  }
```

6. En el objeto devuelto por `parsePage`, cambia `jsonLdTypes,` por `jsonLdTypes: jsonLd.types,` y añade:

```ts
    companyName: jsonLd.orgNames[0] ?? (ogSiteName || null) ?? titlePrefix(title),
    jobBoards,
    appStoreIds,
```

Ojo: `(ogSiteName || null) ?? titlePrefix(title)` aplica `titlePrefix` solo cuando no hay `og:site_name`.

7. En `buildSiteData`, sustituye las tres líneas añadidas en la Task 1 por:

```ts
    companyName: pages[0]?.companyName ?? null,
    jobBoards: pages
      .flatMap((p) => p.jobBoards)
      .filter((j, i, all) => all.findIndex((o) => o.platform === j.platform && o.token === j.token) === i),
    appStoreIds: Array.from(new Set(pages.flatMap((p) => p.appStoreIds))),
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- site-parse site tech`
Expected: PASS, incluidas las pruebas antiguas.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/site-parse.ts tests/engine/site-parse.test.ts
git commit -m "Extract company name, sameAs socials, job boards and App Store ids from pages"
```

---

### Task 3: Fuente sitemap

**Files:**
- Create: `lib/engine/sources/sitemap.ts`
- Test: `tests/engine/sitemap.test.ts`

**Interfaces:**
- Consumes: `PageGetter`, `FetchedPage` (safe-fetch.ts); `SitemapData`, `SitemapSection` (Task 1).
- Produces: `parseSitemapXml(xml: string): ParsedSitemap`; `sitemapsFromRobots(robots: string, origin: string): string[]`; `summarizeSitemap(urls: SitemapUrl[], now: Date): SitemapData`; `fetchSitemap(siteUrl: string, get: PageGetter, now: Date): Promise<SitemapData | null>`. Devuelve `null` si no hay sitemap legible. Lanza un error si todas las peticiones fallaron.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/sitemap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSitemapXml, sitemapsFromRobots, summarizeSitemap, fetchSitemap } from "../../lib/engine/sources/sitemap";
import type { FetchedPage, PageGetter } from "../../lib/engine/safe-fetch";

const NOW = new Date("2026-10-15T00:00:00Z");
const page = (url: string, text: string, status = 200): FetchedPage => ({ url, status, headers: {}, text });

const URLSET = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc>https://acme.example/</loc><lastmod>2026-10-01</lastmod><xhtml:link rel="alternate" hreflang="fr" href="https://acme.example/fr/"/></url>
<url><loc>https://acme.example/blog/post-1?a=1&amp;b=2</loc><lastmod>2026-09-20T10:00:00+00:00</lastmod></url>
<url><loc>https://acme.example/blog/post-2</loc><lastmod>2026-05-01</lastmod></url>
<url><loc>https://acme.example/es/precios</loc></url>
<url><loc>https://acme.example/careers</loc><lastmod>2030-01-01</lastmod></url>
<url><loc>https://acme.example/go/app</loc></url>
</urlset>`;

describe("parseSitemapXml", () => {
  it("lee un urlset con loc, lastmod y hreflang", () => {
    const parsed = parseSitemapXml(URLSET);
    expect(parsed.kind).toBe("urlset");
    expect(parsed.urls).toHaveLength(6);
    expect(parsed.urls[0]).toEqual({ loc: "https://acme.example/", lastmod: "2026-10-01", hreflangs: ["fr"] });
    expect(parsed.urls[1].loc).toBe("https://acme.example/blog/post-1?a=1&b=2");
  });

  it("lee un índice de sitemaps", () => {
    const xml = `<sitemapindex><sitemap><loc>https://acme.example/s1.xml</loc></sitemap><sitemap><loc>https://acme.example/s2.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemapXml(xml)).toEqual({ kind: "index", children: ["https://acme.example/s1.xml", "https://acme.example/s2.xml"], urls: [] });
  });
});

describe("sitemapsFromRobots", () => {
  it("extrae hasta 3 líneas Sitemap absolutas", () => {
    const robots = "User-agent: *\nDisallow: /x\nSitemap: https://acme.example/a.xml\nsitemap: /b.xml\nSitemap: ftp://x/c.xml\nSitemap: https://acme.example/d.xml\nSitemap: https://acme.example/e.xml";
    expect(sitemapsFromRobots(robots, "https://acme.example")).toEqual([
      "https://acme.example/a.xml",
      "https://acme.example/b.xml",
      "https://acme.example/d.xml",
    ]);
  });
});

describe("summarizeSitemap", () => {
  it("cuenta URLs, secciones, idiomas, última fecha y blog reciente", () => {
    expect(summarizeSitemap(parseSitemapXml(URLSET).urls, NOW)).toEqual({
      urlCount: 6,
      sections: ["blog", "precios", "empleo"],
      languages: ["es", "fr"],
      lastModified: "2026-10-01",
      recentBlogPosts: 1,
    });
  });
});

describe("fetchSitemap", () => {
  const getter = (pages: Record<string, FetchedPage>): PageGetter & { calls: string[] } => {
    const calls: string[] = [];
    return Object.assign(
      async (url: string) => {
        calls.push(url);
        return pages[url] ?? page(url, "", 404);
      },
      { calls },
    );
  };

  it("sigue robots → índice → hijos", async () => {
    const get = getter({
      "https://acme.example/robots.txt": page("https://acme.example/robots.txt", "Sitemap: https://acme.example/index.xml"),
      "https://acme.example/index.xml": page("https://acme.example/index.xml", `<sitemapindex><sitemap><loc>https://acme.example/a.xml</loc></sitemap></sitemapindex>`),
      "https://acme.example/a.xml": page("https://acme.example/a.xml", URLSET),
    });
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(data?.urlCount).toBe(6);
  });

  it("usa /sitemap.xml si robots no declara sitemaps", async () => {
    const get = getter({ "https://acme.example/sitemap.xml": page("https://acme.example/sitemap.xml", URLSET) });
    expect((await fetchSitemap("https://acme.example/page", get, NOW))?.urlCount).toBe(6);
  });

  it("no entra en bucle con un índice que se referencia a sí mismo y limita a 4 archivos", async () => {
    const index = (n: number) => `<sitemapindex><sitemap><loc>https://acme.example/i${n}.xml</loc></sitemap><sitemap><loc>https://acme.example/i0.xml</loc></sitemap></sitemapindex>`;
    const pages: Record<string, FetchedPage> = { "https://acme.example/robots.txt": page("https://acme.example/robots.txt", "Sitemap: https://acme.example/i0.xml") };
    for (let n = 0; n < 10; n++) pages[`https://acme.example/i${n}.xml`] = page(`https://acme.example/i${n}.xml`, index(n + 1));
    const get = getter(pages);
    await fetchSitemap("https://acme.example/", get, NOW);
    expect(get.calls.filter((c) => c.endsWith(".xml"))).toHaveLength(4);
  });

  it("devuelve null si no hay sitemap", async () => {
    expect(await fetchSitemap("https://acme.example/", getter({}), NOW)).toBeNull();
  });

  it("lanza error si todas las peticiones fallan", async () => {
    const get: PageGetter = async () => {
      throw new Error("timeout");
    };
    await expect(fetchSitemap("https://acme.example/", get, NOW)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- sitemap`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar**

`lib/engine/sources/sitemap.ts`:

```ts
import type { FetchedPage, PageGetter } from "../safe-fetch";
import type { SitemapData, SitemapSection } from "../types";

const MAX_SITEMAP_FILES = 4; // raíz + 3 hijos
const MAX_TOTAL_BYTES = 5_000_000;
const MAX_URLS = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const SECTION_RES: [SitemapSection, RegExp][] = [
  ["blog", /\/(blog|noticias|news|articulos|recursos)(\/|$)/i],
  ["ayuda", /\/(help|ayuda|support|soporte|faq)(\/|$)/i],
  ["precios", /\/(pricing|precios|tarifas|planes|plans)(\/|$)/i],
  ["empleo", /\/(careers|jobs|empleo|trabaja-con-nosotros|join-us)(\/|$)/i],
  ["docs", /\/(docs|documentation|documentacion|developers)(\/|$)/i],
];

const LANGUAGE_CODES = new Set([
  "es", "en", "fr", "de", "it", "pt", "nl", "pl", "ru", "ja", "zh", "ko", "sv", "da", "no", "fi",
  "tr", "ar", "ca", "eu", "gl", "cs", "ro", "hu", "el", "he", "id", "th", "vi", "uk",
]);

export interface SitemapUrl {
  loc: string;
  lastmod: string | null;
  hreflangs: string[];
}

export interface ParsedSitemap {
  kind: "index" | "urlset";
  children: string[];
  urls: SitemapUrl[];
}

const decode = (s: string) => s.replace(/&amp;/g, "&").trim();

export function parseSitemapXml(xml: string): ParsedSitemap {
  if (/<sitemapindex[\s>]/i.test(xml)) {
    const children = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<]+?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)].map((m) => decode(m[1]));
    return { kind: "index", children, urls: [] };
  }
  const urls: SitemapUrl[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = m[1];
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    urls.push({
      loc: decode(loc),
      lastmod: block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1] ?? null,
      hreflangs: [...block.matchAll(/hreflang=["']([a-zA-Z-]+)["']/g)].map((h) => h[1].toLowerCase()),
    });
  }
  return { kind: "urlset", children: [], urls };
}

export function sitemapsFromRobots(robots: string, origin: string): string[] {
  const out: string[] = [];
  for (const line of robots.split(/\r?\n/)) {
    const value = line.match(/^\s*sitemap:\s*(\S+)/i)?.[1];
    if (!value) continue;
    try {
      const url = new URL(value, origin);
      if (url.protocol === "http:" || url.protocol === "https:") out.push(url.toString());
    } catch {
      // línea inválida
    }
  }
  return out.slice(0, 3);
}

export function summarizeSitemap(urls: SitemapUrl[], now: Date): SitemapData {
  const sections = new Set<SitemapSection>();
  const languages = new Set<string>();
  let latest = 0;
  let recentBlogPosts = 0;

  for (const u of urls) {
    let path: string;
    try {
      path = new URL(u.loc).pathname;
    } catch {
      continue;
    }
    const urlSections = SECTION_RES.filter(([, re]) => re.test(path)).map(([s]) => s);
    urlSections.forEach((s) => sections.add(s));

    const first = path.split("/").filter(Boolean)[0]?.toLowerCase().split("-")[0];
    if (first && LANGUAGE_CODES.has(first)) languages.add(first);
    for (const h of u.hreflangs) {
      const l = h.split("-")[0];
      if (LANGUAGE_CODES.has(l)) languages.add(l);
    }

    const t = u.lastmod ? Date.parse(u.lastmod) : NaN;
    if (Number.isFinite(t) && t <= now.getTime() + DAY_MS) {
      latest = Math.max(latest, t);
      if (urlSections.includes("blog") && now.getTime() - t <= 90 * DAY_MS) recentBlogPosts++;
    }
  }

  return {
    urlCount: urls.length,
    sections: SECTION_RES.map(([s]) => s).filter((s) => sections.has(s)),
    languages: [...languages].sort(),
    lastModified: latest ? new Date(latest).toISOString().slice(0, 10) : null,
    recentBlogPosts,
  };
}

export async function fetchSitemap(siteUrl: string, get: PageGetter, now: Date): Promise<SitemapData | null> {
  const origin = new URL(siteUrl).origin;
  let requests = 0;
  let failures = 0;

  const tryGet = async (url: string): Promise<FetchedPage | null> => {
    requests++;
    try {
      return await get(url);
    } catch {
      failures++;
      return null;
    }
  };

  let queue: string[] = [];
  const robots = await tryGet(`${origin}/robots.txt`);
  if (robots && robots.status < 400) queue = sitemapsFromRobots(robots.text, origin);
  if (queue.length === 0) queue = [`${origin}/sitemap.xml`];

  const seen = new Set<string>();
  const urls: SitemapUrl[] = [];
  let bytes = 0;
  let parsedAny = false;

  while (queue.length > 0 && seen.size < MAX_SITEMAP_FILES && bytes < MAX_TOTAL_BYTES && urls.length < MAX_URLS) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const file = await tryGet(next);
    if (!file || file.status >= 400 || /\.gz$/i.test(next)) continue;
    bytes += file.text.length;
    const parsed = parseSitemapXml(file.text);
    if (parsed.kind === "index") {
      parsedAny = true;
      queue.push(...parsed.children.filter((c) => /^https?:\/\//i.test(c)));
    } else if (parsed.urls.length > 0) {
      parsedAny = true;
      urls.push(...parsed.urls.slice(0, MAX_URLS - urls.length));
    }
  }

  if (!parsedAny) {
    if (requests > 0 && failures === requests) throw new Error("No se pudo leer el sitemap");
    return null;
  }
  return summarizeSitemap(urls, now);
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- sitemap`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/sitemap.ts tests/engine/sitemap.test.ts
git commit -m "Add sitemap source with robots discovery and size limits"
```

---

### Task 4: Comprobación de rutas con detector de soft-404

**Files:**
- Create: `lib/engine/sources/paths.ts`
- Test: `tests/engine/paths.test.ts`

**Interfaces:**
- Consumes: `PageGetter`, `FetchedPage`; `PathProbeData`, `ProbeKind` (Task 1).
- Produces: `PROBE_PATHS: [ProbeKind, string][]`; `SOFT_404_PATH = "/dnaweb-comprobacion-404"`; `probePaths(siteUrl: string, get: PageGetter): Promise<PathProbeData>`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/paths.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { probePaths, SOFT_404_PATH } from "../../lib/engine/sources/paths";
import type { FetchedPage, PageGetter } from "../../lib/engine/safe-fetch";

const page = (url: string, status = 200, finalUrl = url): FetchedPage => ({ url: finalUrl, status, headers: {}, text: "" });

describe("probePaths", () => {
  it("marca las secciones que existen y las comprobadas", async () => {
    const get: PageGetter = async (url) => {
      if (url.endsWith("/blog")) return page(url);
      if (url.endsWith("/careers")) return page(url, 200, "https://www.notion.com/careers");
      if (url.endsWith("/about")) return page(url, 200, "https://notion.com/"); // redirige a la home
      return page(url, 404);
    };
    const data = await probePaths("https://notion.com/", get);
    expect(data.found).toEqual(["blog", "empleo"]);
    expect(data.checked).toEqual(["blog", "precios", "empleo", "about"]);
  });

  it("ignora redirecciones a otro dominio", async () => {
    const get: PageGetter = async (url) => (url.endsWith("/blog") ? page(url, 200, "https://medium.com/acme") : page(url, 404));
    expect((await probePaths("https://acme.example/", get)).found).toEqual([]);
  });

  it("no da nada por comprobado si la web responde 200 a cualquier ruta", async () => {
    const get: PageGetter = async (url) => page(url, 200);
    expect(await probePaths("https://spa.example/", get)).toEqual({ found: [], checked: [] });
  });

  it("solo cuenta como comprobadas las secciones con alguna respuesta", async () => {
    const get: PageGetter = async (url) => {
      if (url.endsWith(SOFT_404_PATH)) return page(url, 404);
      if (url.endsWith("/blog")) throw new Error("timeout");
      return page(url, 404);
    };
    expect((await probePaths("https://acme.example/", get)).checked).toEqual(["precios", "empleo", "about"]);
  });

  it("lanza error si ninguna ruta responde", async () => {
    const get: PageGetter = async () => {
      throw new Error("caída");
    };
    await expect(probePaths("https://acme.example/", get)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- paths`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar**

`lib/engine/sources/paths.ts`:

```ts
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
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- paths`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/paths.ts tests/engine/paths.test.ts
git commit -m "Add path probing with soft-404 detection"
```

---

### Task 5: Fuente de empleo (Greenhouse, Lever, Ashby)

**Files:**
- Create: `lib/engine/sources/jobs.ts`
- Test: `tests/engine/jobs.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `SiteData`, `JobsData`, `JobBoardRef`, `JobPlatform`.
- Produces: `interface JobCandidate extends JobBoardRef { linkedFromSite: boolean }`; `jobCandidates(site: SiteData | null, rootDomain: string): JobCandidate[]`; `parseGreenhouse(json: unknown): JobCount | null`, `parseLever(json: unknown): JobCount | null`, `parseAshby(json: unknown): JobCount | null` con `JobCount = { openings: number; byArea: Record<string, number> }`; `fetchJobs(candidates: JobCandidate[], fetcher: Fetcher): Promise<JobsData | null>`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/jobs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { jobCandidates, parseGreenhouse, parseLever, parseAshby, fetchJobs } from "../../lib/engine/sources/jobs";
import { makeSite } from "./raw-fixture";

describe("jobCandidates", () => {
  it("prioriza los tableros enlazados y añade la etiqueta del dominio en las 3 plataformas", () => {
    const site = makeSite({ jobBoards: [{ platform: "lever", token: "facturo-hq" }] });
    expect(jobCandidates(site, "facturo.example")).toEqual([
      { platform: "lever", token: "facturo-hq", linkedFromSite: true },
      { platform: "greenhouse", token: "facturo", linkedFromSite: false },
      { platform: "lever", token: "facturo", linkedFromSite: false },
      { platform: "ashby", token: "facturo", linkedFromSite: false },
    ]);
  });

  it("no duplica un candidato enlazado y adivinado", () => {
    const site = makeSite({ jobBoards: [{ platform: "ashby", token: "facturo" }] });
    expect(jobCandidates(site, "facturo.example").filter((c) => c.platform === "ashby")).toEqual([
      { platform: "ashby", token: "facturo", linkedFromSite: true },
    ]);
  });
});

describe("parsers", () => {
  it("Greenhouse cuenta ofertas únicas por departamento", () => {
    const json = { departments: [{ name: "Engineering", jobs: [{ id: 1 }, { id: 2 }] }, { name: "Sales", jobs: [{ id: 2 }, { id: 3 }] }, { name: "Vacío", jobs: [] }] };
    expect(parseGreenhouse(json)).toEqual({ openings: 3, byArea: { Engineering: 2, Sales: 2 } });
  });
  it("Lever agrupa por departamento o equipo", () => {
    const json = [{ categories: { department: "Engineering" } }, { categories: { team: "Support" } }, { categories: {} }];
    expect(parseLever(json)).toEqual({ openings: 3, byArea: { Engineering: 1, Support: 1, Otros: 1 } });
  });
  it("Ashby ignora las ofertas no publicadas", () => {
    const json = { jobs: [{ department: "Design", isListed: true }, { team: "Ops" }, { department: "X", isListed: false }] };
    expect(parseAshby(json)).toEqual({ openings: 2, byArea: { Design: 1, Ops: 1 } });
  });
  it("devuelven null con formas inesperadas", () => {
    expect(parseGreenhouse({})).toBeNull();
    expect(parseLever({ ok: true })).toBeNull();
    expect(parseAshby(null)).toBeNull();
  });
});

describe("fetchJobs", () => {
  const lever = [{ categories: { department: "Engineering" } }];

  it("devuelve el primer candidato con ofertas, en orden de prioridad", async () => {
    const data = await fetchJobs(
      [
        { platform: "greenhouse", token: "a", linkedFromSite: false },
        { platform: "lever", token: "b", linkedFromSite: false },
      ],
      async (url) => (url.includes("api.lever.co/v0/postings/b") ? Response.json(lever) : new Response("", { status: 404 })),
    );
    expect(data).toEqual({ platform: "lever", token: "b", openings: 1, byArea: { Engineering: 1 }, linkedFromSite: false });
  });

  it("acepta un tablero enlazado aunque tenga 0 ofertas, pero no uno adivinado", async () => {
    const fetcher = async () => Response.json([]);
    expect(await fetchJobs([{ platform: "lever", token: "x", linkedFromSite: false }], fetcher)).toBeNull();
    expect((await fetchJobs([{ platform: "lever", token: "x", linkedFromSite: true }], fetcher))?.openings).toBe(0);
  });

  it("usa los endpoints públicos", async () => {
    const urls: string[] = [];
    await fetchJobs(
      [
        { platform: "greenhouse", token: "g", linkedFromSite: false },
        { platform: "lever", token: "l", linkedFromSite: false },
        { platform: "ashby", token: "a", linkedFromSite: false },
      ],
      async (url) => {
        urls.push(url);
        return new Response("", { status: 404 });
      },
    );
    expect(urls).toEqual([
      "https://boards-api.greenhouse.io/v1/boards/g/departments",
      "https://api.lever.co/v0/postings/l?mode=json",
      "https://api.ashbyhq.com/posting-api/job-board/a",
    ]);
  });

  it("lanza error si ninguna plataforma responde", async () => {
    const fetcher = async () => {
      throw new Error("red caída");
    };
    await expect(fetchJobs([{ platform: "lever", token: "x", linkedFromSite: false }], fetcher)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- jobs`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar**

`lib/engine/sources/jobs.ts`:

```ts
import type { Fetcher, JobBoardRef, JobPlatform, JobsData, SiteData } from "../types";

export interface JobCandidate extends JobBoardRef {
  linkedFromSite: boolean;
}

export interface JobCount {
  openings: number;
  byArea: Record<string, number>;
}

const PLATFORMS: JobPlatform[] = ["greenhouse", "lever", "ashby"];

const ENDPOINTS: Record<JobPlatform, (token: string) => string> = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/departments`,
  lever: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`,
};

export function jobCandidates(site: SiteData | null, rootDomain: string): JobCandidate[] {
  const out: JobCandidate[] = [];
  const add = (c: JobCandidate) => {
    if (!out.some((o) => o.platform === c.platform && o.token.toLowerCase() === c.token.toLowerCase())) out.push(c);
  };
  for (const b of site?.jobBoards ?? []) add({ ...b, linkedFromSite: true });
  const label = rootDomain.split(".")[0];
  if (label) for (const platform of PLATFORMS) add({ platform, token: label, linkedFromSite: false });
  return out.slice(0, 6);
}

const area = (...names: unknown[]) => {
  const n = names.find((x): x is string => typeof x === "string" && x.trim().length > 0);
  return n ? n.trim() : "Otros";
};

function tally(areas: string[]): JobCount {
  const byArea: Record<string, number> = {};
  for (const a of areas) byArea[a] = (byArea[a] ?? 0) + 1;
  return { openings: areas.length, byArea };
}

export function parseGreenhouse(json: unknown): JobCount | null {
  const departments = (json as { departments?: { name?: unknown; jobs?: { id?: unknown }[] }[] } | null)?.departments;
  if (!Array.isArray(departments)) return null;
  const ids = new Set<unknown>();
  const byArea: Record<string, number> = {};
  for (const d of departments) {
    const jobs = Array.isArray(d.jobs) ? d.jobs : [];
    if (jobs.length === 0) continue;
    byArea[area(d.name)] = jobs.length;
    jobs.forEach((j) => ids.add(j.id));
  }
  return { openings: ids.size, byArea };
}

export function parseLever(json: unknown): JobCount | null {
  if (!Array.isArray(json)) return null;
  return tally(
    json.map((p) => {
      const c = (p as { categories?: { department?: unknown; team?: unknown } }).categories ?? {};
      return area(c.department, c.team);
    }),
  );
}

export function parseAshby(json: unknown): JobCount | null {
  const jobs = (json as { jobs?: { department?: unknown; team?: unknown; isListed?: unknown }[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return null;
  return tally(jobs.filter((j) => j.isListed !== false).map((j) => area(j.department, j.team)));
}

const PARSERS: Record<JobPlatform, (json: unknown) => JobCount | null> = {
  greenhouse: parseGreenhouse,
  lever: parseLever,
  ashby: parseAshby,
};

export async function fetchJobs(candidates: JobCandidate[], fetcher: Fetcher): Promise<JobsData | null> {
  const results = await Promise.allSettled(
    candidates.map(async (c) => {
      const res = await fetcher(ENDPOINTS[c.platform](c.token), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      return PARSERS[c.platform](await res.json().catch(() => null));
    }),
  );

  if (results.length > 0 && results.every((r) => r.status === "rejected")) {
    throw new Error("Las plataformas de empleo no responden");
  }

  for (let i = 0; i < candidates.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const c = candidates[i];
    if (r.value.openings > 0 || c.linkedFromSite) {
      return { platform: c.platform, token: c.token, openings: r.value.openings, byArea: r.value.byArea, linkedFromSite: c.linkedFromSite };
    }
  }
  return null;
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- jobs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/jobs.ts tests/engine/jobs.test.ts
git commit -m "Add job openings source for Greenhouse, Lever and Ashby"
```

---

### Task 6: Fuente App Store

**Files:**
- Create: `lib/engine/sources/appstore.ts`
- Test: `tests/engine/appstore.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `AppStoreData`.
- Produces: `fetchAppStore(input: { appIds: string[]; companyName: string; rootDomain: string }, fetcher: Fetcher): Promise<AppStoreData | null>`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/appstore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchAppStore } from "../../lib/engine/sources/appstore";

const app = (over: Record<string, unknown>) => ({
  trackName: "Acme",
  averageUserRating: 4.66,
  userRatingCount: 1200,
  trackViewUrl: "https://apps.apple.com/app/id1",
  sellerUrl: "https://www.acme.example/",
  ...over,
});

describe("fetchAppStore", () => {
  it("busca por id si la web enlaza a la app y elige la de más valoraciones", async () => {
    let called = "";
    const data = await fetchAppStore({ appIds: ["1", "2"], companyName: "Acme", rootDomain: "acme.example" }, async (url) => {
      called = url;
      return Response.json({ results: [app({ trackName: "Lite", userRatingCount: 10 }), app({})] });
    });
    expect(called).toBe("https://itunes.apple.com/lookup?id=1,2");
    expect(data).toEqual({ name: "Acme", rating: 4.7, ratingCount: 1200, url: "https://apps.apple.com/app/id1", linkedFromSite: true });
  });

  it("busca por nombre y solo acepta apps cuyo vendedor es el mismo dominio", async () => {
    let called = "";
    const data = await fetchAppStore({ appIds: [], companyName: "Acme Inc", rootDomain: "acme.example" }, async (url) => {
      called = url;
      return Response.json({
        results: [
          app({ trackName: "Acme Clon", userRatingCount: 99999, sellerUrl: "https://acme-games.example/" }),
          app({ trackName: "Acme", userRatingCount: 50, sellerUrl: "https://blog.acme.example/" }),
        ],
      });
    });
    expect(called).toBe("https://itunes.apple.com/search?term=Acme%20Inc&entity=software&limit=10");
    expect(data?.name).toBe("Acme");
    expect(data?.linkedFromSite).toBe(false);
  });

  it("devuelve null si ninguna app coincide", async () => {
    const data = await fetchAppStore({ appIds: [], companyName: "Acme", rootDomain: "acme.example" }, async () =>
      Response.json({ results: [app({ sellerUrl: "https://otra.example/" }), app({ sellerUrl: undefined })] }),
    );
    expect(data).toBeNull();
  });

  it("valoración null si Apple no la da", async () => {
    const data = await fetchAppStore({ appIds: ["1"], companyName: "Acme", rootDomain: "acme.example" }, async () =>
      Response.json({ results: [app({ averageUserRating: undefined, userRatingCount: undefined })] }),
    );
    expect(data).toMatchObject({ rating: null, ratingCount: 0 });
  });

  it("lanza error si iTunes falla", async () => {
    await expect(
      fetchAppStore({ appIds: [], companyName: "Acme", rootDomain: "acme.example" }, async () => new Response("", { status: 503 })),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- appstore`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar**

`lib/engine/sources/appstore.ts`:

```ts
import { getDomain } from "tldts";
import type { AppStoreData, Fetcher } from "../types";

interface ItunesResult {
  trackName?: unknown;
  averageUserRating?: unknown;
  userRatingCount?: unknown;
  trackViewUrl?: unknown;
  sellerUrl?: unknown;
}

const ITUNES = "https://itunes.apple.com";

async function itunes(url: string, fetcher: Fetcher): Promise<ItunesResult[]> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`App Store respondió ${res.status}`);
  const json = (await res.json()) as { results?: unknown };
  return Array.isArray(json.results) ? (json.results as ItunesResult[]) : [];
}

function toApp(r: ItunesResult, linkedFromSite: boolean): AppStoreData | null {
  if (typeof r.trackName !== "string" || typeof r.trackViewUrl !== "string") return null;
  return {
    name: r.trackName,
    rating: typeof r.averageUserRating === "number" ? Math.round(r.averageUserRating * 10) / 10 : null,
    ratingCount: typeof r.userRatingCount === "number" ? r.userRatingCount : 0,
    url: r.trackViewUrl,
    linkedFromSite,
  };
}

const best = (apps: (AppStoreData | null)[]) =>
  apps.filter((a): a is AppStoreData => a !== null).sort((a, b) => b.ratingCount - a.ratingCount)[0] ?? null;

function sellerDomain(r: ItunesResult): string | null {
  if (typeof r.sellerUrl !== "string") return null;
  try {
    return getDomain(new URL(r.sellerUrl).hostname, { allowPrivateDomains: true });
  } catch {
    return null;
  }
}

export async function fetchAppStore(
  input: { appIds: string[]; companyName: string; rootDomain: string },
  fetcher: Fetcher,
): Promise<AppStoreData | null> {
  if (input.appIds.length > 0) {
    const linked = best((await itunes(`${ITUNES}/lookup?id=${input.appIds.slice(0, 5).join(",")}`, fetcher)).map((r) => toApp(r, true)));
    if (linked) return linked;
  }
  const results = await itunes(
    `${ITUNES}/search?term=${encodeURIComponent(input.companyName)}&entity=software&limit=10`,
    fetcher,
  );
  return best(results.filter((r) => sellerDomain(r) === input.rootDomain).map((r) => toApp(r, false)));
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- appstore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/appstore.ts tests/engine/appstore.test.ts
git commit -m "Add App Store source with domain-verified matching"
```

---

### Task 7: Fuente Wikidata

**Files:**
- Create: `lib/engine/sources/wikidata.ts`
- Test: `tests/engine/wikidata.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `WikidataData`.
- Produces: `fetchWikidata(input: { companyName: string; rootDomain: string }, fetcher: Fetcher): Promise<WikidataData | null>`; `extractWikidata(entity: WikidataEntity, labels: Record<string, string>): WikidataData`; tipo `WikidataEntity`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/wikidata.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchWikidata, extractWikidata, type WikidataEntity } from "../../lib/engine/sources/wikidata";

const str = (value: string, rank = "normal") => ({ rank, mainsnak: { datavalue: { value } } });
const time = (t: string) => ({ rank: "normal", mainsnak: { datavalue: { value: { time: t } } } });
const item = (id: string) => ({ rank: "normal", mainsnak: { datavalue: { value: { id } } } });
const qty = (amount: string, unit: string, year?: number, rank = "normal") => ({
  rank,
  mainsnak: { datavalue: { value: { amount, unit } } },
  qualifiers: year ? { P585: [{ datavalue: { value: { time: `+${year}-01-01T00:00:00Z` } } }] } : undefined,
});

const ACME: WikidataEntity = {
  id: "Q1",
  descriptions: { es: { value: "empresa de software" } },
  claims: {
    P856: [str("https://www.acme.example/")],
    P571: [time("+2013-05-01T00:00:00Z")],
    P112: [item("Q10"), item("Q11")],
    P159: [item("Q20")],
    P1128: [qty("+120", "1", 2020), qty("+300", "1", 2024), qty("+999", "1", 2025, "deprecated")],
    P2139: [qty("+50000000", "http://www.wikidata.org/entity/Q4917", 2023)],
  },
};

describe("extractWikidata", () => {
  it("extrae fundación, fundadores, sede, empleados más recientes e ingresos", () => {
    expect(extractWikidata(ACME, { Q10: "Ana", Q11: "Luis", Q20: "Madrid" })).toEqual({
      id: "Q1",
      description: "empresa de software",
      inception: 2013,
      founders: ["Ana", "Luis"],
      headquarters: "Madrid",
      employees: 300,
      revenue: { amount: 50_000_000, currency: "USD", year: 2023 },
    });
  });

  it("devuelve nulos si faltan datos", () => {
    expect(extractWikidata({ id: "Q2", claims: {} }, {})).toEqual({
      id: "Q2",
      description: null,
      inception: null,
      founders: [],
      headquarters: null,
      employees: null,
      revenue: null,
    });
  });
});

describe("fetchWikidata", () => {
  const OTHER: WikidataEntity = { id: "Q9", claims: { P856: [str("https://acme-games.example/")] } };

  it("busca por nombre, acepta solo la entidad con la web del dominio y resuelve etiquetas", async () => {
    const urls: string[] = [];
    const data = await fetchWikidata({ companyName: "Acme", rootDomain: "acme.example" }, async (url) => {
      urls.push(url);
      if (url.includes("wbsearchentities")) return Response.json({ search: [{ id: "Q9" }, { id: "Q1" }] });
      if (url.includes("props=labels")) {
        return Response.json({ entities: { Q10: { labels: { es: { value: "Ana" } } }, Q11: { labels: { en: { value: "Luis" } } }, Q20: { labels: { es: { value: "Madrid" } } } } });
      }
      return Response.json({ entities: { Q9: OTHER, Q1: ACME } });
    });
    expect(urls[0]).toContain("action=wbsearchentities&search=Acme");
    expect(urls[1]).toContain("ids=Q9%7CQ1");
    expect(data?.id).toBe("Q1");
    expect(data?.founders).toEqual(["Ana", "Luis"]);
  });

  it("devuelve null si ninguna entidad tiene la web del dominio", async () => {
    const data = await fetchWikidata({ companyName: "Acme", rootDomain: "acme.example" }, async (url) =>
      url.includes("wbsearchentities") ? Response.json({ search: [{ id: "Q9" }] }) : Response.json({ entities: { Q9: OTHER } }),
    );
    expect(data).toBeNull();
  });

  it("devuelve null si la búsqueda no da resultados", async () => {
    expect(await fetchWikidata({ companyName: "Nada", rootDomain: "nada.example" }, async () => Response.json({ search: [] }))).toBeNull();
  });

  it("lanza error si Wikidata falla", async () => {
    await expect(
      fetchWikidata({ companyName: "Acme", rootDomain: "acme.example" }, async () => new Response("", { status: 500 })),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- wikidata`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar**

`lib/engine/sources/wikidata.ts`:

```ts
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
  const employees = quantity(latest(e.claims?.P1128));
  const revenueClaim = latest(e.claims?.P2139);
  const revenue = quantity(revenueClaim);
  const currencyId = revenue?.unit.split("/").pop() ?? "";

  return {
    id: e.id,
    description: e.descriptions?.es?.value ?? e.descriptions?.en?.value ?? null,
    inception: yearOf(usable(e.claims?.P571)[0]?.mainsnak?.datavalue?.value),
    founders,
    headquarters: hqId ? (labels[hqId] ?? null) : null,
    employees: employees ? employees.amount : null,
    revenue: revenue ? { amount: revenue.amount, currency: CURRENCIES[currencyId] ?? currencyId, year: revenueClaim ? pointInTime(revenueClaim) : null } : null,
  };
}

async function api(params: Record<string, string>, fetcher: Fetcher): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ format: "json", origin: "*", ...params });
  const res = await fetcher(`${API}?${qs}`, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Wikidata respondió ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchWikidata(
  input: { companyName: string; rootDomain: string },
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
  const match = ids.map((id) => entities[id]).find((e) => e && officialDomains(e).includes(input.rootDomain));
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
```

Nota: `URLSearchParams` codifica `|` como `%7C` y los espacios como `+`. La prueba comprueba `ids=Q9%7CQ1`.

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- wikidata`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/wikidata.ts tests/engine/wikidata.test.ts
git commit -m "Add Wikidata company facts source with domain-verified matching"
```

---

### Task 8: Fuente DNS (email corporativo y herramientas)

**Files:**
- Create: `lib/engine/sources/dns.ts`
- Test: `tests/engine/dns.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `DnsData`, `EmailProvider`, `Technology`.
- Produces: `emailProviderFromMx(mxHosts: string[]): EmailProvider`; `toolsFromTxt(txt: string[]): Technology[]`; `fetchDns(domain: string, fetcher: Fetcher): Promise<DnsData>`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/dns.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emailProviderFromMx, toolsFromTxt, fetchDns } from "../../lib/engine/sources/dns";

describe("emailProviderFromMx", () => {
  it.each([
    [["aspmx.l.google.com"], "Google Workspace"],
    [["acme-com.mail.protection.outlook.com"], "Microsoft 365"],
    [["mx1.ovh.net"], "Otro"],
    [[], "Ninguno"],
  ])("%j → %s", (mx, expected) => {
    expect(emailProviderFromMx(mx)).toBe(expected);
  });
});

describe("toolsFromTxt", () => {
  it("detecta herramientas por SPF y verificaciones", () => {
    const txt = [
      "v=spf1 include:_spf.google.com include:_spf.salesforce.com include:servers.mcsv.net include:mail.zendesk.com ~all",
      "facebook-domain-verification=abc",
      "atlassian-domain-verification=xyz",
    ];
    expect(toolsFromTxt(txt).map((t) => t.name)).toEqual(["Salesforce", "Mailchimp", "Zendesk", "Meta Ads", "Atlassian"]);
  });
  it("no inventa nada sin registros", () => {
    expect(toolsFromTxt([])).toEqual([]);
  });
});

describe("fetchDns", () => {
  it("consulta MX y TXT por DoH y une los trozos de TXT", async () => {
    const urls: string[] = [];
    const data = await fetchDns("acme.example", async (url, init) => {
      urls.push(url);
      expect(new Headers(init?.headers).get("accept")).toBe("application/dns-json");
      if (url.includes("type=MX")) return Response.json({ Status: 0, Answer: [{ type: 15, data: "1 aspmx.l.google.com." }] });
      return Response.json({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 include:sendgrid" ".net ~all"' }] });
    });
    expect(urls).toEqual([
      "https://cloudflare-dns.com/dns-query?name=acme.example&type=MX",
      "https://cloudflare-dns.com/dns-query?name=acme.example&type=TXT",
    ]);
    expect(data).toEqual({ emailProvider: "Google Workspace", tools: [{ name: "SendGrid", category: "email" }] });
  });

  it("dominio inexistente (NXDOMAIN) → sin email ni herramientas", async () => {
    expect(await fetchDns("x.example", async () => Response.json({ Status: 3 }))).toEqual({ emailProvider: "Ninguno", tools: [] });
  });

  it("lanza error si DoH falla", async () => {
    await expect(fetchDns("x.example", async () => Response.json({ Status: 2 }))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- dns`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar**

`lib/engine/sources/dns.ts`:

```ts
import type { DnsData, EmailProvider, Fetcher, TechCategory, Technology } from "../types";

const DOH = "https://cloudflare-dns.com/dns-query";

interface DohAnswer {
  type: number;
  data: string;
}

const TXT_RULES: { name: string; category: TechCategory; pattern: RegExp }[] = [
  { name: "Salesforce", category: "ventas", pattern: /include:_spf\.salesforce\.com/i },
  { name: "HubSpot", category: "email", pattern: /include:\S*hubspot/i },
  { name: "Mailchimp", category: "email", pattern: /include:servers\.mcsv\.net|include:\S*mandrillapp\.com/i },
  { name: "SendGrid", category: "email", pattern: /include:sendgrid\.net/i },
  { name: "Amazon SES", category: "email", pattern: /include:amazonses\.com/i },
  { name: "Mailgun", category: "email", pattern: /include:mailgun\.org/i },
  { name: "Klaviyo", category: "email", pattern: /klaviyo/i },
  { name: "Zendesk", category: "chat", pattern: /include:mail\.zendesk\.com|zendeskverification/i },
  { name: "Freshdesk", category: "chat", pattern: /include:\S*freshdesk|include:fdspf/i },
  { name: "Intercom", category: "chat", pattern: /include:\S*intercom/i },
  { name: "Meta Ads", category: "publicidad", pattern: /facebook-domain-verification=/i },
  { name: "Stripe", category: "pagos", pattern: /stripe-verification=/i },
  { name: "Atlassian", category: "productividad", pattern: /atlassian-domain-verification=/i },
  { name: "DocuSign", category: "productividad", pattern: /docusign=/i },
  { name: "Adobe", category: "productividad", pattern: /adobe-idp-site-verification=/i },
  { name: "Miro", category: "productividad", pattern: /miro-verification=/i },
];

export function emailProviderFromMx(mxHosts: string[]): EmailProvider {
  if (mxHosts.length === 0) return "Ninguno";
  if (mxHosts.some((h) => /(^|\.)(google\.com|googlemail\.com)$/i.test(h))) return "Google Workspace";
  if (mxHosts.some((h) => /(^|\.)outlook\.com$/i.test(h))) return "Microsoft 365";
  return "Otro";
}

export function toolsFromTxt(txt: string[]): Technology[] {
  const all = txt.join("\n");
  return TXT_RULES.filter((r) => r.pattern.test(all)).map(({ name, category }) => ({ name, category }));
}

async function query(name: string, type: "MX" | "TXT", fetcher: Fetcher): Promise<DohAnswer[]> {
  const res = await fetcher(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`DNS respondió ${res.status}`);
  const json = (await res.json()) as { Status?: number; Answer?: DohAnswer[] };
  if (json.Status !== 0 && json.Status !== 3) throw new Error(`DNS con estado ${json.Status}`);
  return Array.isArray(json.Answer) ? json.Answer : [];
}

export async function fetchDns(domain: string, fetcher: Fetcher): Promise<DnsData> {
  const [mx, txt] = await Promise.all([query(domain, "MX", fetcher), query(domain, "TXT", fetcher)]);
  const mxHosts = mx
    .filter((a) => a.type === 15)
    .map((a) => (a.data.trim().split(/\s+/).pop() ?? "").toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
  const txtValues = txt.filter((a) => a.type === 16).map((a) => a.data.replace(/"\s*"/g, "").replace(/^"|"$/g, ""));
  return { emailProvider: emailProviderFromMx(mxHosts), tools: toolsFromTxt(txtValues) };
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- dns`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/dns.ts tests/engine/dns.test.ts
git commit -m "Add DNS source for corporate email and marketing tools"
```

---

### Task 9: Fuente Hacker News

**Files:**
- Create: `lib/engine/sources/hackernews.ts`
- Test: `tests/engine/hackernews.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `HackerNewsData`.
- Produces: `fetchHackerNews(domain: string, fetcher: Fetcher, now: Date): Promise<HackerNewsData>`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/hackernews.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchHackerNews } from "../../lib/engine/sources/hackernews";

const NOW = new Date("2026-10-15T00:00:00Z");
const SINCE = Math.floor(NOW.getTime() / 1000) - 365 * 24 * 60 * 60;

describe("fetchHackerNews", () => {
  it("cuenta historias totales y del último año y toma la destacada", async () => {
    const urls: string[] = [];
    const data = await fetchHackerNews("acme.example", async (url) => {
      urls.push(url);
      return url.includes("numericFilters")
        ? Response.json({ nbHits: 4, hits: [] })
        : Response.json({ nbHits: 25, hits: [{ title: "Show HN: Acme", points: 512 }] });
    }, NOW);
    expect(urls[0]).toBe("https://hn.algolia.com/api/v1/search?query=acme.example&restrictSearchableAttributes=url&tags=story&hitsPerPage=1");
    expect(urls[1]).toContain(`numericFilters=created_at_i%3E${SINCE}`);
    expect(data).toEqual({ total: 25, lastYear: 4, top: { title: "Show HN: Acme", points: 512 } });
  });

  it("sin resultados", async () => {
    expect(await fetchHackerNews("x.example", async () => Response.json({ nbHits: 0, hits: [] }), NOW)).toEqual({ total: 0, lastYear: 0, top: null });
  });

  it("lanza error si Algolia falla", async () => {
    await expect(fetchHackerNews("x.example", async () => new Response("", { status: 500 }), NOW)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- hackernews`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar**

`lib/engine/sources/hackernews.ts`:

```ts
import type { Fetcher, HackerNewsData } from "../types";

const HN = "https://hn.algolia.com/api/v1/search";

interface AlgoliaResponse {
  nbHits?: unknown;
  hits?: { title?: unknown; points?: unknown }[];
}

async function search(url: string, fetcher: Fetcher): Promise<AlgoliaResponse> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Hacker News respondió ${res.status}`);
  return (await res.json()) as AlgoliaResponse;
}

const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export async function fetchHackerNews(domain: string, fetcher: Fetcher, now: Date): Promise<HackerNewsData> {
  const base = `${HN}?query=${encodeURIComponent(domain)}&restrictSearchableAttributes=url&tags=story`;
  const since = Math.floor(now.getTime() / 1000) - 365 * 24 * 60 * 60;
  const [all, lastYear] = await Promise.all([
    search(`${base}&hitsPerPage=1`, fetcher),
    search(`${base}&hitsPerPage=0&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}`, fetcher),
  ]);
  const hit = all.hits?.[0];
  return {
    total: count(all.nbHits),
    lastYear: count(lastYear.nbHits),
    top: hit && typeof hit.title === "string" ? { title: hit.title, points: count(hit.points) } : null,
  };
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- hackernews`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/hackernews.ts tests/engine/hackernews.test.ts
git commit -m "Add Hacker News mentions source"
```

---

### Task 10: Recogida v2 (dominio final, fuentes nuevas, plazo y estados)

**Files:**
- Modify: `lib/engine/types.ts` (`RawData`), `lib/engine/collect.ts`
- Modify (tests): `tests/engine/fake-network.ts`, `tests/engine/raw-fixture.ts`, `tests/engine/collect.test.ts`
- Test: `tests/engine/collect.test.ts`

**Interfaces:**
- Consumes: `fetchSitemap` (T3), `probePaths` (T4), `jobCandidates`/`fetchJobs` (T5), `fetchAppStore` (T6), `fetchWikidata` (T7), `fetchDns` (T8), `fetchHackerNews` (T9), y las fuentes existentes.
- Produces: `type CollectedSource = Exclude<SourceId, "mercado">`; `RawData` añade `rootDomain: string`, `sitemap: SitemapData | null`, `rutas: PathProbeData | null`, `empleo: JobsData | null`, `appstore: AppStoreData | null`, `wikidata: WikidataData | null`, `dns: DnsData | null`, `hackernews: HackerNewsData | null` y `fuentes: Record<CollectedSource, SourceStatus>`; `unavailable` pasa a ser exactamente las fuentes con estado `"fallo"`; `CollectDeps` añade `deadlineMs?: number` y `sleep?: (ms: number) => Promise<void>`.

- [ ] **Step 1: Ampliar `RawData`**

En `lib/engine/types.ts`, sustituye `RawData` por:

```ts
export type CollectedSource = Exclude<SourceId, "mercado">;

export interface RawData {
  url: string;
  domain: string;
  /** Dominio registrable de la URL final (tras redirecciones), usado para rankings y registros. */
  rootDomain: string;
  collectedAt: string;
  site: SiteData | null;
  tranco: TrancoData | null;
  radar: RadarData | null;
  pagespeed: PageSpeedData | null;
  rdap: RdapData | null;
  wayback: WaybackData | null;
  sitemap: SitemapData | null;
  rutas: PathProbeData | null;
  empleo: JobsData | null;
  appstore: AppStoreData | null;
  wikidata: WikidataData | null;
  dns: DnsData | null;
  hackernews: HackerNewsData | null;
  fuentes: Record<CollectedSource, SourceStatus>;
  /** Fuentes con estado "fallo". */
  unavailable: CollectedSource[];
}
```

- [ ] **Step 2: Actualizar los datos de prueba**

En `tests/engine/raw-fixture.ts` sustituye `makeRaw` por:

```ts
export function makeRaw(overrides: Partial<RawData> = {}): RawData {
  return {
    url: "https://facturo.example/",
    domain: "facturo.example",
    rootDomain: "facturo.example",
    collectedAt: "2026-10-14T00:00:00.000Z",
    site: makeSite(),
    tranco: { rank: 5000, trend: "estable" },
    radar: { bucket: 10000, rank: null },
    pagespeed: { mobile: 90, desktop: 95 },
    rdap: { registeredAt: "2015-03-02" },
    wayback: { firstCapture: "2015-04-01", lastChange: "2026-08-01", changesLastYear: 6 },
    sitemap: null,
    rutas: null,
    empleo: null,
    appstore: null,
    wikidata: null,
    dns: null,
    hackernews: null,
    fuentes: {
      web: "ok", tecnologias: "ok", tranco: "ok", radar: "ok", pagespeed: "ok", rdap: "ok", wayback: "ok",
      sitemap: "no_aplica", rutas: "fallo", empleo: "no_aplica", appstore: "no_aplica", wikidata: "no_aplica", dns: "fallo", hackernews: "fallo",
    },
    unavailable: [],
    ...overrides,
  };
}
```

En `tests/engine/fake-network.ts`, añade estas rutas al objeto `routes` de `fakeFetcher`, antes de `...overrides`:

```ts
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
```

`fakeGetPage` ya devuelve 404 para cualquier URL desconocida: robots, sitemap y rutas darán `sitemap: null` (`no_aplica`) y `rutas` comprobadas sin secciones (`ok`).

- [ ] **Step 3: Escribir las pruebas que fallan**

En `tests/engine/collect.test.ts`:

1. En la prueba "reúne todas las fuentes", añade al final:

```ts
    expect(raw.rootDomain).toBe("facturo.example");
    expect(raw.fuentes).toEqual({
      web: "ok", tecnologias: "ok", tranco: "ok", radar: "ok", pagespeed: "ok", rdap: "ok", wayback: "ok",
      sitemap: "no_aplica", rutas: "ok", empleo: "no_aplica", appstore: "no_aplica", wikidata: "no_aplica", dns: "ok", hackernews: "ok",
    });
    expect(raw.dns).toEqual({ emailProvider: "Google Workspace", tools: [{ name: "Mailchimp", category: "email" }] });
    expect(raw.rutas).toEqual({ found: [], checked: ["blog", "precios", "empleo", "about"] });
```

2. Cambia la prueba "marca Radar como no disponible si no hay token" por:

```ts
  it("marca Radar como no aplicable si no hay token", async () => {
    const raw = await collect(input, { ...baseDeps, radarToken: undefined });
    expect(raw.radar).toBeNull();
    expect(raw.fuentes.radar).toBe("no_aplica");
    expect(raw.unavailable).toEqual([]);
  });
```

3. Añade:

```ts
  it("usa el dominio final tras las redirecciones para rankings, DNS y registro", async () => {
    const urls: string[] = [];
    const base = fakeFetcher();
    const fetcher = async (url: string, init?: RequestInit) => {
      urls.push(url);
      return base(url, init);
    };
    const getPage: PageGetter = async (url) =>
      url === "https://notion.so/"
        ? { url: "https://www.notion.com/", status: 200, headers: {}, text: "<html><head><title>Notion</title></head><body></body></html>" }
        : { url, status: 404, headers: {}, text: "" };
    const raw = await collect({ url: "https://notion.so/", domain: "notion.so" }, { ...baseDeps, getPage, fetcher });
    expect(raw.rootDomain).toBe("notion.com");
    expect(urls.some((u) => u.endsWith("/api/ranks/domain/notion.com"))).toBe(true);
    expect(urls.some((u) => u.includes("rdap.org/domain/notion.com"))).toBe(true);
    expect(urls.some((u) => u.includes("dns-query?name=notion.com"))).toBe(true);
  });

  it("busca en Wikidata con el nombre de la empresa", async () => {
    const urls: string[] = [];
    const base = fakeFetcher();
    await collect(input, {
      ...baseDeps,
      fetcher: async (url, init) => {
        urls.push(url);
        return base(url, init);
      },
    });
    expect(urls.some((u) => u.includes("wbsearchentities") && u.includes("search=Facturo"))).toBe(true);
  });

  it("marca como fallo las fuentes que no terminan en el plazo y sigue", async () => {
    const fetcher = fakeFetcher({ "hn.algolia.com": () => new Promise<Response>(() => {}) });
    const raw = await collect(input, { ...baseDeps, fetcher, sleep: () => new Promise((r) => setTimeout(r, 50)) });
    expect(raw.fuentes.hackernews).toBe("fallo");
    expect(raw.unavailable).toEqual(["hackernews"]);
    expect(raw.fuentes.tranco).toBe("ok");
  });
```

Añade arriba el import de tipo si falta: `import type { PageGetter } from "../../lib/engine/safe-fetch";`.

- [ ] **Step 4: Ejecutar y comprobar que fallan**

Run: `npm test -- collect`
Expected: FAIL.

- [ ] **Step 5: Implementar `collect.ts`**

Sustituye `lib/engine/collect.ts` completo por:

```ts
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
```

- [ ] **Step 6: Ejecutar y comprobar que pasa**

Run: `npm test`
Expected: PASS en todo. Si una prueba antigua de `collect` comprueba URLs de Tranco o RDAP con el dominio introducido y la home redirige, ajústala al dominio final y explícalo en el informe.
Run: `npx next typegen && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/engine/types.ts lib/engine/collect.ts tests/engine
git commit -m "Collect v2: final domain, new free sources, deadline and per-source status"
```

---

### Task 11: Hechos de tres estados

**Files:**
- Create: `lib/engine/facts.ts`
- Test: `tests/engine/facts.test.ts`

**Interfaces:**
- Consumes: `RawData` v2 (Task 10), `Presence`.
- Produces: `presence(checks: (boolean | null)[]): Presence`; `interface Facts { blog: Presence; paginaPrecios: Presence; empleo: Presence; app: Presence; emailMarketing: Presence; chatSoporte: Presence; redes: string[] }`; `computeFacts(raw: RawData): Facts`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/facts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { presence, computeFacts } from "../../lib/engine/facts";
import { makeRaw, makeSite } from "./raw-fixture";

describe("presence", () => {
  it.each([
    [[true], "si"],
    [[false, true], "si"],
    [[false, false], "no"],
    [[false, null, false], "no"],
    [[false], "desconocido"],
    [[false, null], "desconocido"],
    [[], "desconocido"],
  ] as const)("%j → %s", (checks, expected) => {
    expect(presence([...checks])).toBe(expected);
  });
});

const sitemap = (sections: ("blog" | "precios" | "empleo")[]) => ({ urlCount: 100, sections, languages: [], lastModified: null, recentBlogPosts: 0 });

describe("computeFacts", () => {
  it("caso Notion: la home no enlaza el blog pero el sitemap sí → blog = si", () => {
    const raw = makeRaw({ site: makeSite({ hasBlog: false, textLength: 300 }), sitemap: sitemap(["blog"]) });
    expect(computeFacts(raw).blog).toBe("si");
  });

  it("blog = no si la web y las rutas lo comprueban sin verlo", () => {
    const raw = makeRaw({ site: makeSite({ hasBlog: false }), rutas: { found: [], checked: ["blog"] } });
    expect(computeFacts(raw).blog).toBe("no");
  });

  it("blog = desconocido con una sola comprobación", () => {
    expect(computeFacts(makeRaw({ site: makeSite({ hasBlog: false }) })).blog).toBe("desconocido");
  });

  it("app = no si la web no enlaza y App Store no encontró ninguna (no_aplica)", () => {
    expect(computeFacts(makeRaw({ site: makeSite({ hasAppLinks: false }) })).app).toBe("no");
  });

  it("app = desconocido si App Store falló", () => {
    const raw = makeRaw({ site: makeSite({ hasAppLinks: false }) });
    raw.fuentes.appstore = "fallo";
    expect(computeFacts(raw).app).toBe("desconocido");
  });

  it("app = si si App Store encontró la app", () => {
    const raw = makeRaw({ site: makeSite({ hasAppLinks: false }), appstore: { name: "F", rating: 4, ratingCount: 9, url: "u", linkedFromSite: false } });
    expect(computeFacts(raw).app).toBe("si");
  });

  it("email marketing: lo ve el DNS aunque la web no", () => {
    const raw = makeRaw({ site: makeSite({ technologies: [] }), dns: { emailProvider: "Google Workspace", tools: [{ name: "HubSpot", category: "email" }] } });
    expect(computeFacts(raw).emailMarketing).toBe("si");
  });

  it("email marketing = no si web y DNS lo comprueban sin verlo", () => {
    const raw = makeRaw({ site: makeSite({ technologies: [] }), dns: { emailProvider: "Otro", tools: [] } });
    expect(computeFacts(raw).emailMarketing).toBe("no");
  });

  it("empleo: la ausencia en la web no cuenta; sitemap + rutas sí", () => {
    expect(computeFacts(makeRaw({ rutas: { found: [], checked: ["empleo"] } })).empleo).toBe("desconocido");
    expect(computeFacts(makeRaw({ rutas: { found: [], checked: ["empleo"] }, sitemap: sitemap([]) })).empleo).toBe("no");
    expect(computeFacts(makeRaw({ empleo: { platform: "lever", token: "f", openings: 0, byArea: {}, linkedFromSite: true } })).empleo).toBe("si");
  });

  it("redes une los enlaces de la web sin duplicados", () => {
    expect(computeFacts(makeRaw()).redes).toEqual(["x", "linkedin"]);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- facts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar**

`lib/engine/facts.ts`:

```ts
import type { Presence, RawData, TechCategory } from "./types";

/** null = no se pudo comprobar; true = visto; false = comprobado y no visto. */
export function presence(checks: (boolean | null)[]): Presence {
  if (checks.some((c) => c === true)) return "si";
  if (checks.filter((c) => c === false).length >= 2) return "no";
  return "desconocido";
}

export interface Facts {
  blog: Presence;
  paginaPrecios: Presence;
  empleo: Presence;
  app: Presence;
  emailMarketing: Presence;
  chatSoporte: Presence;
  redes: string[];
}

export function computeFacts(raw: RawData): Facts {
  const site = raw.site;
  const sitemapHas = (s: "blog" | "precios" | "empleo") => (raw.sitemap ? raw.sitemap.sections.includes(s) : null);
  const routeHas = (k: "blog" | "precios" | "empleo") =>
    raw.rutas && raw.rutas.checked.includes(k) ? raw.rutas.found.includes(k) : null;
  const webTech = (c: TechCategory) => (site ? site.technologies.some((t) => t.category === c) : null);
  const dnsTech = (c: TechCategory) => (raw.dns ? raw.dns.tools.some((t) => t.category === c) : null);

  return {
    blog: presence([site ? site.hasBlog : null, sitemapHas("blog"), routeHas("blog")]),
    paginaPrecios: presence([
      site ? site.hasPricingPage || site.pricesFound.length > 0 : null,
      sitemapHas("precios"),
      routeHas("precios"),
    ]),
    // Que la home no enlace a empleo no prueba nada: la web solo cuenta si lo ve.
    empleo: presence([
      site && site.jobBoards.length > 0 ? true : null,
      sitemapHas("empleo"),
      routeHas("empleo"),
      raw.empleo ? true : null,
    ]),
    app: presence([
      site ? site.hasAppLinks : null,
      raw.appstore ? true : raw.fuentes.appstore === "no_aplica" ? false : null,
    ]),
    emailMarketing: presence([webTech("email"), dnsTech("email")]),
    chatSoporte: presence([webTech("chat"), dnsTech("chat")]),
    redes: Object.keys(site?.socialLinks ?? {}),
  };
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- facts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/facts.ts tests/engine/facts.test.ts
git commit -m "Add three-state facts combining independent sources"
```

---

### Task 12: Señales v2 (positivas y negativas)

**Files:**
- Modify: `lib/engine/signals.ts`
- Modify (tests): `tests/engine/signals.test.ts` (se reescribe entero)
- Test: `tests/engine/signals.test.ts`

**Interfaces:**
- Consumes: `computeFacts` (Task 11), `validRank`, `radarRank` (anchors.ts), `RawData` v2.
- Produces: `extractSignals(raw: RawData, now: Date): Signal[]` (misma firma); `allLanguages(raw: RawData): string[]`; `allTechnologies(raw: RawData): Technology[]` (web + DNS sin duplicados por nombre). Ids nuevos: positivas `contratando`, `contratacion_fuerte`, `app_valorada`, `blog_activo`, `multi_idioma`, `web_amplia`, `trafico_alto`, `trafico_en_subida`, `empresa_consolidada`, `plantilla_grande`, `notoriedad_tech`, `stack_crecimiento`, `web_rapida`; negativas `sin_empleo`, `web_inactiva`, `app_mal_valorada`, `sin_email_corporativo`.

- [ ] **Step 1: Reescribir las pruebas**

Sustituye `tests/engine/signals.test.ts` completo por:

```ts
import { describe, it, expect } from "vitest";
import { extractSignals, allTechnologies } from "../../lib/engine/signals";
import { makeRaw, makeSite } from "./raw-fixture";
import { NOW } from "./fake-network";
import type { RawData } from "../../lib/engine/types";

const ids = (raw: RawData, polarity?: "positiva" | "negativa") =>
  extractSignals(raw, NOW)
    .filter((s) => !polarity || s.polarity === polarity)
    .map((s) => s.id);

const verified = { found: [], checked: ["blog", "precios", "empleo", "about"] } as RawData["rutas"];
const sitemap = (over: Partial<NonNullable<RawData["sitemap"]>> = {}) => ({
  urlCount: 100,
  sections: [] as NonNullable<RawData["sitemap"]>["sections"],
  languages: [],
  lastModified: "2026-10-01",
  recentBlogPosts: 0,
  ...over,
});

describe("extractSignals — negocio sano", () => {
  it("no tiene señales negativas y sí las positivas que apoyan los datos", () => {
    expect(ids(makeRaw(), "negativa")).toEqual([]);
    expect(ids(makeRaw(), "positiva")).toEqual(["trafico_alto", "empresa_consolidada", "web_rapida"]);
  });
});

describe("extractSignals — negativas", () => {
  it("huecos de producto y confianza en la web", () => {
    const site = makeSite({ pricesFound: [], ctas: ["Pide una demo"], hasFreePlanOrTrial: false, hasTestimonials: false });
    expect(ids(makeRaw({ site }), "negativa")).toEqual(["sin_precios_publicos", "solo_demo", "sin_plan_gratuito", "sin_testimonios"]);
  });

  it("caso Notion: home leída a medias pero con blog en el sitemap → sin señales falsas", () => {
    const site = makeSite({ hasBlog: false, socialLinks: { youtube: "y" }, textLength: 800, hasAppLinks: false, technologies: [] });
    const raw = makeRaw({ site, sitemap: sitemap({ sections: ["blog"], urlCount: 900 }) });
    raw.fuentes.appstore = "fallo";
    const negatives = ids(raw, "negativa");
    expect(negatives).not.toContain("sin_blog");
    expect(negatives).not.toContain("pocas_redes");
    expect(negatives).not.toContain("sin_app_movil");
    expect(negatives).not.toContain("sin_analitica");
    expect(negatives).not.toContain("contenido_escaso");
  });

  it("señales de presencia cuando dos fuentes lo confirman", () => {
    const site = makeSite({ hasBlog: false, hasAppLinks: false, technologies: [], socialLinks: {}, languages: ["es"] });
    const raw = makeRaw({ site, rutas: verified, sitemap: sitemap(), dns: { emailProvider: "Google Workspace", tools: [] } });
    expect(ids(raw, "negativa")).toEqual([
      "sin_analitica",
      "sin_blog",
      "un_solo_idioma",
      "sin_app_movil",
      "pocas_redes",
      "sin_chat_soporte",
      "sin_captacion_email",
      "sin_empleo",
    ]);
  });

  it("pocas_redes usa un texto claro", () => {
    const raw = makeRaw({ site: makeSite({ socialLinks: {} }) });
    expect(extractSignals(raw, NOW).find((s) => s.id === "pocas_redes")?.label).toBe("No enlaza a ninguna red social");
  });

  it("rendimiento, tracción y antigüedad", () => {
    const raw = makeRaw({
      pagespeed: { mobile: 34, desktop: 45 },
      tranco: { rank: null, trend: null },
      radar: { bucket: null, rank: null },
      wayback: { firstCapture: "2025-01-01", lastChange: "2025-06-01", changesLastYear: 0 },
      rdap: { registeredAt: "2025-01-01" },
    });
    expect(ids(raw, "negativa")).toEqual([
      "pagespeed_movil_bajo",
      "pagespeed_escritorio_bajo",
      "fuera_top_1m",
      "popularidad_baja",
      "web_sin_cambios_12m",
      "dominio_reciente",
    ]);
  });

  it("web inactiva, app mal valorada y sin email corporativo", () => {
    const raw = makeRaw({
      sitemap: sitemap({ lastModified: "2024-01-01" }),
      appstore: { name: "F", rating: 2.9, ratingCount: 500, url: "u", linkedFromSite: true },
      dns: { emailProvider: "Ninguno", tools: [] },
    });
    expect(ids(raw, "negativa")).toEqual(["web_inactiva", "app_mal_valorada", "sin_email_corporativo"]);
  });
});

describe("extractSignals — positivas", () => {
  it("contratación, app, blog, idiomas, web amplia, plantilla, notoriedad y stack", () => {
    const raw = makeRaw({
      tranco: { rank: 50_000, trend: "sube" },
      radar: null,
      pagespeed: { mobile: 70, desktop: 80 },
      rdap: { registeredAt: "2025-01-01" },
      empleo: { platform: "greenhouse", token: "f", openings: 35, byArea: {}, linkedFromSite: true },
      appstore: { name: "F", rating: 4.6, ratingCount: 12000, url: "u", linkedFromSite: true },
      sitemap: sitemap({ urlCount: 800, recentBlogPosts: 6, languages: ["fr", "de"] }),
      wikidata: { id: "Q1", description: null, inception: 2016, founders: [], headquarters: null, employees: 450, revenue: null },
      hackernews: { total: 40, lastYear: 3, top: null },
      dns: { emailProvider: "Google Workspace", tools: [{ name: "Salesforce", category: "ventas" }] },
    });
    expect(ids(raw, "positiva")).toEqual([
      "contratacion_fuerte",
      "app_valorada",
      "blog_activo",
      "multi_idioma",
      "web_amplia",
      "trafico_en_subida",
      "empresa_consolidada",
      "plantilla_grande",
      "notoriedad_tech",
      "stack_crecimiento",
    ]);
    const consolidated = extractSignals(raw, NOW).find((s) => s.id === "empresa_consolidada");
    expect(consolidated).toMatchObject({ source: "wikidata", label: "Empresa fundada en 2016", polarity: "positiva" });
  });

  it("contratando con 5-29 ofertas", () => {
    const raw = makeRaw({ empleo: { platform: "lever", token: "f", openings: 5, byArea: {}, linkedFromSite: false } });
    expect(ids(raw, "positiva")).toContain("contratando");
    expect(ids(raw, "positiva")).not.toContain("contratacion_fuerte");
  });

  it("trafico_alto por Radar si Tranco no tiene rango", () => {
    const raw = makeRaw({ tranco: { rank: null, trend: null }, radar: { bucket: 5000, rank: null } });
    expect(extractSignals(raw, NOW).find((s) => s.id === "trafico_alto")?.source).toBe("radar");
  });

  it("no inventa señales de fuentes no disponibles", () => {
    expect(ids(makeRaw({ site: null, pagespeed: null, tranco: null, radar: null, wayback: null, rdap: null }))).toEqual([]);
  });
});

describe("allTechnologies", () => {
  it("une web y DNS sin duplicar por nombre", () => {
    const raw = makeRaw({ dns: { emailProvider: "Otro", tools: [{ name: "Mailchimp", category: "email" }, { name: "Salesforce", category: "ventas" }] } });
    expect(allTechnologies(raw).map((t) => t.name)).toEqual(["Google Analytics", "Intercom", "Mailchimp", "Salesforce"]);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `npm test -- signals`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Sustituye `lib/engine/signals.ts` completo por:

```ts
import type { RawData, Signal, SignalFamily, SignalPolarity, SourceId, Technology } from "./types";
import { radarRank, validRank } from "./anchors";
import { computeFacts } from "./facts";

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;
const GROWTH_CATEGORIES = new Set(["email", "ventas", "chat", "publicidad"]);
const READABLE_TEXT = 1500;

export function allLanguages(raw: RawData): string[] {
  return Array.from(new Set([...(raw.site?.languages ?? []), ...(raw.sitemap?.languages ?? [])]));
}

export function allTechnologies(raw: RawData): Technology[] {
  const out: Technology[] = [];
  for (const t of [...(raw.site?.technologies ?? []), ...(raw.dns?.tools ?? [])]) {
    if (!out.some((o) => o.name === t.name)) out.push(t);
  }
  return out;
}

export function extractSignals(raw: RawData, now: Date): Signal[] {
  const signals: Signal[] = [];
  const add = (id: string, family: SignalFamily, source: SourceId, label: string, polarity: SignalPolarity = "negativa") =>
    signals.push({ id, family, source, label, polarity });
  const pos = (id: string, family: SignalFamily, source: SourceId, label: string) => add(id, family, source, label, "positiva");

  const facts = computeFacts(raw);
  const site = raw.site;
  const readable = !!site && site.textLength >= READABLE_TEXT;
  const languages = allLanguages(raw);

  // ---------- Negativas ----------
  if (site) {
    const noPrices = site.pricesFound.length === 0;
    if (noPrices) add("sin_precios_publicos", "producto", "web", "No muestra precios públicos");
    if (noPrices && site.ctas.some((c) => /\b(demo|ventas|sales)\b/i.test(c))) {
      add("solo_demo", "producto", "web", "La conversión pasa por pedir una demo o hablar con ventas");
    }
    if (!site.hasFreePlanOrTrial) add("sin_plan_gratuito", "producto", "web", "No ofrece plan gratuito ni prueba");
    if (site.textLength < READABLE_TEXT && !(raw.sitemap && raw.sitemap.urlCount >= 50)) {
      add("contenido_escaso", "contenido", "web", "Muy poco texto indexable en la web");
    }
    if (!site.hasTestimonials) add("sin_testimonios", "confianza", "web", "Sin testimonios, reseñas ni casos de éxito visibles");
    if (readable && !site.technologies.some((t) => t.category === "analitica")) {
      add("sin_analitica", "tecnica", "tecnologias", "No se detecta ninguna herramienta de analítica");
    }
  }
  if (facts.blog === "no") add("sin_blog", "contenido", "web", "No tiene blog ni sección de contenidos");
  if (languages.length === 1) add("un_solo_idioma", "alcance", "web", `Web en un solo idioma (${languages[0]})`);
  if (facts.app === "no") add("sin_app_movil", "alcance", "web", "No tiene app en App Store ni enlaza a ninguna");
  if (readable && facts.redes.length < 2) {
    add("pocas_redes", "alcance", "web", facts.redes.length === 0 ? "No enlaza a ninguna red social" : "Solo enlaza a 1 red social");
  }
  if (facts.chatSoporte === "no") add("sin_chat_soporte", "tecnica", "tecnologias", "No se detecta chat ni soporte en vivo");
  if (facts.emailMarketing === "no") add("sin_captacion_email", "tecnica", "tecnologias", "No se detecta herramienta de email marketing");
  if (facts.empleo === "no") add("sin_empleo", "traccion", "rutas", "No se detecta página de empleo ni ofertas abiertas");

  const mobile = raw.pagespeed?.mobile ?? null;
  if (mobile !== null && mobile < 50) add("pagespeed_movil_bajo", "tecnica", "pagespeed", `Rendimiento móvil bajo: ${mobile}/100`);
  const desktop = raw.pagespeed?.desktop ?? null;
  if (desktop !== null && desktop < 50) add("pagespeed_escritorio_bajo", "tecnica", "pagespeed", `Rendimiento en escritorio bajo: ${desktop}/100`);

  if (raw.tranco?.trend === "baja") add("trafico_en_caida", "traccion", "tranco", "Su posición en el ranking de tráfico está bajando");
  if (raw.tranco && raw.tranco.rank === null) add("fuera_top_1m", "traccion", "tranco", "Fuera del top 1 millón de webs más visitadas");
  const radarBucket = validRank(raw.radar?.bucket);
  if (raw.radar && validRank(raw.radar.rank) === null && (radarBucket === null || radarBucket > 200_000)) {
    add("popularidad_baja", "traccion", "radar", "Popularidad baja según Cloudflare Radar");
  }
  if (raw.wayback && raw.wayback.lastChange !== null && raw.wayback.changesLastYear === 0) {
    add("web_sin_cambios_12m", "contenido", "wayback", "No se detectan cambios en la web en el último año");
  }
  const registeredAt = raw.rdap?.registeredAt;
  const domainAgeMs = registeredAt ? now.getTime() - Date.parse(registeredAt) : NaN;
  if (Number.isFinite(domainAgeMs) && domainAgeMs < 2 * YEAR_MS) add("dominio_reciente", "traccion", "rdap", "Dominio registrado hace menos de 2 años");

  const lastModified = raw.sitemap?.lastModified;
  if (lastModified && now.getTime() - Date.parse(lastModified) > YEAR_MS) {
    add("web_inactiva", "contenido", "sitemap", `La última actualización del sitemap es de ${lastModified}`);
  }
  const app = raw.appstore;
  if (app && app.rating !== null && app.rating < 3.5 && app.ratingCount >= 100) {
    add("app_mal_valorada", "traccion", "appstore", `App mal valorada: ${app.rating}★ (${app.ratingCount} valoraciones)`);
  }
  if (raw.dns?.emailProvider === "Ninguno") {
    add("sin_email_corporativo", "confianza", "dns", "El dominio no tiene email corporativo (sin registros MX)");
  }

  // ---------- Positivas ----------
  const openings = raw.empleo?.openings ?? 0;
  if (openings >= 30) pos("contratacion_fuerte", "traccion", "empleo", `Contratación fuerte: ${openings} ofertas abiertas`);
  else if (openings >= 5) pos("contratando", "traccion", "empleo", `Contratando: ${openings} ofertas abiertas`);
  if (app && app.rating !== null && app.rating >= 4.3 && app.ratingCount >= 1000) {
    pos("app_valorada", "traccion", "appstore", `App bien valorada: ${app.rating}★ (${app.ratingCount} valoraciones)`);
  }
  const recentPosts = raw.sitemap?.recentBlogPosts ?? 0;
  if (recentPosts >= 4) pos("blog_activo", "contenido", "sitemap", `Blog activo: ${recentPosts} publicaciones en los últimos 90 días`);
  if (languages.length >= 3) pos("multi_idioma", "alcance", "web", `Web en ${languages.length} idiomas`);
  const urlCount = raw.sitemap?.urlCount ?? 0;
  if (urlCount >= 500) pos("web_amplia", "contenido", "sitemap", `Web amplia: ${urlCount} páginas en el sitemap`);

  const trancoRank = validRank(raw.tranco?.rank);
  const radarValue = radarRank(raw.radar);
  if (trancoRank !== null && trancoRank <= 10_000) {
    pos("trafico_alto", "traccion", "tranco", `Entre las 10.000 webs más visitadas (puesto ${trancoRank})`);
  } else if (trancoRank === null && radarValue !== null && radarValue <= 10_000) {
    pos("trafico_alto", "traccion", "radar", "Entre las 10.000 webs más populares según Cloudflare Radar");
  }
  if (raw.tranco?.trend === "sube") pos("trafico_en_subida", "traccion", "tranco", "Su posición en el ranking de tráfico está subiendo");

  const inception = raw.wikidata?.inception ?? null;
  if (inception !== null && now.getUTCFullYear() - inception >= 5) {
    pos("empresa_consolidada", "confianza", "wikidata", `Empresa fundada en ${inception}`);
  } else if (inception === null && Number.isFinite(domainAgeMs) && domainAgeMs >= 5 * YEAR_MS) {
    pos("empresa_consolidada", "confianza", "rdap", "Dominio registrado hace más de 5 años");
  }
  const employees = raw.wikidata?.employees ?? null;
  if (employees !== null && employees >= 200) pos("plantilla_grande", "traccion", "wikidata", `Plantilla de ${employees} empleados`);
  const stories = raw.hackernews?.total ?? 0;
  if (stories >= 20) pos("notoriedad_tech", "alcance", "hackernews", `${stories} historias en Hacker News enlazan a la web`);
  const growthTools = allTechnologies(raw).filter((t) => GROWTH_CATEGORIES.has(t.category));
  if (growthTools.length >= 3) pos("stack_crecimiento", "tecnica", "tecnologias", `Usa ${growthTools.length} herramientas de marketing, ventas o soporte`);
  if (mobile !== null && mobile >= 90) pos("web_rapida", "tecnica", "pagespeed", `Web rápida en móvil: ${mobile}/100`);

  return signals;
}
```

Nota sobre el orden de la prueba "señales de presencia": el código emite primero las de `site` (`sin_analitica`) y después las de hechos (`sin_blog`, `un_solo_idioma`…). La prueba ya refleja ese orden.

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test`
Expected: PASS en todo. Si `analyze.test.ts` o `ai.test.ts` dependían de una etiqueta antigua (`sin_app_movil`, `pocas_redes`), ajusta solo la etiqueta esperada y anótalo en el informe.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/signals.ts tests/engine/signals.test.ts tests/engine
git commit -m "Signals v2: positive signals and fact-based negative signals"
```

---

### Task 13: Anclas de ingresos y recorte v2

**Files:**
- Modify: `lib/engine/anchors.ts`, `lib/engine/report.ts` (`clampIngresos` y su llamada en `buildReport`)
- Modify (tests): `tests/engine/anchors.test.ts` (las expectativas de `computeAnchors` ganan dos claves)
- Test: `tests/engine/ingresos.test.ts`

**Interfaces:**
- Consumes: `WikidataData`, `AiOutput`.
- Produces (anchors.ts): `type TipoNegocio = "saas" | "ecommerce" | "marketplace" | "contenido_ads" | "servicios" | "app" | "otro"`; `interface RevenueAnchor { range: Range; confianza: Confidence; base: string }`; `FX_TO_EUR`, `REVENUE_PER_EMPLOYEE_EUR`; `publicRevenueAnchor(w: WikidataData | null): RevenueAnchor | null`; `employeeRevenueAnchor(employees: number | null, tipo: TipoNegocio): RevenueAnchor | null`; `Anchors` añade `ingresosPublicos: RevenueAnchor | null` y `empleados: number | null`.
- Produces (report.ts): `clampIngresos(ingresos, anchors, revenueAnchor: RevenueAnchor | null = null)`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/ingresos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { publicRevenueAnchor, employeeRevenueAnchor, computeAnchors } from "../../lib/engine/anchors";
import { clampIngresos } from "../../lib/engine/report";
import { makeRaw } from "./raw-fixture";
import { NOW } from "./fake-network";
import type { WikidataData } from "../../lib/engine/types";

const wiki = (over: Partial<WikidataData> = {}): WikidataData => ({
  id: "Q1", description: null, inception: null, founders: [], headquarters: null, employees: null, revenue: null, ...over,
});

const base = {
  anualMin: 1_000_000, anualMax: 4_000_000, valoracionMin: 5_000_000, valoracionMax: 20_000_000,
  confianza: "media" as const, suposiciones: ["x"],
};

describe("publicRevenueAnchor", () => {
  it("convierte a EUR con ±10 % y confianza alta", () => {
    expect(publicRevenueAnchor(wiki({ revenue: { amount: 100_000_000, currency: "USD", year: 2024 } }))).toEqual({
      range: { min: 82_800_000, max: 101_200_000 },
      confianza: "alta",
      base: "Ingresos públicos (Wikidata, 2024): 92000000 €",
    });
  });
  it("descarta monedas desconocidas o importes no positivos", () => {
    expect(publicRevenueAnchor(wiki({ revenue: { amount: 5, currency: "JPY", year: null } }))).toBeNull();
    expect(publicRevenueAnchor(wiki({ revenue: { amount: 0, currency: "EUR", year: null } }))).toBeNull();
    expect(publicRevenueAnchor(null)).toBeNull();
  });
});

describe("employeeRevenueAnchor", () => {
  it("empleados × ingresos por empleado del sector, ×0,5–×1,5", () => {
    expect(employeeRevenueAnchor(100, "saas")).toEqual({
      range: { min: 7_500_000, max: 22_500_000 },
      confianza: "media",
      base: "100 empleados × 150000 € por empleado (saas)",
    });
  });
  it("null sin empleados", () => {
    expect(employeeRevenueAnchor(null, "saas")).toBeNull();
    expect(employeeRevenueAnchor(0, "saas")).toBeNull();
  });
});

describe("computeAnchors", () => {
  it("incluye ingresos públicos y empleados de Wikidata", () => {
    const a = computeAnchors(makeRaw({ wikidata: wiki({ employees: 40, revenue: { amount: 10_000_000, currency: "EUR", year: 2023 } }) }), NOW);
    expect(a.empleados).toBe(40);
    expect(a.ingresosPublicos?.range).toEqual({ min: 9_000_000, max: 11_000_000 });
  });
});

describe("clampIngresos v2", () => {
  const traffic = { visitasMes: { min: 1, max: 2 }, confianzaTrafico: "baja" as const };
  const anchor = { range: { min: 3_000_000, max: 6_000_000 }, confianza: "media" as const, base: "b" };

  it("intersecta el rango de la IA con el ancla y toma su confianza", () => {
    expect(clampIngresos(base, traffic, anchor)).toMatchObject({ anualMin: 3_000_000, anualMax: 4_000_000, confianza: "media" });
  });
  it("si no se solapan, gana el ancla", () => {
    expect(clampIngresos({ ...base, anualMin: 100, anualMax: 200 }, traffic, anchor)).toMatchObject({ anualMin: 3_000_000, anualMax: 6_000_000 });
  });
  it("usa el ancla aunque no haya tráfico ni cifras de la IA", () => {
    const out = clampIngresos({ ...base, anualMin: null, anualMax: null }, { visitasMes: null, confianzaTrafico: "baja" }, anchor);
    expect(out).toMatchObject({ anualMin: 3_000_000, anualMax: 6_000_000, confianza: "media" });
  });
  it("sin ancla mantiene la regla anterior (tope = confianza del tráfico)", () => {
    expect(clampIngresos(base, traffic)).toMatchObject({ anualMin: 1_000_000, anualMax: 4_000_000, confianza: "baja" });
  });
  it("sin tráfico ni ancla, todo null", () => {
    expect(clampIngresos(base, { visitasMes: null, confianzaTrafico: "baja" })).toMatchObject({ anualMin: null, valoracionMax: null, confianza: "baja" });
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- ingresos`
Expected: FAIL.

- [ ] **Step 3: Implementar en `anchors.ts`**

Cambia el import a `import type { Confidence, Range, RawData, WikidataData } from "./types";` y añade:

```ts
export type TipoNegocio = "saas" | "ecommerce" | "marketplace" | "contenido_ads" | "servicios" | "app" | "otro";

export interface RevenueAnchor {
  range: Range;
  confianza: Confidence;
  base: string;
}

export const FX_TO_EUR: Record<string, number> = { EUR: 1, USD: 0.92, GBP: 1.17 };

export const REVENUE_PER_EMPLOYEE_EUR: Record<TipoNegocio, number> = {
  saas: 150_000,
  ecommerce: 250_000,
  marketplace: 200_000,
  contenido_ads: 120_000,
  servicios: 100_000,
  app: 150_000,
  otro: 120_000,
};

export function publicRevenueAnchor(w: WikidataData | null): RevenueAnchor | null {
  const r = w?.revenue;
  if (!r) return null;
  const fx = FX_TO_EUR[r.currency];
  if (!fx || !(r.amount > 0)) return null;
  const eur = r.amount * fx;
  return {
    range: { min: Math.round(eur * 0.9), max: Math.round(eur * 1.1) },
    confianza: "alta",
    base: `Ingresos públicos (Wikidata${r.year ? `, ${r.year}` : ""}): ${Math.round(eur)} €`,
  };
}

export function employeeRevenueAnchor(employees: number | null, tipo: TipoNegocio): RevenueAnchor | null {
  if (employees === null || !(employees > 0)) return null;
  const perEmployee = REVENUE_PER_EMPLOYEE_EUR[tipo];
  const mid = employees * perEmployee;
  return {
    range: { min: Math.round(mid * 0.5), max: Math.round(mid * 1.5) },
    confianza: "media",
    base: `${employees} empleados × ${perEmployee} € por empleado (${tipo})`,
  };
}
```

Añade a `Anchors`:

```ts
  ingresosPublicos: RevenueAnchor | null;
  empleados: number | null;
```

Añade en el objeto que devuelve `computeAnchors`:

```ts
    ingresosPublicos: publicRevenueAnchor(raw.wikidata),
    empleados: raw.wikidata?.employees ?? null,
```

- [ ] **Step 4: Implementar en `report.ts`**

Cambia el import de anchors a `import { computeAnchors, employeeRevenueAnchor, type Anchors, type RevenueAnchor } from "./anchors";` y sustituye `clampIngresos` por:

```ts
export function clampIngresos(
  ingresos: AiOutput["ingresos"],
  anchors: Pick<Anchors, "visitasMes" | "confianzaTrafico">,
  revenueAnchor: RevenueAnchor | null = null,
): AiOutput["ingresos"] {
  if (anchors.visitasMes === null && revenueAnchor === null) {
    return { ...ingresos, anualMin: null, anualMax: null, valoracionMin: null, valoracionMax: null, confianza: "baja" };
  }
  let [anualMin, anualMax] = orderedPair(ingresos.anualMin, ingresos.anualMax);
  const [valoracionMin, valoracionMax] = orderedPair(ingresos.valoracionMin, ingresos.valoracionMax);

  if (revenueAnchor) {
    const { min, max } = revenueAnchor.range;
    if (anualMin !== null && anualMax !== null && anualMin <= max && anualMax >= min) {
      anualMin = Math.max(anualMin, min);
      anualMax = Math.min(anualMax, max);
    } else {
      anualMin = min;
      anualMax = max;
    }
    // La cifra queda acotada por el ancla: su confianza es la del ancla.
    return { ...ingresos, anualMin, anualMax, valoracionMin, valoracionMax, confianza: revenueAnchor.confianza };
  }

  const cap = CONFIDENCE_ORDER.indexOf(anchors.confianzaTrafico);
  const confianza = CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(ingresos.confianza), cap)];
  return { ...ingresos, anualMin, anualMax, valoracionMin, valoracionMax, confianza };
}
```

En `buildReport`, antes del `return`, añade:

```ts
  const revenueAnchor = anchors.ingresosPublicos ?? employeeRevenueAnchor(anchors.empleados, ai.resumen.tipoNegocio);
  const ingresos = clampIngresos(ai.ingresos, anchors, revenueAnchor);
  if (revenueAnchor) ingresos.suposiciones = [revenueAnchor.base, ...ingresos.suposiciones];
```

y cambia `ingresos: clampIngresos(ai.ingresos, anchors),` por `ingresos,`.

En `tests/engine/anchors.test.ts`, en las expectativas `toEqual` de `computeAnchors`, añade `ingresosPublicos: null, empleados: null`.

- [ ] **Step 5: Ejecutar y comprobar que pasa**

Run: `npm test`
Expected: PASS en todo.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/anchors.ts lib/engine/report.ts tests/engine
git commit -m "Add public and employee-based revenue anchors to clamp AI estimates"
```

---

### Task 14: Cadena de modelos Gemini y reintentos ante saturación

**Files:**
- Modify: `lib/engine/ai/providers.ts`, `lib/engine/analyze.ts`, `.env.example`
- Modify (tests): `tests/engine/ai.test.ts`, `tests/engine/analyze.test.ts` (prueba de `depsFromEnv`)
- Test: `tests/engine/ai.test.ts`

**Interfaces:**
- Produces: `DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest"]`; `OVERLOAD_BACKOFF_MS = [2000, 5000]`; `geminiModelNames(env: { GEMINI_MODELS?: string; GEMINI_MODEL?: string }): string[]`; `generateAiOutput(prompt, models, attemptsPerModel = 3, sleep: (ms: number) => Promise<void> = defaultSleep)`; `geminiModel(apiKey, model = DEFAULT_GEMINI_MODELS[0])`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade a `tests/engine/ai.test.ts`:

```ts
import { geminiModelNames } from "../../lib/engine/ai/providers";

describe("geminiModelNames", () => {
  it("usa la cadena por defecto", () => {
    expect(geminiModelNames({})).toEqual(["gemini-3.5-flash", "gemini-flash-lite-latest"]);
  });
  it("lee GEMINI_MODELS separado por comas", () => {
    expect(geminiModelNames({ GEMINI_MODELS: " a , b ,," })).toEqual(["a", "b"]);
  });
  it("pone GEMINI_MODEL (ajuste antiguo) al principio sin duplicar", () => {
    expect(geminiModelNames({ GEMINI_MODEL: "gemini-flash-lite-latest" })).toEqual(["gemini-flash-lite-latest", "gemini-3.5-flash"]);
  });
});

describe("reintentos ante saturación", () => {
  it("reintenta el mismo modelo tras 2 s y 5 s y luego pasa al siguiente", async () => {
    const waits: number[] = [];
    const busy = model("gemini", [new Error("503 UNAVAILABLE")]);
    const backup = model("groq", [VALID]);
    const out = await generateAiOutput("p", [busy, backup], 3, async (ms) => {
      waits.push(ms);
    });
    expect(out).toEqual(validAiOutput);
    expect(busy.calls).toBe(3);
    expect(waits).toEqual([2000, 5000]);
  });

  it("si el modelo se recupera tras esperar, no pasa al siguiente", async () => {
    const flaky = model("gemini", [new Error("overloaded"), VALID]);
    const backup = model("groq", [VALID]);
    await generateAiOutput("p", [flaky, backup], 3, async () => {});
    expect(flaky.calls).toBe(2);
    expect(backup.calls).toBe(0);
  });
});
```

Busca en `ai.test.ts` las pruebas antiguas que usan un error 503, `UNAVAILABLE` u "overloaded" y esperaban un cambio inmediato de proveedor (`calls` igual a 1). Pásales un cuarto argumento `async () => {}` y cambia la expectativa a `3` llamadas: 1 intento más 2 reintentos.

En `tests/engine/analyze.test.ts`, en la prueba de `depsFromEnv`, cambia la expectativa de nombres a:

```ts
    expect(deps.models.map((m) => m.name)).toEqual(["gemini:gemini-3.5-flash", "gemini:gemini-flash-lite-latest", "groq:m"]);
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `npm test -- ai.test analyze`
Expected: FAIL.

- [ ] **Step 3: Implementar en `providers.ts`**

Añade tras `AI_TIMEOUT_MS`:

```ts
export const DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest"];
export const OVERLOAD_BACKOFF_MS = [2000, 5000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function geminiModelNames(env: { GEMINI_MODELS?: string; GEMINI_MODEL?: string }): string[] {
  const listed = (env.GEMINI_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const chain = listed.length > 0 ? listed : [...DEFAULT_GEMINI_MODELS];
  const legacy = env.GEMINI_MODEL?.trim();
  return legacy ? [legacy, ...chain.filter((m) => m !== legacy)] : chain;
}
```

Cambia la firma de `geminiModel` a `export function geminiModel(apiKey: string, model = DEFAULT_GEMINI_MODELS[0]): JsonModel {`.

Cambia la firma de `generateAiOutput` a:

```ts
export async function generateAiOutput(
  prompt: string,
  models: JsonModel[],
  attemptsPerModel = 3,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<AiOutput> {
```

Dentro del bucle por modelo, declara `let overloadRetries = 0;` justo antes del `for (let attempt…`, y sustituye la línea `if (isOverloadedError(error)) break; // servicio saturado: pasar al siguiente proveedor` por:

```ts
        if (isOverloadedError(error)) {
          // Saturación pasajera: esperar y reintentar el mismo modelo sin gastar un intento.
          if (overloadRetries < OVERLOAD_BACKOFF_MS.length) {
            await sleep(OVERLOAD_BACKOFF_MS[overloadRetries++]);
            attempt--;
            continue;
          }
          break; // sigue saturado: pasar al siguiente modelo
        }
```

- [ ] **Step 4: Implementar en `analyze.ts` y `.env.example`**

En `analyze.ts`, cambia el import a `import { geminiModel, geminiModelNames, groqModel, type JsonModel } from "./ai/providers";` y la línea de Gemini en `depsFromEnv` por:

```ts
  if (env.GEMINI_API_KEY) {
    for (const name of geminiModelNames(env)) models.push(geminiModel(env.GEMINI_API_KEY, name));
  }
```

En `.env.example`, sustituye la línea `GEMINI_MODEL=gemini-2.5-flash` por:

```
# Cadena de modelos Gemini (se prueban en orden si uno está saturado o retirado).
# Modelos disponibles: https://ai.google.dev/gemini-api/docs/models
GEMINI_MODELS=gemini-3.5-flash,gemini-flash-lite-latest
```

- [ ] **Step 5: Ejecutar y comprobar que pasa**

Run: `npm test`
Expected: PASS en todo.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/ai/providers.ts lib/engine/analyze.ts .env.example tests/engine
git commit -m "Gemini model chain with overload backoff"
```

---

### Task 15: Informe v2 (ficha de empresa, hechos, fuentes, fortalezas), prompt y documentación

**Files:**
- Create: `lib/engine/claims.ts`, `lib/engine/empresa.ts`, `tests/engine/empresa.test.ts`, `docs/decisiones/0005-fuentes-v2.md`, `docs/decisiones/0006-hechos-tres-estados.md`
- Modify: `lib/engine/ai/schema.ts`, `lib/engine/ai/prompt.ts`, `lib/engine/report.ts`, `tests/engine/ai-fixture.ts`, `tests/engine/analyze.test.ts`, `tests/engine/ai.test.ts`

**Interfaces:**
- Consumes: `computeFacts` (T11), `allLanguages`, `allTechnologies` (T12), tipos v2.
- Produces: `validateClaims(claims: { texto: string; senales: string[] }[], signals: Signal[], polarity: SignalPolarity, max?: number): Claim[]` con `Claim = { texto: string; evidencias: Signal[] }`; `type Dato<T> = { valor: T; fuente: SourceId } | null`; `interface EmpresaFicha` (ver código); `buildEmpresa(raw: RawData): EmpresaFicha`. `Report` añade `empresa: EmpresaFicha`, `hechos: Facts`, `fuentes: RawData["fuentes"]`; `veredicto.fortalezas` y `debilidades` pasan a `Claim[]`; `trafico.tecnologias` = `allTechnologies(raw)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/engine/empresa.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildEmpresa } from "../../lib/engine/empresa";
import { validateClaims } from "../../lib/engine/claims";
import { makeRaw } from "./raw-fixture";
import type { Signal } from "../../lib/engine/types";

describe("buildEmpresa", () => {
  it("rellena la ficha con la fuente de cada dato y null si falta", () => {
    const raw = makeRaw({
      wikidata: { id: "Q1", description: null, inception: 2016, founders: ["Ana"], headquarters: "Madrid", employees: 80, revenue: null },
      empleo: { platform: "lever", token: "f", openings: 7, byArea: { Ventas: 7 }, linkedFromSite: true },
      dns: { emailProvider: "Google Workspace", tools: [] },
      sitemap: { urlCount: 120, sections: [], languages: ["fr"], lastModified: "2026-10-01", recentBlogPosts: 0 },
      hackernews: { total: 2, lastYear: 1, top: { title: "Show HN", points: 10 } },
    });
    const e = buildEmpresa(raw);
    expect(e.nombre).toEqual({ valor: "Facturo", fuente: "web" });
    expect(e.fundacion).toEqual({ valor: 2016, fuente: "wikidata" });
    expect(e.fundadores).toEqual({ valor: ["Ana"], fuente: "wikidata" });
    expect(e.empleados).toEqual({ valor: 80, fuente: "wikidata" });
    expect(e.ingresosPublicos).toBeNull();
    expect(e.empleo).toEqual({ valor: { ofertas: 7, porArea: { Ventas: 7 }, plataforma: "lever" }, fuente: "empleo" });
    expect(e.app).toBeNull();
    expect(e.emailCorporativo).toEqual({ valor: "Google Workspace", fuente: "dns" });
    expect(e.herramientas).toBeNull();
    expect(e.web).toEqual({ valor: { paginas: 120, ultimaActualizacion: "2026-10-01", idiomas: ["es", "en", "fr"] }, fuente: "sitemap" });
    expect(e.menciones).toEqual({ valor: { total: 2, ultimoAnio: 1, destacada: { titulo: "Show HN", puntos: 10 } }, fuente: "hackernews" });
  });
});

describe("validateClaims", () => {
  const s = (id: string, polarity: "positiva" | "negativa"): Signal => ({ id, family: "traccion", source: "web", label: id, polarity });
  const signals = [s("a", "positiva"), s("b", "positiva"), s("n", "negativa")];

  it("conserva solo afirmaciones con señales reales de la polaridad pedida, máx. 3", () => {
    const claims = [
      { texto: "1", senales: ["a", "a"] },
      { texto: "2", senales: ["n"] },
      { texto: "3", senales: ["zzz"] },
      { texto: "4", senales: ["b", "n"] },
      { texto: "5", senales: ["a"] },
      { texto: "6", senales: ["b"] },
    ];
    expect(validateClaims(claims, signals, "positiva").map((c) => [c.texto, c.evidencias.map((e) => e.id)])).toEqual([
      ["1", ["a"]],
      ["4", ["b"]],
      ["5", ["a"]],
    ]);
  });
});
```

En `tests/engine/ai-fixture.ts` sustituye `fortalezas` y `debilidades` por:

```ts
    fortalezas: [
      { texto: "Precios claros", senales: ["trafico_alto"] },
      { texto: "Marca consolidada", senales: ["empresa_consolidada", "no_existe"] },
      { texto: "Inventada", senales: ["no_existe"] },
    ],
    debilidades: [
      { texto: "Web lenta en móvil", senales: ["pagespeed_movil_bajo"] },
      { texto: "Sin app", senales: ["sin_app_movil"] },
      { texto: "Contradictoria", senales: ["empresa_consolidada"] },
      { texto: "Tráfico en caída", senales: ["trafico_en_caida"] },
    ],
```

En `tests/engine/analyze.test.ts`, dentro de `describe("buildReport")`, sustituye la prueba que comprueba `fortalezas` (la de la puntuación global) por:

```ts
  it("calcula la puntuación global y valida fortalezas y debilidades contra señales reales", async () => {
    const report = await buildReport(raw, { models: [fakeModel], now: () => NOW });
    expect(report.veredicto.puntuacion).toBe(60);
    expect(report.veredicto.puntuaciones.traccion.senales).toEqual(["trafico_en_caida"]);
    expect(report.veredicto.fortalezas.map((f) => [f.texto, f.evidencias.map((e) => e.id)])).toEqual([
      ["Marca consolidada", ["empresa_consolidada"]],
    ]);
    expect(report.veredicto.debilidades.map((d) => d.texto)).toEqual(["Web lenta en móvil", "Sin app", "Tráfico en caída"]);
  });

  it("incluye ficha de empresa, hechos y estado de fuentes", async () => {
    const report = await buildReport(raw, { models: [fakeModel], now: () => NOW });
    expect(report.empresa.nombre).toEqual({ valor: "Facturo", fuente: "web" });
    expect(report.hechos.app).toBe("no");
    expect(report.fuentes.appstore).toBe("no_aplica");
  });
```

En `tests/engine/ai.test.ts`, en la prueba de `buildPrompt`, añade:

```ts
    expect(prompt).toContain("polaridad");
    expect(prompt).toContain('"empresa"');
    expect(prompt).toContain('"hechos"');
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `npm test`
Expected: FAIL (módulos nuevos no encontrados y forma de `fortalezas` incorrecta).

- [ ] **Step 3: Implementar `claims.ts` y `empresa.ts`**

`lib/engine/claims.ts`:

```ts
import type { Signal, SignalPolarity } from "./types";

export interface Claim {
  texto: string;
  evidencias: Signal[];
}

export function validateClaims(
  claims: { texto: string; senales: string[] }[],
  signals: Signal[],
  polarity: SignalPolarity,
  max = 3,
): Claim[] {
  const byId = new Map(signals.filter((s) => s.polarity === polarity).map((s) => [s.id, s]));
  return claims
    .map((c) => ({
      texto: c.texto,
      evidencias: Array.from(new Set(c.senales))
        .map((id) => byId.get(id))
        .filter((s): s is Signal => s !== undefined),
    }))
    .filter((c) => c.evidencias.length > 0)
    .slice(0, max);
}
```

`lib/engine/empresa.ts`:

```ts
import { allLanguages } from "./signals";
import type { EmailProvider, JobPlatform, RawData, SourceId, Technology } from "./types";

export type Dato<T> = { valor: T; fuente: SourceId } | null;

export interface EmpresaFicha {
  nombre: Dato<string>;
  fundacion: Dato<number>;
  fundadores: Dato<string[]>;
  sede: Dato<string>;
  empleados: Dato<number>;
  ingresosPublicos: Dato<{ importe: number; moneda: string; anio: number | null }>;
  empleo: Dato<{ ofertas: number; porArea: Record<string, number>; plataforma: JobPlatform }>;
  app: Dato<{ nombre: string; valoracion: number | null; valoraciones: number; url: string }>;
  emailCorporativo: Dato<EmailProvider>;
  herramientas: Dato<Technology[]>;
  web: Dato<{ paginas: number; ultimaActualizacion: string | null; idiomas: string[] }>;
  menciones: Dato<{ total: number; ultimoAnio: number; destacada: { titulo: string; puntos: number } | null }>;
}

const dato = <T>(valor: T | null | undefined, fuente: SourceId): Dato<T> =>
  valor === null || valor === undefined ? null : { valor, fuente };

export function buildEmpresa(raw: RawData): EmpresaFicha {
  const w = raw.wikidata;
  return {
    nombre: dato(raw.site?.companyName, "web"),
    fundacion: dato(w?.inception, "wikidata"),
    fundadores: dato(w && w.founders.length > 0 ? w.founders : null, "wikidata"),
    sede: dato(w?.headquarters, "wikidata"),
    empleados: dato(w?.employees, "wikidata"),
    ingresosPublicos: dato(w?.revenue ? { importe: w.revenue.amount, moneda: w.revenue.currency, anio: w.revenue.year } : null, "wikidata"),
    empleo: dato(raw.empleo ? { ofertas: raw.empleo.openings, porArea: raw.empleo.byArea, plataforma: raw.empleo.platform } : null, "empleo"),
    app: dato(
      raw.appstore ? { nombre: raw.appstore.name, valoracion: raw.appstore.rating, valoraciones: raw.appstore.ratingCount, url: raw.appstore.url } : null,
      "appstore",
    ),
    emailCorporativo: dato(raw.dns?.emailProvider, "dns"),
    herramientas: dato(raw.dns && raw.dns.tools.length > 0 ? raw.dns.tools : null, "dns"),
    web: dato(
      raw.sitemap ? { paginas: raw.sitemap.urlCount, ultimaActualizacion: raw.sitemap.lastModified, idiomas: allLanguages(raw) } : null,
      "sitemap",
    ),
    menciones: dato(
      raw.hackernews
        ? {
            total: raw.hackernews.total,
            ultimoAnio: raw.hackernews.lastYear,
            destacada: raw.hackernews.top ? { titulo: raw.hackernews.top.title, puntos: raw.hackernews.top.points } : null,
          }
        : null,
      "hackernews",
    ),
  };
}
```

- [ ] **Step 4: Actualizar el esquema**

En `lib/engine/ai/schema.ts` añade `const claim = z.object({ texto: z.string(), senales: z.array(z.string()) });` y cambia en `veredicto`:

```ts
    fortalezas: z.array(claim),
    debilidades: z.array(claim),
```

- [ ] **Step 5: Actualizar el prompt**

En `lib/engine/ai/prompt.ts`:

1. Imports:

```ts
import type { Anchors } from "../anchors";
import { buildEmpresa } from "../empresa";
import { computeFacts } from "../facts";
import type { RawData, Signal } from "../types";
```

2. En `OUTPUT_SHAPE`, sustituye la línea de fortalezas y debilidades por:

```
    "fortalezas": [{ "texto": string, "senales": string[] }], "debilidades": [{ "texto": string, "senales": string[] }],
```

3. En el objeto `data`, añade después de `dominio: raw.domain,`:

```ts
    dominioRaiz: raw.rootDomain,
    empresa: buildEmpresa(raw),
    hechos: computeFacts(raw),
```

4. Cambia la regla 4 y añade la 9 y la 10 (manteniendo la 8 tal cual):

```
4. "oportunidades": de 3 a 6. Cada una debe citar en "senales" los ids de señales NEGATIVAS de la lista de abajo o de tus "senalesMercado". Cita al menos 2 señales de fuentes distintas; las oportunidades sin respaldo se descartan.
```

```
9. "fortalezas": hasta 3, cada una citando en "senales" ids de señales POSITIVAS de la lista. "debilidades": hasta 3, citando ids de señales NEGATIVAS. Las que no citen señales válidas se descartan.
10. Usa "empresa" (datos reales con su fuente) para el resumen y para los ingresos: si hay empleados o ingresos públicos, apóyate en ellos y explícalo en "suposiciones".
```

5. Cambia la cabecera y el formato de la lista de señales:

```ts
Señales detectadas (id — fuente — polaridad — descripción):
${signals.map((s) => `- ${s.id} — ${s.source} — ${s.polarity} — ${s.label}`).join("\n") || "- (ninguna)"}
```

- [ ] **Step 6: Actualizar `report.ts`**

1. Imports nuevos:

```ts
import { validateClaims, type Claim } from "./claims";
import { buildEmpresa, type EmpresaFicha } from "./empresa";
import { computeFacts, type Facts } from "./facts";
import { allTechnologies } from "./signals";
```

(junta `allTechnologies` con el import existente de `extractSignals`).

2. En la interfaz `Report`, añade después de `analisisLimitado: boolean;`:

```ts
  empresa: EmpresaFicha;
  hechos: Facts;
  fuentes: RawData["fuentes"];
```

y cambia en `veredicto`:

```ts
    fortalezas: Claim[];
    debilidades: Claim[];
```

3. En `buildReport`, cambia la llamada a `validateOpportunities` por:

```ts
  const { oportunidades, pistas } = validateOpportunities(
    ai.oportunidades,
    signals.filter((s) => s.polarity === "negativa"),
  );
```

4. En el objeto devuelto:
   - añade después de `analisisLimitado: …,`:

```ts
    empresa: buildEmpresa(raw),
    hechos: computeFacts(raw),
    fuentes: raw.fuentes,
```

   - cambia `tecnologias: raw.site?.technologies ?? [],` por `tecnologias: allTechnologies(raw),`
   - cambia las líneas de fortalezas y debilidades por:

```ts
      fortalezas: validateClaims(ai.veredicto.fortalezas, signals, "positiva"),
      debilidades: validateClaims(ai.veredicto.debilidades, signals, "negativa"),
```

- [ ] **Step 7: Ejecutar y comprobar que pasa**

Run: `npm test`
Expected: PASS en todo.
Run: `npx next typegen && npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 8: Registrar las decisiones**

`docs/decisiones/0005-fuentes-v2.md`:

```markdown
# 0005 — Siete fuentes gratuitas más

- **Fecha:** 2026-10-15
- **Contexto:** La primera prueba real (notion.so) dio pocos datos de empresa y señales falsas.
- **Decisión:** Se añaden sitemap, comprobación de rutas, empleo (Greenhouse/Lever/Ashby), App Store, Wikidata, DNS (Cloudflare DoH) y Hacker News (Algolia). Todas sin clave ni pago, en paralelo, con un plazo total de 40 s.
- **Identificación:** App Store y Wikidata solo se aceptan si su web coincide con el dominio registrable analizado. Los tableros de empleo enlazados desde la web tienen prioridad sobre los adivinados.
- **Dominio final:** Tranco, Radar, RDAP, DNS y Hacker News usan el dominio registrable de la URL final tras las redirecciones.
- **Estados:** cada fuente queda como `ok`, `fallo` o `no_aplica` en `informe.fuentes`.
```

`docs/decisiones/0006-hechos-tres-estados.md`:

```markdown
# 0006 — Hechos de tres estados y señales positivas

- **Fecha:** 2026-10-15
- **Decisión:** Los hechos (blog, página de precios, empleo, app, email marketing, chat/soporte) valen "si" si cualquier fuente los ve, "no" si dos o más fuentes independientes los comprobaron sin verlos, y "desconocido" en otro caso. Las señales negativas de presencia solo se emiten con "no".
- **Por qué:** En webs hechas con JavaScript, "no lo he visto" no significa "no existe" (caso Notion: "no tiene blog").
- **Señales positivas:** se añaden 13 (contratación, app valorada, blog activo, idiomas, tráfico alto…). Las fortalezas del informe deben citar señales positivas y las debilidades señales negativas; si no, se descartan.
- **Ingresos:** si Wikidata tiene ingresos públicos (±10 %, confianza alta) o empleados (× ingresos por empleado del sector, ×0,5–×1,5, confianza media), la cifra de la IA se acota a ese ancla.
```

- [ ] **Step 9: Commit**

```bash
git add lib/engine tests/engine docs/decisiones
git commit -m "Report v2: company profile, facts, source status and evidence-backed strengths"
```

- [ ] **Step 10: Prueba manual con webs reales**

Requiere `GEMINI_API_KEY` en `.env.local` (ya configurada). Ejecuta, una por una:

```bash
npm run analyze -- notion.so
```

```bash
npm run analyze -- allbirds.com
```

```bash
npm run analyze -- holded.com
```

```bash
npm run analyze -- tally.so
```

```bash
npm run analyze -- duolingo.com
```

Para cada una, anota en el informe de la tarea:
- el tiempo total;
- `fuentes`;
- la ficha `empresa`;
- `hechos`;
- las señales negativas de presencia;
- las fortalezas.

Señala cualquier señal falsa evidente (por ejemplo "sin_blog" en una web que tiene blog) y cualquier dato de empresa que no corresponda a esa empresa. **No cambies código en este paso:** solo informa.
