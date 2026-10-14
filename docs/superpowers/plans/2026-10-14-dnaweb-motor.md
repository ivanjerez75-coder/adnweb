# DNAweb — Plan 1: Motor de análisis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el proyecto DNAweb y su motor de análisis (`lib/engine/`), que recibe una URL y devuelve datos brutos + un informe de 5 secciones, ejecutable desde la terminal con `npm run analyze -- <url>`.

**Architecture:** El motor es TypeScript puro, sin dependencias de React ni de Next.js. Trabaja en 3 fases: (1) recogida de datos de fuentes gratuitas, cada una en su módulo; (2) anclas y señales calculadas por código; (3) Gemini redacta el informe en JSON validado con zod, y el código filtra las oportunidades (regla 2+2) y calcula las confianzas. Toda la red pasa por funciones inyectadas (`Fetcher`, `PageGetter`, `JsonModel`), así que las pruebas no tocan internet.

**Tech Stack:** Next.js 16 (solo como contenedor del proyecto en este plan), TypeScript, Vitest, cheerio, zod 3, @google/genai, tsx.

**Spec:** `docs/superpowers/specs/2026-10-14-dnaweb-mvp-design.md`

**Planes siguientes (fuera de este plan):** Plan 2 (Supabase, auth, créditos, ejecución en segundo plano) y Plan 3 (interfaz).

## Global Constraints

- MVP 100 % gratuito: ninguna API de pago. Fuentes: la propia web, detección de tecnologías propia, Tranco, Cloudflare Radar (token gratuito), Google PageSpeed Insights, RDAP, Wayback Machine. IA: Gemini capa gratuita; respaldo Groq (modelos gratuitos).
- `lib/engine/` no importa nada de `react`, `next` ni `@/app`. Usa imports relativos (para que `tsx` lo ejecute sin alias).
- Toda llamada de red se hace a través de un `Fetcher`/`PageGetter`/`JsonModel` recibido por parámetro; nunca se llama a `fetch` global directamente salvo en los valores por defecto de `depsFromEnv`.
- Las páginas de la web analizada se descargan SIEMPRE con `createSafeGetter` (protección SSRF).
- Textos visibles para el usuario, en español.
- Toda cifra estimada lleva rango + confianza (`"baja" | "media" | "alta"`) + base; si no hay datos → `null` ("no estimable").
- Oportunidad válida: ≥ 2 señales existentes de ≥ 2 fuentes distintas. Confianza: ≥ 4 señales y ≥ 3 fuentes → alta; ≥ 3 señales → media; si no → baja. La calcula el código.
- Variables de entorno: `GEMINI_API_KEY`, `GEMINI_MODEL` (por defecto `gemini-2.5-flash`), `GROQ_API_KEY`, `GROQ_MODEL` (por defecto `llama-3.3-70b-versatile`), `CLOUDFLARE_RADAR_TOKEN`, `PAGESPEED_API_KEY`. Todas opcionales salvo al menos una de IA.
- Los mensajes de commit terminan con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Directorio del proyecto: `C:\Users\ivanj\OneDrive\Desktop\dnaweb` (repo ya inicializado, rama `main`, con `docs/`).

## Estructura de archivos

```
lib/engine/
  types.ts              Tipos compartidos (Signal, RawData, SiteData, Fetcher…)
  url.ts                normalizeUrl + InvalidUrlError
  safe-fetch.ts         isPrivateAddress, createSafeGetter, checkReachable, BlockedUrlError
  sources/
    site-parse.ts       parsePage, pickKeyPages, buildSiteData (puro)
    tech.ts             detectTech (puro)
    site.ts             fetchSite (orquesta la descarga de la web)
    tranco.ts           fetchTranco + parseTranco
    radar.ts            fetchRadar + parseRadar
    pagespeed.ts        fetchPageSpeed + parsePageSpeedScore
    rdap.ts             fetchRdap + parseRdap
    wayback.ts          fetchWayback + parseWayback
  collect.ts            Fase 1: ejecuta todas las fuentes, InsufficientDataError
  anchors.ts            Fase 2: visitsFromRank, computeAnchors
  signals.ts            Fase 2: extractSignals
  opportunities.ts      confidenceFor, validateOpportunities
  ai/
    schema.ts           aiOutputSchema (zod) + AiOutput
    prompt.ts           buildPrompt
    providers.ts        JsonModel, geminiModel, groqModel, generateAiOutput, AiUnavailableError
  report.ts             Report + buildReport (Fase 2 + 3)
  analyze.ts            analyze() + depsFromEnv()
scripts/analyze.ts      CLI
tests/engine/…          Pruebas (Vitest)
tests/fixtures/…        HTML de ejemplo
docs/decisiones/…       Registro de decisiones
```

---

### Task 1: Proyecto base + normalización de URL

**Files:**
- Create (generados): proyecto Next.js en la raíz de `dnaweb`
- Create: `vitest.config.ts`, `.env.example`, `lib/engine/url.ts`, `tests/engine/url.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `normalizeUrl(input: string): NormalizedUrl` con `NormalizedUrl = { url: string; domain: string }` (`url` siempre `https://<host>/`, `domain` sin `www.`); `class InvalidUrlError extends Error`.

- [ ] **Step 1: Crear el proyecto Next.js**

Desde `C:\Users\ivanj\OneDrive\Desktop\dnaweb` (la carpeta ya tiene `.git` y `docs/`, que create-next-app permite):

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
```

Expected: termina sin errores; existen `app/`, `package.json`, `AGENTS.md`. Lee `AGENTS.md`: indica que esta versión de Next.js tiene cambios importantes y que hay que consultar `node_modules/next/dist/docs/` antes de escribir código de Next (no aplica a `lib/engine/`).

- [ ] **Step 2: Instalar dependencias**

```bash
npm install cheerio zod@^3 @google/genai
```

```bash
npm install -D vitest tsx
```

- [ ] **Step 3: Configurar Vitest, scripts y `.env.example`**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
```

En `package.json`, dentro de `"scripts"`, añade:

```json
"test": "vitest run",
"test:watch": "vitest",
"analyze": "tsx --env-file=.env.local scripts/analyze.ts"
```

`.env.example`:

```
# IA (al menos una). Clave gratuita: https://aistudio.google.com/apikey
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
# Respaldo gratuito: https://console.groq.com/keys
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
# Opcionales (gratuitas)
CLOUDFLARE_RADAR_TOKEN=
PAGESPEED_API_KEY=
```

Copia `.env.example` a `.env.local` (ya ignorado por el `.gitignore` de Next).

- [ ] **Step 4: Escribir la prueba que falla**

`tests/engine/url.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeUrl, InvalidUrlError } from "../../lib/engine/url";

describe("normalizeUrl", () => {
  it("normaliza un dominio sin protocolo y con ruta", () => {
    expect(normalizeUrl("Notion.so/precios")).toEqual({ url: "https://notion.so/", domain: "notion.so" });
  });

  it("conserva www en la url pero no en el dominio", () => {
    expect(normalizeUrl("http://www.zara.com/es/")).toEqual({ url: "https://www.zara.com/", domain: "zara.com" });
  });

  it("acepta espacios alrededor", () => {
    expect(normalizeUrl("  stripe.com  ").domain).toBe("stripe.com");
  });

  it.each([
    "",
    "   ",
    "localhost",
    "http://192.168.1.1",
    "http://[::1]/",
    "ftp://example.com",
    "https://user:pass@example.com",
    "example.com:8080",
    "sin-punto",
    "javascript:alert(1)",
  ])("rechaza %j", (input) => {
    expect(() => normalizeUrl(input)).toThrow(InvalidUrlError);
  });
});
```

- [ ] **Step 5: Ejecutar y comprobar que falla**

Run: `npm test`
Expected: FAIL, no se encuentra `../../lib/engine/url`.

- [ ] **Step 6: Implementar**

`lib/engine/url.ts`:

```ts
export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUrlError";
  }
}

export interface NormalizedUrl {
  url: string;
  domain: string;
}

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidUrlError("Introduce una URL.");

  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^:/]+:\d+/.test(trimmed);
  const withProtocol = hasProtocol ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new InvalidUrlError("La URL no es válida.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError("Solo se admiten URLs http o https.");
  }
  if (parsed.username || parsed.password) {
    throw new InvalidUrlError("La URL no puede incluir usuario o contraseña.");
  }
  if (parsed.port) {
    throw new InvalidUrlError("No se admiten puertos personalizados.");
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!HOSTNAME_RE.test(host)) {
    throw new InvalidUrlError("Introduce un dominio válido, por ejemplo notion.so.");
  }

  return { url: `https://${host}/`, domain: host.replace(/^www\./, "") };
}
```

(Nota: `new URL` deja `port` vacío cuando es el puerto por defecto, así que `https://x.com:443` se acepta. `example.com:8080` no tiene protocolo: el segundo test de `hasProtocol` evita confundir `example.com:` con un protocolo.)

- [ ] **Step 7: Ejecutar y comprobar que pasa**

Run: `npm test`
Expected: PASS (todos los casos de `url.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold DNAweb project and add URL normalization"
```

---

### Task 2: Tipos compartidos + descarga segura (SSRF)

**Files:**
- Create: `lib/engine/types.ts`, `lib/engine/safe-fetch.ts`, `tests/engine/safe-fetch.test.ts`

**Interfaces:**
- Produces (types.ts): `Fetcher`, `Confidence`, `SourceId`, `SignalFamily`, `Signal`, `Technology`, `TechCategory`, `SitePage`, `SiteData`, `TrancoData`, `RadarData`, `PageSpeedData`, `RdapData`, `WaybackData`, `RawData`, `Range`.
- Produces (safe-fetch.ts): `isPrivateAddress(ip: string): boolean`; `type Resolver = (hostname: string) => Promise<string[]>`; `interface FetchedPage { url: string; status: number; headers: Record<string, string>; text: string }`; `type PageGetter = (url: string) => Promise<FetchedPage>`; `createSafeGetter(opts?: SafeFetchOptions): PageGetter`; `checkReachable(url: string, get: PageGetter): Promise<boolean>`; `class BlockedUrlError extends Error`.

- [ ] **Step 1: Crear los tipos compartidos**

`lib/engine/types.ts`:

```ts
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type Confidence = "baja" | "media" | "alta";

export type SourceId =
  | "web"
  | "tecnologias"
  | "tranco"
  | "radar"
  | "pagespeed"
  | "rdap"
  | "wayback"
  | "mercado";

export type SignalFamily =
  | "producto"
  | "contenido"
  | "tecnica"
  | "alcance"
  | "traccion"
  | "mercado"
  | "confianza";

export interface Signal {
  id: string;
  family: SignalFamily;
  source: SourceId;
  label: string;
}

export type TechCategory =
  | "ecommerce"
  | "cms"
  | "pagos"
  | "analitica"
  | "publicidad"
  | "chat"
  | "email"
  | "framework";

export interface Technology {
  name: string;
  category: TechCategory;
}

export interface SitePage {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
}

export interface SiteData {
  finalUrl: string;
  pages: SitePage[];
  languages: string[];
  socialLinks: Record<string, string>;
  ctas: string[];
  hasPricingPage: boolean;
  pricesFound: string[];
  hasBlog: boolean;
  hasTestimonials: boolean;
  hasFreePlanOrTrial: boolean;
  hasAppLinks: boolean;
  jsonLdTypes: string[];
  textLength: number;
  technologies: Technology[];
}

export type Trend = "sube" | "estable" | "baja";

export interface TrancoData {
  rank: number | null;
  trend: Trend | null;
}

export interface RadarData {
  bucket: number | null;
}

export interface PageSpeedData {
  mobile: number | null;
  desktop: number | null;
}

export interface RdapData {
  registeredAt: string | null;
}

export interface WaybackData {
  firstCapture: string | null;
  lastChange: string | null;
  changesLastYear: number;
}

export interface RawData {
  url: string;
  domain: string;
  collectedAt: string;
  site: SiteData | null;
  tranco: TrancoData | null;
  radar: RadarData | null;
  pagespeed: PageSpeedData | null;
  rdap: RdapData | null;
  wayback: WaybackData | null;
  unavailable: SourceId[];
}

export interface Range {
  min: number;
  max: number;
}
```

- [ ] **Step 2: Escribir la prueba que falla**

`tests/engine/safe-fetch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isPrivateAddress,
  createSafeGetter,
  checkReachable,
  BlockedUrlError,
} from "../../lib/engine/safe-fetch";

const publicResolver = async () => ["93.184.216.34"];

describe("isPrivateAddress", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "192.168.1.20",
    "172.20.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("bloquea %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700::1111"])("permite %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("createSafeGetter", () => {
  it("devuelve el HTML y las cabeceras de una web pública", async () => {
    const get = createSafeGetter({
      resolve: publicResolver,
      fetcher: async () =>
        new Response("<html>ok</html>", { status: 200, headers: { "x-powered-by": "Next.js" } }),
    });
    const page = await get("https://example.com/");
    expect(page).toMatchObject({ url: "https://example.com/", status: 200, text: "<html>ok</html>" });
    expect(page.headers["x-powered-by"]).toBe("Next.js");
  });

  it("bloquea dominios que resuelven a IPs privadas", async () => {
    const get = createSafeGetter({
      resolve: async () => ["10.0.0.5"],
      fetcher: async () => new Response("secreto"),
    });
    await expect(get("https://intranet.example.com/")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("bloquea redirecciones hacia direcciones internas", async () => {
    const resolve = async (host: string) =>
      host === "evil.example.com" ? ["93.184.216.34"] : ["127.0.0.1"];
    const get = createSafeGetter({
      resolve,
      fetcher: async () =>
        new Response(null, { status: 302, headers: { location: "http://internal.example.com/admin" } }),
    });
    await expect(get("https://evil.example.com/")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("sigue redirecciones públicas", async () => {
    const fetcher = async (url: string) =>
      url === "https://a.example.com/"
        ? new Response(null, { status: 301, headers: { location: "https://www.a.example.com/" } })
        : new Response("final", { status: 200 });
    const page = await createSafeGetter({ resolve: publicResolver, fetcher })("https://a.example.com/");
    expect(page.url).toBe("https://www.a.example.com/");
    expect(page.text).toBe("final");
  });

  it("corta respuestas demasiado grandes", async () => {
    const get = createSafeGetter({
      resolve: publicResolver,
      maxBytes: 10,
      fetcher: async () => new Response("x".repeat(100)),
    });
    expect((await get("https://example.com/")).text).toBe("x".repeat(10));
  });
});

describe("checkReachable", () => {
  it("es true si la web responde aunque sea con 403", async () => {
    const get = createSafeGetter({ resolve: publicResolver, fetcher: async () => new Response("", { status: 403 }) });
    expect(await checkReachable("https://example.com/", get)).toBe(true);
  });

  it("es false si la petición falla", async () => {
    const get = createSafeGetter({
      resolve: publicResolver,
      fetcher: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(await checkReachable("https://example.com/", get)).toBe(false);
  });

  it("propaga el bloqueo de direcciones internas", async () => {
    const get = createSafeGetter({ resolve: async () => ["127.0.0.1"], fetcher: async () => new Response("") });
    await expect(checkReachable("https://example.com/", get)).rejects.toBeInstanceOf(BlockedUrlError);
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

Run: `npm test -- safe-fetch`
Expected: FAIL, no se encuentra `safe-fetch`.

- [ ] **Step 4: Implementar**

`lib/engine/safe-fetch.ts`:

```ts
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Fetcher } from "./types";

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export type Resolver = (hostname: string) => Promise<string[]>;

export interface FetchedPage {
  url: string;
  status: number;
  headers: Record<string, string>;
  text: string;
}

export type PageGetter = (url: string) => Promise<FetchedPage>;

export interface SafeFetchOptions {
  fetcher?: Fetcher;
  resolve?: Resolver;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
}

const USER_AGENT = "Mozilla/5.0 (compatible; DNAwebBot/0.1; +https://dnaweb.app)";

export const defaultResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((a) => a.address);

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  if (lower.startsWith("::ffff:")) return true;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 (ULA)
    (first & 0xffc0) === 0xfe80 || // fe80::/10 (link-local)
    (first & 0xff00) === 0xff00 // ff00::/8 (multicast)
  );
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true;
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - total;
    if (value.byteLength >= remaining) {
      chunks.push(value.subarray(0, remaining));
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function createSafeGetter(opts: SafeFetchOptions = {}): PageGetter {
  const fetcher: Fetcher = opts.fetcher ?? fetch;
  const resolve = opts.resolve ?? defaultResolver;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? 2_000_000;

  return async (startUrl) => {
    let current = startUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const parsed = new URL(current);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new BlockedUrlError(`Protocolo no permitido: ${parsed.protocol}`);
      }
      const host = parsed.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(host) ? [host] : await resolve(host);
      if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
        throw new BlockedUrlError(`Dirección no permitida: ${parsed.hostname}`);
      }

      const res = await fetcher(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error(`Redirección sin destino en ${current}`);
        current = new URL(location, current).toString();
        continue;
      }

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { url: current, status: res.status, headers, text: await readLimited(res, maxBytes) };
    }
    throw new Error("Demasiadas redirecciones.");
  };
}

export async function checkReachable(url: string, get: PageGetter): Promise<boolean> {
  try {
    const page = await get(url);
    return page.status < 500;
  } catch (error) {
    if (error instanceof BlockedUrlError) throw error;
    return false;
  }
}
```

- [ ] **Step 5: Ejecutar y comprobar que pasa**

Run: `npm test -- safe-fetch`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/types.ts lib/engine/safe-fetch.ts tests/engine/safe-fetch.test.ts
git commit -m "Add engine shared types and SSRF-safe page getter"
```

---

### Task 3: Análisis del HTML y detección de tecnologías

**Files:**
- Create: `lib/engine/sources/site-parse.ts`, `lib/engine/sources/tech.ts`
- Create: `tests/fixtures/saas-home.html`, `tests/fixtures/saas-pricing.html`, `tests/fixtures/shop-home.html`, `tests/fixtures/js-only.html`
- Create: `tests/engine/site-parse.test.ts`, `tests/engine/tech.test.ts`

**Interfaces:**
- Consumes: `SitePage`, `SiteData`, `Technology`, `TechCategory` de `types.ts`.
- Produces: `parsePage(html: string, pageUrl: string): ParsedPage`; `pickKeyPages(links: string[], homeUrl: string, max?: number): string[]`; `buildSiteData(finalUrl: string, pages: ParsedPage[], technologies: Technology[]): SiteData`; `detectTech(html: string, headers: Record<string, string>): Technology[]`.

- [ ] **Step 1: Crear las webs de ejemplo**

`tests/fixtures/saas-home.html`:

```html
<!doctype html>
<html lang="es">
<head>
<title>Facturo — Facturación online para autónomos</title>
<meta name="description" content="Crea y envía facturas en segundos.">
<link rel="alternate" hreflang="es" href="https://facturo.example/">
<link rel="alternate" hreflang="en" href="https://facturo.example/en/">
<link rel="alternate" hreflang="x-default" href="https://facturo.example/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Facturo"}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-123"></script>
<script src="https://js.stripe.com/v3/"></script>
<script>window.intercomSettings = { app_id: "abc" };</script>
</head>
<body>
<nav>
  <a href="/precios">Precios</a>
  <a href="/blog/">Blog</a>
  <a href="/sobre-nosotros">Sobre nosotros</a>
  <a href="https://otra-web.example/precios">Externa</a>
  <a href="mailto:hola@facturo.example">Email</a>
</nav>
<h1>Facturación online para autónomos</h1>
<h2>Empieza gratis, sin tarjeta</h2>
<p>Más de 10.000 autónomos confían en Facturo. Lee los testimonios de nuestros clientes.</p>
<a href="/registro">Empieza gratis</a>
<button>Pide una demo</button>
<a href="https://twitter.com/facturo">Twitter</a>
<a href="https://www.linkedin.com/company/facturo">LinkedIn</a>
<a href="https://apps.apple.com/app/facturo/id123">App Store</a>
</body>
</html>
```

`tests/fixtures/saas-pricing.html`:

```html
<!doctype html>
<html lang="es">
<head><title>Precios — Facturo</title></head>
<body>
<h1>Planes</h1>
<p>Básico 9 €/mes</p>
<p>Pro 29 €/mes</p>
<p>Prueba gratuita de 14 días</p>
</body>
</html>
```

`tests/fixtures/shop-home.html`:

```html
<!doctype html>
<html lang="es">
<head>
<title>Zapas Rápidas — Tienda de zapatillas</title>
<link rel="stylesheet" href="https://cdn.shopify.com/s/files/theme.css">
</head>
<body>
<h1>Zapatillas de running</h1>
<div class="product"><h3>Modelo Viento</h3><span>€59,99</span><button>Añadir al carrito</button></div>
<div class="product"><h3>Modelo Trueno</h3><span>€79,99</span><button>Añadir al carrito</button></div>
</body>
</html>
```

`tests/fixtures/js-only.html`:

```html
<!doctype html>
<html>
<head><title>App</title><script src="/_next/static/chunks/main.js"></script></head>
<body><div id="__next"></div></body>
</html>
```

- [ ] **Step 2: Escribir las pruebas que fallan**

`tests/engine/site-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parsePage, pickKeyPages, buildSiteData } from "../../lib/engine/sources/site-parse";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const HOME = "https://facturo.example/";

describe("parsePage", () => {
  const parsed = parsePage(fixture("saas-home.html"), HOME);

  it("extrae título, descripción y encabezados", () => {
    expect(parsed.page.title).toBe("Facturo — Facturación online para autónomos");
    expect(parsed.page.description).toBe("Crea y envía facturas en segundos.");
    expect(parsed.page.headings).toContain("Empieza gratis, sin tarjeta");
  });

  it("detecta idiomas sin incluir x-default", () => {
    expect(parsed.lang).toBe("es");
    expect(parsed.hreflangs).toEqual(["es", "en"]);
  });

  it("detecta redes, apps, CTAs y datos estructurados", () => {
    expect(parsed.socialLinks).toEqual({
      x: "https://twitter.com/facturo",
      linkedin: "https://www.linkedin.com/company/facturo",
    });
    expect(parsed.hasAppLinks).toBe(true);
    expect(parsed.ctas).toEqual(expect.arrayContaining(["Empieza gratis", "Pide una demo"]));
    expect(parsed.jsonLdTypes).toEqual(["SoftwareApplication"]);
  });

  it("detecta testimonios y plan gratuito en el texto", () => {
    expect(parsed.mentionsTestimonials).toBe(true);
    expect(parsed.mentionsFreeOrTrial).toBe(true);
  });

  it("convierte los enlaces en absolutos e ignora mailto", () => {
    expect(parsed.links).toContain("https://facturo.example/precios");
    expect(parsed.links.some((l) => l.startsWith("mailto:"))).toBe(false);
  });

  it("no incluye el contenido de los scripts en el texto", () => {
    expect(parsed.page.text).not.toContain("intercomSettings");
  });

  it("detecta precios", () => {
    expect(parsePage(fixture("saas-pricing.html"), `${HOME}precios`).prices).toEqual(["9 €", "29 €"]);
    expect(parsePage(fixture("shop-home.html"), "https://zapas.example/").prices).toEqual(["€59,99", "€79,99"]);
  });

  it("devuelve texto casi vacío para webs hechas solo con JavaScript", () => {
    const js = parsePage(fixture("js-only.html"), "https://app.example/");
    expect(js.textLength).toBeLessThan(50);
    expect(js.lang).toBeNull();
  });
});

describe("pickKeyPages", () => {
  it("elige páginas clave del mismo dominio, una por tipo", () => {
    const links = [
      "https://facturo.example/precios",
      "https://facturo.example/blog/",
      "https://facturo.example/blog/post-1",
      "https://facturo.example/sobre-nosotros",
      "https://otra-web.example/precios",
      "https://facturo.example/registro",
      "https://www.facturo.example/pricing",
    ];
    expect(pickKeyPages(links, HOME)).toEqual([
      "https://facturo.example/precios",
      "https://facturo.example/blog/",
      "https://facturo.example/sobre-nosotros",
    ]);
  });

  it("respeta el máximo", () => {
    const links = ["/precios", "/blog", "/about", "/producto", "/features", "/empresa"].map(
      (p) => `https://facturo.example${p}`,
    );
    expect(pickKeyPages(links, HOME, 2)).toHaveLength(2);
  });
});

describe("buildSiteData", () => {
  it("agrega la información de varias páginas", () => {
    const home = parsePage(fixture("saas-home.html"), HOME);
    const pricing = parsePage(fixture("saas-pricing.html"), `${HOME}precios`);
    const site = buildSiteData(HOME, [home, pricing], [{ name: "Stripe", category: "pagos" }]);

    expect(site.finalUrl).toBe(HOME);
    expect(site.pages).toHaveLength(2);
    expect(site.pricesFound).toEqual(["9 €", "29 €"]);
    expect(site.hasPricingPage).toBe(true);
    expect(site.hasBlog).toBe(true);
    expect(site.languages).toEqual(["es", "en"]);
    expect(site.hasFreePlanOrTrial).toBe(true);
    expect(site.hasTestimonials).toBe(true);
    expect(site.hasAppLinks).toBe(true);
    expect(site.technologies).toEqual([{ name: "Stripe", category: "pagos" }]);
    expect(site.textLength).toBe(home.textLength + pricing.textLength);
  });
});
```

`tests/engine/tech.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectTech } from "../../lib/engine/sources/tech";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const names = (html: string, headers: Record<string, string> = {}) =>
  detectTech(html, headers).map((t) => t.name);

describe("detectTech", () => {
  it("detecta analítica, pagos y chat en el SaaS", () => {
    expect(names(fixture("saas-home.html"))).toEqual(
      expect.arrayContaining(["Google Analytics", "Stripe", "Intercom"]),
    );
  });

  it("detecta Shopify en la tienda", () => {
    expect(detectTech(fixture("shop-home.html"), {})).toContainEqual({ name: "Shopify", category: "ecommerce" });
  });

  it("detecta tecnologías en las cabeceras", () => {
    expect(names("", { "x-powered-by": "Next.js" })).toContain("Next.js");
  });

  it("no repite tecnologías ni inventa ninguna en una web vacía", () => {
    expect(names("<html></html>")).toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que fallan**

Run: `npm test -- site-parse tech`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 4: Implementar `tech.ts`**

`lib/engine/sources/tech.ts`:

```ts
import type { Technology, TechCategory } from "../types";

interface TechRule {
  name: string;
  category: TechCategory;
  pattern: RegExp;
}

const RULES: TechRule[] = [
  { name: "Shopify", category: "ecommerce", pattern: /cdn\.shopify\.com|Shopify\.theme/i },
  { name: "WooCommerce", category: "ecommerce", pattern: /woocommerce/i },
  { name: "PrestaShop", category: "ecommerce", pattern: /prestashop/i },
  { name: "Magento", category: "ecommerce", pattern: /Magento|mage\/cookies/i },
  { name: "WordPress", category: "cms", pattern: /wp-content|wp-includes/i },
  { name: "Wix", category: "cms", pattern: /static\.wixstatic\.com|wix\.com/i },
  { name: "Squarespace", category: "cms", pattern: /squarespace/i },
  { name: "Webflow", category: "cms", pattern: /webflow/i },
  { name: "Stripe", category: "pagos", pattern: /js\.stripe\.com/i },
  { name: "PayPal", category: "pagos", pattern: /paypal\.com\/sdk|paypalobjects\.com/i },
  { name: "Google Analytics", category: "analitica", pattern: /googletagmanager\.com\/gtag|google-analytics\.com|gtag\(/i },
  { name: "Google Tag Manager", category: "analitica", pattern: /googletagmanager\.com\/gtm\.js/i },
  { name: "Plausible", category: "analitica", pattern: /plausible\.io/i },
  { name: "Hotjar", category: "analitica", pattern: /static\.hotjar\.com/i },
  { name: "Mixpanel", category: "analitica", pattern: /cdn\.mxpnl\.com|mixpanel/i },
  { name: "Segment", category: "analitica", pattern: /cdn\.segment\.com/i },
  { name: "Google Ads", category: "publicidad", pattern: /googleadservices\.com|AW-\d{6,}/i },
  { name: "Meta Pixel", category: "publicidad", pattern: /connect\.facebook\.net\/[^"']*fbevents|fbq\(/i },
  { name: "LinkedIn Insight", category: "publicidad", pattern: /snap\.licdn\.com/i },
  { name: "TikTok Pixel", category: "publicidad", pattern: /analytics\.tiktok\.com/i },
  { name: "Intercom", category: "chat", pattern: /widget\.intercom\.io|intercomSettings/i },
  { name: "Crisp", category: "chat", pattern: /client\.crisp\.chat/i },
  { name: "Zendesk", category: "chat", pattern: /zdassets\.com|zopim/i },
  { name: "Drift", category: "chat", pattern: /js\.driftt\.com/i },
  { name: "Tawk.to", category: "chat", pattern: /embed\.tawk\.to/i },
  { name: "HubSpot", category: "email", pattern: /js\.hs-scripts\.com|hs-analytics|hsforms/i },
  { name: "Mailchimp", category: "email", pattern: /list-manage\.com|chimpstatic\.com/i },
  { name: "Klaviyo", category: "email", pattern: /klaviyo/i },
  { name: "ConvertKit", category: "email", pattern: /convertkit|ck\.page/i },
  { name: "Brevo", category: "email", pattern: /sibforms|sendinblue|brevo/i },
  { name: "Next.js", category: "framework", pattern: /\/_next\/static|__NEXT_DATA__|Next\.js/ },
];

export function detectTech(html: string, headers: Record<string, string>): Technology[] {
  const haystack = `${html}\n${Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}`;
  return RULES.filter((rule) => rule.pattern.test(haystack)).map(({ name, category }) => ({ name, category }));
}
```

- [ ] **Step 5: Implementar `site-parse.ts`**

`lib/engine/sources/site-parse.ts`:

```ts
import * as cheerio from "cheerio";
import type { SiteData, SitePage, Technology } from "../types";

export interface ParsedPage {
  page: SitePage;
  links: string[];
  lang: string | null;
  hreflangs: string[];
  socialLinks: Record<string, string>;
  ctas: string[];
  jsonLdTypes: string[];
  prices: string[];
  hasAppLinks: boolean;
  mentionsTestimonials: boolean;
  mentionsFreeOrTrial: boolean;
  textLength: number;
}

const SOCIAL_HOSTS: Record<string, string> = {
  "twitter.com": "x",
  "x.com": "x",
  "linkedin.com": "linkedin",
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "youtube.com": "youtube",
  "tiktok.com": "tiktok",
  "github.com": "github",
};

const CTA_RE =
  /(empieza|empezar|comienza|prueba|probar|regístrate|registrarse|sign up|get started|start|try|comprar|buy|añadir al carrito|add to cart|suscríbete|subscribe|demo|contact sales|habla con ventas|descargar|download|reservar|book)/i;
const PRICE_RE = /[$€£]\s?\d{1,4}(?:[.,]\d{2})?|\d{1,4}(?:[.,]\d{2})?\s?(?:€|EUR|USD|\$)/g;
const TESTIMONIALS_RE =
  /(testimonios|testimonials|reseñas|reviews|opiniones|casos de éxito|case studies|trusted by|confían en)/i;
const FREE_RE = /(gratis|free|prueba gratuita|free trial|plan gratuito)/i;
const PRICING_PATH_RE = /\/(pricing|precios|tarifas|planes|plans)(\/|$)/i;
const BLOG_PATH_RE = /\/(blog|noticias|news|articulos|recursos)(\/|$)/i;

const KEY_PAGE_KINDS: [string, RegExp][] = [
  ["precios", PRICING_PATH_RE],
  ["blog", /^\/(blog|noticias|news|articulos|recursos)\/?$/i],
  ["about", /\/(about|about-us|nosotros|sobre-nosotros|quienes-somos|empresa|company)(\/|$)/i],
  ["producto", /\/(product|producto|productos|features|funcionalidades)(\/|$)/i],
];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

function collectTypes(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTypes(n, out));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (typeof type === "string" && !out.includes(type)) out.push(type);
    if (Array.isArray(obj["@graph"])) collectTypes(obj["@graph"], out);
  }
}

export function parsePage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);

  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectTypes(JSON.parse($(el).text()), jsonLdTypes);
    } catch {
      // JSON-LD mal formado: se ignora
    }
  });

  $("script, style, noscript, svg").remove();

  const title = clean($("title").first().text());
  const description = clean(
    $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "",
  );
  const headings = $("h1, h2, h3")
    .map((_, el) => clean($(el).text()))
    .get()
    .filter(Boolean)
    .slice(0, 30);
  const text = clean($("body").text());

  const links: string[] = [];
  const socialLinks: Record<string, string> = {};
  let hasAppLinks = false;
  $("a[href]").each((_, el) => {
    let abs: URL;
    try {
      abs = new URL($(el).attr("href") ?? "", pageUrl);
    } catch {
      return;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
    const host = bareHost(abs.hostname);
    const network = SOCIAL_HOSTS[host];
    if (network && !socialLinks[network]) socialLinks[network] = abs.toString();
    if (host === "apps.apple.com" || host === "play.google.com") hasAppLinks = true;
    abs.hash = "";
    const href = abs.toString();
    if (!links.includes(href)) links.push(href);
  });

  const ctas = Array.from(
    new Set(
      $("a, button")
        .map((_, el) => clean($(el).text()))
        .get()
        .filter((t) => t.length > 0 && t.length <= 40 && CTA_RE.test(t)),
    ),
  );

  const lang = $("html").attr("lang")?.toLowerCase().split("-")[0] || null;
  const hreflangs = Array.from(
    new Set(
      $('link[rel="alternate"][hreflang]')
        .map((_, el) => ($(el).attr("hreflang") ?? "").toLowerCase().split("-")[0])
        .get()
        .filter((h) => h && h !== "x"),
    ),
  );

  return {
    page: { url: pageUrl, title, description, headings, text: text.slice(0, 8000) },
    links,
    lang,
    hreflangs,
    socialLinks,
    ctas,
    jsonLdTypes,
    prices: Array.from(new Set(text.match(PRICE_RE) ?? [])).slice(0, 20),
    hasAppLinks,
    mentionsTestimonials: TESTIMONIALS_RE.test(text),
    mentionsFreeOrTrial: FREE_RE.test(text),
    textLength: text.length,
  };
}

export function pickKeyPages(links: string[], homeUrl: string, max = 5): string[] {
  const homeHost = bareHost(new URL(homeUrl).hostname);
  const picked: string[] = [];
  const usedKinds = new Set<string>();
  for (const link of links) {
    if (picked.length >= max) break;
    const url = new URL(link);
    if (bareHost(url.hostname) !== homeHost || url.pathname === "/") continue;
    const kind = KEY_PAGE_KINDS.find(([, re]) => re.test(url.pathname))?.[0];
    if (!kind || usedKinds.has(kind)) continue;
    usedKinds.add(kind);
    picked.push(link);
  }
  return picked;
}

export function buildSiteData(finalUrl: string, pages: ParsedPage[], technologies: Technology[]): SiteData {
  const allLinks = pages.flatMap((p) => p.links);
  const pathOf = (u: string) => new URL(u).pathname;
  const socialLinks: Record<string, string> = {};
  for (const p of pages) {
    for (const [network, url] of Object.entries(p.socialLinks)) socialLinks[network] ??= url;
  }

  return {
    finalUrl,
    pages: pages.map((p) => p.page),
    languages: Array.from(
      new Set(pages.flatMap((p) => [p.lang, ...p.hreflangs]).filter((l): l is string => Boolean(l))),
    ),
    socialLinks,
    ctas: Array.from(new Set(pages.flatMap((p) => p.ctas))).slice(0, 20),
    hasPricingPage: [...pages.map((p) => p.page.url), ...allLinks].some((u) => PRICING_PATH_RE.test(pathOf(u))),
    pricesFound: Array.from(new Set(pages.flatMap((p) => p.prices))).slice(0, 20),
    hasBlog: [...pages.map((p) => p.page.url), ...allLinks].some((u) => BLOG_PATH_RE.test(pathOf(u))),
    hasTestimonials: pages.some((p) => p.mentionsTestimonials),
    hasFreePlanOrTrial: pages.some((p) => p.mentionsFreeOrTrial),
    hasAppLinks: pages.some((p) => p.hasAppLinks),
    jsonLdTypes: Array.from(new Set(pages.flatMap((p) => p.jsonLdTypes))),
    textLength: pages.reduce((sum, p) => sum + p.textLength, 0),
    technologies,
  };
}
```

- [ ] **Step 6: Ejecutar y comprobar que pasan**

Run: `npm test -- site-parse tech`
Expected: PASS. Si falla el orden de `pickKeyPages`, revisa que el blog solo cuenta como página clave en `/blog` o `/blog/` (no en posts individuales).

- [ ] **Step 7: Commit**

```bash
git add lib/engine/sources tests/fixtures tests/engine/site-parse.test.ts tests/engine/tech.test.ts
git commit -m "Add HTML parsing and technology detection for analyzed sites"
```

---

### Task 4: Descarga de la web analizada

**Files:**
- Create: `lib/engine/sources/site.ts`, `tests/engine/site.test.ts`

**Interfaces:**
- Consumes: `PageGetter`, `FetchedPage` (safe-fetch.ts); `parsePage`, `pickKeyPages`, `buildSiteData` (site-parse.ts); `detectTech` (tech.ts).
- Produces: `fetchSite(url: string, get: PageGetter): Promise<SiteData>`; `class SiteUnavailableError extends Error`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/site.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fetchSite, SiteUnavailableError } from "../../lib/engine/sources/site";
import type { FetchedPage, PageGetter } from "../../lib/engine/safe-fetch";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const page = (url: string, text: string, status = 200): FetchedPage => ({ url, status, headers: {}, text });

function fakeGetter(pages: Record<string, FetchedPage>): PageGetter & { calls: string[] } {
  const calls: string[] = [];
  const get = async (url: string) => {
    calls.push(url);
    const found = pages[url];
    if (!found) return page(url, "", 404);
    return found;
  };
  return Object.assign(get, { calls });
}

describe("fetchSite", () => {
  it("descarga la home y las páginas clave y combina la información", async () => {
    const get = fakeGetter({
      "https://facturo.example/": page("https://facturo.example/", fixture("saas-home.html")),
      "https://facturo.example/precios": page("https://facturo.example/precios", fixture("saas-pricing.html")),
    });
    const site = await fetchSite("https://facturo.example/", get);

    expect(get.calls).toEqual([
      "https://facturo.example/",
      "https://facturo.example/precios",
      "https://facturo.example/blog/",
      "https://facturo.example/sobre-nosotros",
    ]);
    expect(site.pages).toHaveLength(2); // las 404 se ignoran
    expect(site.pricesFound).toEqual(["9 €", "29 €"]);
    expect(site.technologies.map((t) => t.name)).toContain("Stripe");
  });

  it("usa la URL final tras redirecciones", async () => {
    const get = fakeGetter({
      "https://facturo.example/": page("https://www.facturo.example/", fixture("shop-home.html")),
    });
    expect((await fetchSite("https://facturo.example/", get)).finalUrl).toBe("https://www.facturo.example/");
  });

  it("lanza SiteUnavailableError si la home responde con error", async () => {
    const get = fakeGetter({ "https://facturo.example/": page("https://facturo.example/", "", 503) });
    await expect(fetchSite("https://facturo.example/", get)).rejects.toBeInstanceOf(SiteUnavailableError);
  });

  it("sigue adelante si una página clave lanza un error", async () => {
    const get: PageGetter = async (url) => {
      if (url === "https://facturo.example/") return page(url, fixture("saas-home.html"));
      throw new Error("timeout");
    };
    const site = await fetchSite("https://facturo.example/", get);
    expect(site.pages).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- site.test`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementar**

`lib/engine/sources/site.ts`:

```ts
import type { PageGetter } from "../safe-fetch";
import type { SiteData } from "../types";
import { buildSiteData, parsePage, pickKeyPages, type ParsedPage } from "./site-parse";
import { detectTech } from "./tech";

export class SiteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteUnavailableError";
  }
}

export async function fetchSite(url: string, get: PageGetter): Promise<SiteData> {
  const home = await get(url);
  if (home.status >= 400) {
    throw new SiteUnavailableError(`La web respondió con el código ${home.status}.`);
  }

  const homeParsed = parsePage(home.text, home.url);
  const technologies = detectTech(home.text, home.headers);

  const extras = await Promise.allSettled(pickKeyPages(homeParsed.links, home.url).map((u) => get(u)));
  const parsed: ParsedPage[] = [homeParsed];
  for (const result of extras) {
    if (result.status === "fulfilled" && result.value.status < 400) {
      parsed.push(parsePage(result.value.text, result.value.url));
    }
  }

  return buildSiteData(home.url, parsed, technologies);
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- site.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/site.ts tests/engine/site.test.ts
git commit -m "Add site fetching with key page discovery"
```

---

### Task 5: Fuentes de tráfico (Tranco y Cloudflare Radar)

**Files:**
- Create: `lib/engine/sources/tranco.ts`, `lib/engine/sources/radar.ts`, `tests/engine/traffic-sources.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `TrancoData`, `RadarData`, `Trend`.
- Produces: `parseTranco(json: unknown): TrancoData`; `fetchTranco(domain: string, fetcher: Fetcher): Promise<TrancoData>`; `parseRadar(json: unknown): RadarData`; `fetchRadar(domain: string, fetcher: Fetcher, token: string): Promise<RadarData>`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/traffic-sources.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTranco, fetchTranco } from "../../lib/engine/sources/tranco";
import { parseRadar, fetchRadar } from "../../lib/engine/sources/radar";

describe("Tranco", () => {
  it("toma el rango más reciente y calcula la tendencia", () => {
    const json = {
      domain: "facturo.example",
      ranks: [
        { date: "2026-10-01", rank: 60000 },
        { date: "2026-09-01", rank: 50000 },
      ],
    };
    expect(parseTranco(json)).toEqual({ rank: 60000, trend: "baja" });
  });

  it("detecta subida y estabilidad", () => {
    expect(parseTranco({ ranks: [{ date: "2026-09-01", rank: 1000 }, { date: "2026-10-01", rank: 800 }] }).trend).toBe("sube");
    expect(parseTranco({ ranks: [{ date: "2026-09-01", rank: 1000 }, { date: "2026-10-01", rank: 1050 }] }).trend).toBe("estable");
  });

  it("devuelve rank null si el dominio no está en la lista", () => {
    expect(parseTranco({ domain: "x.example", ranks: [] })).toEqual({ rank: null, trend: null });
  });

  it("llama a la API pública de Tranco", async () => {
    let called = "";
    const data = await fetchTranco("facturo.example", async (url) => {
      called = url;
      return Response.json({ ranks: [{ date: "2026-10-01", rank: 42 }] });
    });
    expect(called).toBe("https://tranco-list.eu/api/ranks/domain/facturo.example");
    expect(data.rank).toBe(42);
  });

  it("lanza error si la API falla", async () => {
    await expect(fetchTranco("x.example", async () => new Response("", { status: 500 }))).rejects.toThrow();
  });
});

describe("Cloudflare Radar", () => {
  it("lee la franja de popularidad", () => {
    expect(parseRadar({ success: true, result: { details_0: { bucket: "100000", categories: [] } } })).toEqual({ bucket: 100000 });
  });

  it("devuelve null si no hay franja numérica", () => {
    expect(parseRadar({ result: { details_0: { bucket: ">200000" } } })).toEqual({ bucket: null });
    expect(parseRadar({})).toEqual({ bucket: null });
  });

  it("envía el token y trata 404 como sin ranking", async () => {
    let auth = "";
    const data = await fetchRadar("x.example", async (_url, init) => {
      auth = new Headers(init?.headers).get("authorization") ?? "";
      return new Response("", { status: 404 });
    }, "tok");
    expect(auth).toBe("Bearer tok");
    expect(data).toEqual({ bucket: null });
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- traffic-sources`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementar**

`lib/engine/sources/tranco.ts`:

```ts
import type { Fetcher, TrancoData, Trend } from "../types";

interface TrancoRank {
  date: string;
  rank: number;
}

export function parseTranco(json: unknown): TrancoData {
  const ranks = ((json as { ranks?: TrancoRank[] })?.ranks ?? []).filter((r) => typeof r.rank === "number");
  if (ranks.length === 0) return { rank: null, trend: null };

  const sorted = [...ranks].sort((a, b) => a.date.localeCompare(b.date));
  const oldest = sorted[0].rank;
  const newest = sorted[sorted.length - 1].rank;

  // En un ranking, un número menor es mejor.
  let trend: Trend = "estable";
  if (newest < oldest * 0.9) trend = "sube";
  else if (newest > oldest * 1.1) trend = "baja";

  return { rank: newest, trend };
}

export async function fetchTranco(domain: string, fetcher: Fetcher): Promise<TrancoData> {
  const res = await fetcher(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Tranco respondió ${res.status}`);
  return parseTranco(await res.json());
}
```

`lib/engine/sources/radar.ts`:

```ts
import type { Fetcher, RadarData } from "../types";

export function parseRadar(json: unknown): RadarData {
  const details = (json as { result?: { details_0?: { bucket?: unknown } } })?.result?.details_0;
  const bucket = Number(details?.bucket);
  return { bucket: details && Number.isFinite(bucket) ? bucket : null };
}

export async function fetchRadar(domain: string, fetcher: Fetcher, token: string): Promise<RadarData> {
  const res = await fetcher(
    `https://api.cloudflare.com/client/v4/radar/ranking/domain/${encodeURIComponent(domain)}?format=json`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (res.status === 404) return { bucket: null };
  if (!res.ok) throw new Error(`Cloudflare Radar respondió ${res.status}`);
  return parseRadar(await res.json());
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- traffic-sources`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/tranco.ts lib/engine/sources/radar.ts tests/engine/traffic-sources.test.ts
git commit -m "Add Tranco and Cloudflare Radar traffic sources"
```

---

### Task 6: PageSpeed, RDAP y Wayback Machine

**Files:**
- Create: `lib/engine/sources/pagespeed.ts`, `lib/engine/sources/rdap.ts`, `lib/engine/sources/wayback.ts`, `tests/engine/other-sources.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `PageSpeedData`, `RdapData`, `WaybackData`.
- Produces: `parsePageSpeedScore(json: unknown): number | null`; `fetchPageSpeed(url: string, fetcher: Fetcher, apiKey?: string): Promise<PageSpeedData>`; `parseRdap(json: unknown): RdapData`; `fetchRdap(domain: string, fetcher: Fetcher): Promise<RdapData>`; `parseWayback(firstRows: unknown, changeRows: unknown): WaybackData`; `fetchWayback(domain: string, fetcher: Fetcher, now: Date): Promise<WaybackData>`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/other-sources.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePageSpeedScore, fetchPageSpeed } from "../../lib/engine/sources/pagespeed";
import { parseRdap, fetchRdap } from "../../lib/engine/sources/rdap";
import { parseWayback, fetchWayback } from "../../lib/engine/sources/wayback";

describe("PageSpeed", () => {
  it("convierte la puntuación a 0-100", () => {
    expect(parsePageSpeedScore({ lighthouseResult: { categories: { performance: { score: 0.34 } } } })).toBe(34);
    expect(parsePageSpeedScore({})).toBeNull();
  });

  it("pide móvil y escritorio y tolera que falle uno", async () => {
    const urls: string[] = [];
    const data = await fetchPageSpeed("https://x.example/", async (url) => {
      urls.push(url);
      if (url.includes("strategy=desktop")) return new Response("", { status: 500 });
      return Response.json({ lighthouseResult: { categories: { performance: { score: 0.5 } } } });
    }, "KEY");
    expect(data).toEqual({ mobile: 50, desktop: null });
    expect(urls.every((u) => u.includes("key=KEY"))).toBe(true);
  });

  it("lanza error si fallan ambos", async () => {
    await expect(fetchPageSpeed("https://x.example/", async () => new Response("", { status: 500 }))).rejects.toThrow();
  });
});

describe("RDAP", () => {
  it("extrae la fecha de registro", () => {
    const json = { events: [{ eventAction: "last changed", eventDate: "2024-01-01T00:00:00Z" }, { eventAction: "registration", eventDate: "2015-03-02T10:00:00Z" }] };
    expect(parseRdap(json)).toEqual({ registeredAt: "2015-03-02" });
    expect(parseRdap({})).toEqual({ registeredAt: null });
  });

  it("trata 404 como desconocido", async () => {
    expect(await fetchRdap("x.example", async () => new Response("", { status: 404 }))).toEqual({ registeredAt: null });
  });
});

describe("Wayback Machine", () => {
  it("calcula primera captura, último cambio y número de cambios", () => {
    const first = [["timestamp"], ["20150401000000"]];
    const changes = [["timestamp", "digest"], ["20251101000000", "A"], ["20260301000000", "B"], ["20260801000000", "C"]];
    expect(parseWayback(first, changes)).toEqual({ firstCapture: "2015-04-01", lastChange: "2026-08-01", changesLastYear: 2 });
  });

  it("maneja respuestas vacías", () => {
    expect(parseWayback([], [])).toEqual({ firstCapture: null, lastChange: null, changesLastYear: 0 });
  });

  it("consulta desde hace un año y tolera cuerpos vacíos", async () => {
    const urls: string[] = [];
    const data = await fetchWayback("x.example", async (url) => {
      urls.push(url);
      return new Response(url.includes("limit=1&") || url.endsWith("limit=1") ? '[["timestamp"],["20200101000000"]]' : "");
    }, new Date("2026-10-14T00:00:00Z"));
    expect(urls[1]).toContain("from=20251014");
    expect(data).toEqual({ firstCapture: "2020-01-01", lastChange: null, changesLastYear: 0 });
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- other-sources`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementar**

`lib/engine/sources/pagespeed.ts`:

```ts
import type { Fetcher, PageSpeedData } from "../types";

export function parsePageSpeedScore(json: unknown): number | null {
  const score = (json as { lighthouseResult?: { categories?: { performance?: { score?: unknown } } } })
    ?.lighthouseResult?.categories?.performance?.score;
  return typeof score === "number" ? Math.round(score * 100) : null;
}

export async function fetchPageSpeed(url: string, fetcher: Fetcher, apiKey?: string): Promise<PageSpeedData> {
  const run = async (strategy: "mobile" | "desktop") => {
    const params = new URLSearchParams({ url, strategy, category: "performance" });
    if (apiKey) params.set("key", apiKey);
    const res = await fetcher(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`PageSpeed respondió ${res.status}`);
    return parsePageSpeedScore(await res.json());
  };

  const [mobile, desktop] = await Promise.allSettled([run("mobile"), run("desktop")]);
  const result: PageSpeedData = {
    mobile: mobile.status === "fulfilled" ? mobile.value : null,
    desktop: desktop.status === "fulfilled" ? desktop.value : null,
  };
  if (result.mobile === null && result.desktop === null) throw new Error("PageSpeed no disponible");
  return result;
}
```

`lib/engine/sources/rdap.ts`:

```ts
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
```

`lib/engine/sources/wayback.ts`:

```ts
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
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- other-sources`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/sources/pagespeed.ts lib/engine/sources/rdap.ts lib/engine/sources/wayback.ts tests/engine/other-sources.test.ts
git commit -m "Add PageSpeed, RDAP and Wayback Machine sources"
```

---

### Task 7: Fase 1 — Recogida de datos

**Files:**
- Create: `lib/engine/collect.ts`, `tests/engine/fake-network.ts`, `tests/engine/collect.test.ts`

**Interfaces:**
- Consumes: `NormalizedUrl` (url.ts), `PageGetter`, `BlockedUrlError` (safe-fetch.ts), `fetchSite`, `fetchTranco`, `fetchRadar`, `fetchPageSpeed`, `fetchRdap`, `fetchWayback`, `RawData`, `SourceId`, `Fetcher`.
- Produces: `interface CollectDeps { getPage: PageGetter; fetcher: Fetcher; radarToken?: string; pagespeedKey?: string; now: () => Date }`; `type StepReporter = (step: string) => void | Promise<void>`; `collect(input: NormalizedUrl, deps: CollectDeps, onStep?: StepReporter): Promise<RawData>`; `class InsufficientDataError extends Error`; pasos: `"Leyendo la web…"`, `"Analizando tráfico y presencia…"`.
- Produces (tests): `fakeFetcher(overrides?)`, `fakeGetPage`, `NOW` en `tests/engine/fake-network.ts`.

- [ ] **Step 1: Crear la red falsa reutilizable para pruebas**

`tests/engine/fake-network.ts`:

```ts
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
    ...overrides,
  };
  return async (url) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`URL no simulada: ${url}`);
    return routes[key](url);
  };
}
```

- [ ] **Step 2: Escribir la prueba que falla**

`tests/engine/collect.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collect, InsufficientDataError } from "../../lib/engine/collect";
import { BlockedUrlError } from "../../lib/engine/safe-fetch";
import { fakeFetcher, fakeGetPage, NOW } from "./fake-network";

const input = { url: "https://facturo.example/", domain: "facturo.example" };
const baseDeps = { getPage: fakeGetPage, fetcher: fakeFetcher(), radarToken: "tok", now: () => NOW };

describe("collect", () => {
  it("reúne todas las fuentes", async () => {
    const raw = await collect(input, baseDeps);
    expect(raw.domain).toBe("facturo.example");
    expect(raw.collectedAt).toBe(NOW.toISOString());
    expect(raw.site?.pricesFound).toEqual(["9 €", "29 €"]);
    expect(raw.tranco).toEqual({ rank: 60000, trend: "baja" });
    expect(raw.radar).toEqual({ bucket: 100000 });
    expect(raw.pagespeed).toEqual({ mobile: 34, desktop: 34 });
    expect(raw.rdap).toEqual({ registeredAt: "2015-03-02" });
    expect(raw.wayback).toEqual({ firstCapture: "2015-04-01", lastChange: "2025-11-01", changesLastYear: 0 });
    expect(raw.unavailable).toEqual([]);
  });

  it("marca Radar como no disponible si no hay token", async () => {
    const raw = await collect(input, { ...baseDeps, radarToken: undefined });
    expect(raw.radar).toBeNull();
    expect(raw.unavailable).toEqual(["radar"]);
  });

  it("continúa si falla una fuente", async () => {
    const fetcher = fakeFetcher({ "tranco-list.eu": () => new Response("", { status: 500 }) });
    const raw = await collect(input, { ...baseDeps, fetcher });
    expect(raw.tranco).toBeNull();
    expect(raw.unavailable).toContain("tranco");
    expect(raw.site).not.toBeNull();
  });

  it("marca web y tecnologías como no disponibles si la web no responde", async () => {
    const raw = await collect(input, { ...baseDeps, getPage: async (url) => ({ url, status: 503, headers: {}, text: "" }) });
    expect(raw.site).toBeNull();
    expect(raw.unavailable).toEqual(expect.arrayContaining(["web", "tecnologias"]));
  });

  it("lanza InsufficientDataError si no hay web ni tráfico", async () => {
    const fetcher = fakeFetcher({
      "tranco-list.eu": () => Response.json({ ranks: [] }),
      "api.cloudflare.com": () => new Response("", { status: 404 }),
    });
    const getPage = async () => {
      throw new Error("bloqueado por antibots");
    };
    await expect(collect(input, { ...baseDeps, fetcher, getPage })).rejects.toBeInstanceOf(InsufficientDataError);
  });

  it("propaga BlockedUrlError", async () => {
    const getPage = async () => {
      throw new BlockedUrlError("interna");
    };
    await expect(collect(input, { ...baseDeps, getPage })).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("informa de los pasos en orden", async () => {
    const steps: string[] = [];
    await collect(input, baseDeps, (s) => {
      steps.push(s);
    });
    expect(steps).toEqual(["Leyendo la web…", "Analizando tráfico y presencia…"]);
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

Run: `npm test -- collect`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 4: Implementar**

`lib/engine/collect.ts`:

```ts
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
```

- [ ] **Step 5: Ejecutar y comprobar que pasa**

Run: `npm test -- collect`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/collect.ts tests/engine/fake-network.ts tests/engine/collect.test.ts
git commit -m "Add phase 1 data collection across all free sources"
```

---

### Task 8: Fase 2 — Anclas de tráfico y señales

**Files:**
- Create: `lib/engine/anchors.ts`, `lib/engine/signals.ts`, `tests/engine/raw-fixture.ts`, `tests/engine/anchors.test.ts`, `tests/engine/signals.test.ts`

**Interfaces:**
- Consumes: `RawData`, `SiteData`, `Range`, `Confidence`, `Signal`, `SignalFamily`, `SourceId`.
- Produces: `visitsFromRank(rank: number): Range`; `interface Anchors { visitasMes: Range | null; confianzaTrafico: Confidence; antiguedadAnios: number | null }`; `computeAnchors(raw: RawData, now: Date): Anchors`; `extractSignals(raw: RawData, now: Date): Signal[]`.
- Produces (tests): `makeSite(overrides?)`, `makeRaw(overrides?)` en `tests/engine/raw-fixture.ts`.

Ids de señal que produce `extractSignals` (los usan Task 9, 10 y 11): `sin_precios_publicos`, `solo_demo`, `sin_plan_gratuito`, `sin_blog`, `contenido_escaso`, `un_solo_idioma`, `sin_app_movil`, `pocas_redes`, `sin_testimonios`, `sin_analitica`, `sin_chat_soporte`, `sin_captacion_email`, `pagespeed_movil_bajo`, `pagespeed_escritorio_bajo`, `trafico_en_caida`, `fuera_top_1m`, `popularidad_baja`, `web_sin_cambios_12m`, `dominio_reciente`.

- [ ] **Step 1: Crear datos brutos de ejemplo para pruebas**

`tests/engine/raw-fixture.ts`:

```ts
import type { RawData, SiteData } from "../../lib/engine/types";

export function makeSite(overrides: Partial<SiteData> = {}): SiteData {
  return {
    finalUrl: "https://facturo.example/",
    pages: [{ url: "https://facturo.example/", title: "Facturo", description: "", headings: [], text: "x".repeat(3000) }],
    languages: ["es", "en"],
    socialLinks: { x: "https://twitter.com/facturo", linkedin: "https://linkedin.com/company/facturo" },
    ctas: ["Empieza gratis"],
    hasPricingPage: true,
    pricesFound: ["9 €"],
    hasBlog: true,
    hasTestimonials: true,
    hasFreePlanOrTrial: true,
    hasAppLinks: true,
    jsonLdTypes: [],
    textLength: 3000,
    technologies: [
      { name: "Google Analytics", category: "analitica" },
      { name: "Intercom", category: "chat" },
      { name: "Mailchimp", category: "email" },
    ],
    ...overrides,
  };
}

export function makeRaw(overrides: Partial<RawData> = {}): RawData {
  return {
    url: "https://facturo.example/",
    domain: "facturo.example",
    collectedAt: "2026-10-14T00:00:00.000Z",
    site: makeSite(),
    tranco: { rank: 5000, trend: "estable" },
    radar: { bucket: 10000 },
    pagespeed: { mobile: 90, desktop: 95 },
    rdap: { registeredAt: "2015-03-02" },
    wayback: { firstCapture: "2015-04-01", lastChange: "2026-08-01", changesLastYear: 6 },
    unavailable: [],
    ...overrides,
  };
}
```

(`makeRaw()` sin cambios representa un negocio "sano": no debe producir ninguna señal.)

- [ ] **Step 2: Escribir las pruebas que fallan**

`tests/engine/anchors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { visitsFromRank, computeAnchors } from "../../lib/engine/anchors";
import { makeRaw } from "./raw-fixture";
import { NOW } from "./fake-network";

describe("visitsFromRank", () => {
  it.each([
    [50, { min: 500_000_000, max: 5_000_000_000 }],
    [800, { min: 50_000_000, max: 500_000_000 }],
    [5000, { min: 5_000_000, max: 50_000_000 }],
    [60000, { min: 500_000, max: 5_000_000 }],
    [900000, { min: 50_000, max: 500_000 }],
    [2_000_000, { min: 0, max: 50_000 }],
  ])("rank %i → %o", (rank, range) => {
    expect(visitsFromRank(rank)).toEqual(range);
  });
});

describe("computeAnchors", () => {
  it("usa Tranco y da confianza media si Radar también tiene dato", () => {
    expect(computeAnchors(makeRaw(), NOW)).toEqual({
      visitasMes: { min: 5_000_000, max: 50_000_000 },
      confianzaTrafico: "media",
      antiguedadAnios: 11,
    });
  });

  it("usa Radar si Tranco no tiene rango, con confianza baja", () => {
    const a = computeAnchors(makeRaw({ tranco: null, radar: { bucket: 100000 } }), NOW);
    expect(a.visitasMes).toEqual({ min: 500_000, max: 5_000_000 });
    expect(a.confianzaTrafico).toBe("baja");
  });

  it("interpreta 'fuera de Tranco' como menos de 50.000 visitas", () => {
    const a = computeAnchors(makeRaw({ tranco: { rank: null, trend: null }, radar: null }), NOW);
    expect(a.visitasMes).toEqual({ min: 0, max: 50_000 });
  });

  it("no estima tráfico sin fuentes y usa Wayback si no hay RDAP", () => {
    const a = computeAnchors(makeRaw({ tranco: null, radar: null, rdap: null }), NOW);
    expect(a.visitasMes).toBeNull();
    expect(a.antiguedadAnios).toBe(11);
  });
});
```

`tests/engine/signals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractSignals } from "../../lib/engine/signals";
import { makeRaw, makeSite } from "./raw-fixture";
import { NOW } from "./fake-network";

const ids = (raw: Parameters<typeof extractSignals>[0]) => extractSignals(raw, NOW).map((s) => s.id);

describe("extractSignals", () => {
  it("no produce señales para un negocio sin huecos", () => {
    expect(ids(makeRaw())).toEqual([]);
  });

  it("detecta huecos de producto, contenido, alcance y confianza en la web", () => {
    const site = makeSite({
      pricesFound: [],
      ctas: ["Pide una demo"],
      hasFreePlanOrTrial: false,
      hasBlog: false,
      textLength: 800,
      languages: ["es"],
      hasAppLinks: false,
      socialLinks: {},
      hasTestimonials: false,
      technologies: [],
    });
    expect(ids(makeRaw({ site }))).toEqual([
      "sin_precios_publicos",
      "solo_demo",
      "sin_plan_gratuito",
      "sin_blog",
      "contenido_escaso",
      "un_solo_idioma",
      "sin_app_movil",
      "pocas_redes",
      "sin_testimonios",
      "sin_analitica",
      "sin_chat_soporte",
      "sin_captacion_email",
    ]);
  });

  it("asigna familia y fuente a cada señal", () => {
    const signals = extractSignals(makeRaw({ site: makeSite({ technologies: [{ name: "Intercom", category: "chat" }, { name: "Mailchimp", category: "email" }] }) }), NOW);
    expect(signals).toEqual([
      { id: "sin_analitica", family: "tecnica", source: "tecnologias", label: "No se detecta ninguna herramienta de analítica" },
    ]);
  });

  it("detecta señales de rendimiento, tracción y antigüedad", () => {
    const raw = makeRaw({
      pagespeed: { mobile: 34, desktop: 45 },
      tranco: { rank: null, trend: null },
      radar: { bucket: null },
      wayback: { firstCapture: "2025-01-01", lastChange: "2025-06-01", changesLastYear: 0 },
      rdap: { registeredAt: "2025-01-01" },
    });
    expect(ids(raw)).toEqual([
      "pagespeed_movil_bajo",
      "pagespeed_escritorio_bajo",
      "fuera_top_1m",
      "popularidad_baja",
      "web_sin_cambios_12m",
      "dominio_reciente",
    ]);
  });

  it("detecta tráfico en caída", () => {
    expect(ids(makeRaw({ tranco: { rank: 60000, trend: "baja" } }))).toEqual(["trafico_en_caida"]);
  });

  it("no inventa señales de fuentes no disponibles", () => {
    expect(ids(makeRaw({ site: null, pagespeed: null, tranco: null, radar: null, wayback: null, rdap: null }))).toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que fallan**

Run: `npm test -- anchors signals`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 4: Implementar `anchors.ts`**

`lib/engine/anchors.ts`:

```ts
import type { Confidence, Range, RawData } from "./types";

// Tabla orientativa ranking → visitas/mes. Documentada en docs/decisiones/0003-anclas-de-trafico.md.
const RANK_TABLE: [maxRank: number, min: number, max: number][] = [
  [100, 500_000_000, 5_000_000_000],
  [1_000, 50_000_000, 500_000_000],
  [10_000, 5_000_000, 50_000_000],
  [100_000, 500_000, 5_000_000],
  [1_000_000, 50_000, 500_000],
];

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function visitsFromRank(rank: number): Range {
  for (const [maxRank, min, max] of RANK_TABLE) {
    if (rank <= maxRank) return { min, max };
  }
  return { min: 0, max: 50_000 };
}

export interface Anchors {
  visitasMes: Range | null;
  confianzaTrafico: Confidence;
  antiguedadAnios: number | null;
}

export function computeAnchors(raw: RawData, now: Date): Anchors {
  const trancoRank = raw.tranco?.rank ?? null;
  const radarBucket = raw.radar?.bucket ?? null;
  const rank = trancoRank ?? radarBucket;

  let visitasMes: Range | null = null;
  if (rank !== null) visitasMes = visitsFromRank(rank);
  else if (raw.tranco || raw.radar) visitasMes = { min: 0, max: 50_000 }; // consultado, pero fuera de los rankings

  const born = raw.rdap?.registeredAt ?? raw.wayback?.firstCapture ?? null;

  return {
    visitasMes,
    confianzaTrafico: trancoRank !== null && radarBucket !== null ? "media" : "baja",
    antiguedadAnios: born ? Math.floor((now.getTime() - Date.parse(born)) / YEAR_MS) : null,
  };
}
```

- [ ] **Step 5: Implementar `signals.ts`**

`lib/engine/signals.ts`:

```ts
import type { RawData, Signal, SignalFamily, SourceId } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function extractSignals(raw: RawData, now: Date): Signal[] {
  const signals: Signal[] = [];
  const add = (id: string, family: SignalFamily, source: SourceId, label: string) =>
    signals.push({ id, family, source, label });

  const site = raw.site;
  if (site) {
    const noPrices = site.pricesFound.length === 0;
    if (noPrices) add("sin_precios_publicos", "producto", "web", "No muestra precios públicos");
    if (noPrices && site.ctas.some((c) => /demo|ventas|sales/i.test(c))) {
      add("solo_demo", "producto", "web", "La conversión pasa por pedir una demo o hablar con ventas");
    }
    if (!site.hasFreePlanOrTrial) add("sin_plan_gratuito", "producto", "web", "No ofrece plan gratuito ni prueba");
    if (!site.hasBlog) add("sin_blog", "contenido", "web", "No tiene blog ni sección de contenidos");
    if (site.textLength < 1500) add("contenido_escaso", "contenido", "web", "Muy poco texto indexable en la web");
    if (site.languages.length <= 1) {
      const lang = site.languages[0] ? ` (${site.languages[0]})` : "";
      add("un_solo_idioma", "alcance", "web", `Web en un solo idioma${lang}`);
    }
    if (!site.hasAppLinks) add("sin_app_movil", "alcance", "web", "No enlaza a ninguna app en App Store ni Google Play");
    const networks = Object.keys(site.socialLinks).length;
    if (networks < 2) add("pocas_redes", "alcance", "web", `Solo ${networks} red(es) social(es) enlazada(s)`);
    if (!site.hasTestimonials) {
      add("sin_testimonios", "confianza", "web", "Sin testimonios, reseñas ni casos de éxito visibles");
    }

    const categories = new Set(site.technologies.map((t) => t.category));
    if (!categories.has("analitica")) {
      add("sin_analitica", "tecnica", "tecnologias", "No se detecta ninguna herramienta de analítica");
    }
    if (!categories.has("chat")) add("sin_chat_soporte", "tecnica", "tecnologias", "No se detecta chat ni soporte en vivo");
    if (!categories.has("email")) {
      add("sin_captacion_email", "tecnica", "tecnologias", "No se detecta herramienta de email marketing");
    }
  }

  const mobile = raw.pagespeed?.mobile ?? null;
  if (mobile !== null && mobile < 50) add("pagespeed_movil_bajo", "tecnica", "pagespeed", `Rendimiento móvil bajo: ${mobile}/100`);
  const desktop = raw.pagespeed?.desktop ?? null;
  if (desktop !== null && desktop < 50) {
    add("pagespeed_escritorio_bajo", "tecnica", "pagespeed", `Rendimiento en escritorio bajo: ${desktop}/100`);
  }

  if (raw.tranco?.trend === "baja") add("trafico_en_caida", "traccion", "tranco", "Su posición en el ranking de tráfico está bajando");
  if (raw.tranco && raw.tranco.rank === null) {
    add("fuera_top_1m", "traccion", "tranco", "Fuera del top 1 millón de webs más visitadas");
  }
  if (raw.radar && (raw.radar.bucket === null || raw.radar.bucket > 200_000)) {
    add("popularidad_baja", "traccion", "radar", "Popularidad baja según Cloudflare Radar");
  }

  if (raw.wayback && raw.wayback.lastChange !== null && raw.wayback.changesLastYear === 0) {
    add("web_sin_cambios_12m", "contenido", "wayback", "La web no ha cambiado en el último año");
  }

  const registeredAt = raw.rdap?.registeredAt;
  if (registeredAt && now.getTime() - Date.parse(registeredAt) < 2 * 365 * DAY_MS) {
    add("dominio_reciente", "traccion", "rdap", "Dominio registrado hace menos de 2 años");
  }

  return signals;
}
```

- [ ] **Step 6: Ejecutar y comprobar que pasan**

Run: `npm test -- anchors signals`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/engine/anchors.ts lib/engine/signals.ts tests/engine/raw-fixture.ts tests/engine/anchors.test.ts tests/engine/signals.test.ts
git commit -m "Add phase 2 traffic anchors and objective signal extraction"
```

---

### Task 9: Validación de oportunidades (regla 2+2) y confianza

**Files:**
- Create: `lib/engine/opportunities.ts`, `tests/engine/opportunities.test.ts`

**Interfaces:**
- Consumes: `Signal`, `Confidence`.
- Produces: `interface ProposedOpportunity { titulo: string; paraQuien: "competir" | "mejorar"; senales: string[] }`; `interface Opportunity { titulo: string; paraQuien: "competir" | "mejorar"; evidencias: Signal[]; confianza: Confidence }`; `confidenceFor(evidence: Signal[]): Confidence`; `validateOpportunities(proposed: ProposedOpportunity[], signals: Signal[]): { oportunidades: Opportunity[]; pistas: Opportunity[] }`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/opportunities.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { confidenceFor, validateOpportunities } from "../../lib/engine/opportunities";
import type { Signal, SourceId } from "../../lib/engine/types";

const sig = (id: string, source: SourceId): Signal => ({ id, family: "producto", source, label: id });

const SIGNALS: Signal[] = [
  sig("a_web", "web"),
  sig("b_web", "web"),
  sig("c_tranco", "tranco"),
  sig("d_wayback", "wayback"),
  sig("e_pagespeed", "pagespeed"),
  sig("mercado_x", "mercado"),
];

describe("confidenceFor", () => {
  it("baja con 2 señales de 2 fuentes", () => {
    expect(confidenceFor([sig("1", "web"), sig("2", "tranco")])).toBe("baja");
  });
  it("media con 3 señales", () => {
    expect(confidenceFor([sig("1", "web"), sig("2", "web"), sig("3", "tranco")])).toBe("media");
  });
  it("media con 4 señales de solo 2 fuentes", () => {
    expect(confidenceFor([sig("1", "web"), sig("2", "web"), sig("3", "web"), sig("4", "tranco")])).toBe("media");
  });
  it("alta con 4 señales de 3 fuentes", () => {
    expect(confidenceFor([sig("1", "web"), sig("2", "web"), sig("3", "tranco"), sig("4", "wayback")])).toBe("alta");
  });
});

describe("validateOpportunities", () => {
  it("acepta solo oportunidades con ≥2 señales de ≥2 fuentes y ordena por confianza", () => {
    const result = validateOpportunities(
      [
        { titulo: "Dos de la misma fuente", paraQuien: "competir", senales: ["a_web", "b_web"] },
        { titulo: "Baja", paraQuien: "mejorar", senales: ["a_web", "c_tranco"] },
        { titulo: "Alta", paraQuien: "competir", senales: ["a_web", "b_web", "c_tranco", "mercado_x"] },
        { titulo: "Inventada", paraQuien: "competir", senales: ["no_existe", "tampoco"] },
        { titulo: "Una sola", paraQuien: "mejorar", senales: ["e_pagespeed", "no_existe"] },
      ],
      SIGNALS,
    );

    expect(result.oportunidades.map((o) => [o.titulo, o.confianza])).toEqual([
      ["Alta", "alta"],
      ["Baja", "baja"],
    ]);
    expect(result.oportunidades[0].evidencias.map((e) => e.id)).toEqual(["a_web", "b_web", "c_tranco", "mercado_x"]);
    expect(result.pistas.map((p) => p.titulo)).toEqual(["Dos de la misma fuente", "Una sola"]);
  });

  it("ignora ids repetidos", () => {
    const result = validateOpportunities(
      [{ titulo: "Repetida", paraQuien: "competir", senales: ["a_web", "a_web", "a_web"] }],
      SIGNALS,
    );
    expect(result.oportunidades).toEqual([]);
    expect(result.pistas[0].evidencias).toHaveLength(1);
  });

  it("devuelve como máximo 5 oportunidades", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      titulo: `O${i}`,
      paraQuien: "competir" as const,
      senales: ["a_web", "c_tranco"],
    }));
    expect(validateOpportunities(many, SIGNALS).oportunidades).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- opportunities`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementar**

`lib/engine/opportunities.ts`:

```ts
import type { Confidence, Signal } from "./types";

export interface ProposedOpportunity {
  titulo: string;
  paraQuien: "competir" | "mejorar";
  senales: string[];
}

export interface Opportunity {
  titulo: string;
  paraQuien: "competir" | "mejorar";
  evidencias: Signal[];
  confianza: Confidence;
}

const MAX_SHOWN = 5;
const CONFIDENCE_ORDER: Record<Confidence, number> = { alta: 3, media: 2, baja: 1 };

const sourceCount = (evidence: Signal[]) => new Set(evidence.map((e) => e.source)).size;

export function confidenceFor(evidence: Signal[]): Confidence {
  if (evidence.length >= 4 && sourceCount(evidence) >= 3) return "alta";
  if (evidence.length >= 3) return "media";
  return "baja";
}

export function validateOpportunities(
  proposed: ProposedOpportunity[],
  signals: Signal[],
): { oportunidades: Opportunity[]; pistas: Opportunity[] } {
  const byId = new Map(signals.map((s) => [s.id, s]));
  const oportunidades: Opportunity[] = [];
  const pistas: Opportunity[] = [];

  for (const p of proposed) {
    const evidencias = Array.from(new Set(p.senales))
      .map((id) => byId.get(id))
      .filter((s): s is Signal => s !== undefined);

    if (evidencias.length >= 2 && sourceCount(evidencias) >= 2) {
      oportunidades.push({ titulo: p.titulo, paraQuien: p.paraQuien, evidencias, confianza: confidenceFor(evidencias) });
    } else if (evidencias.length >= 1) {
      pistas.push({ titulo: p.titulo, paraQuien: p.paraQuien, evidencias, confianza: "baja" });
    }
  }

  oportunidades.sort(
    (a, b) =>
      CONFIDENCE_ORDER[b.confianza] - CONFIDENCE_ORDER[a.confianza] || b.evidencias.length - a.evidencias.length,
  );

  return { oportunidades: oportunidades.slice(0, MAX_SHOWN), pistas: pistas.slice(0, MAX_SHOWN) };
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npm test -- opportunities`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/opportunities.ts tests/engine/opportunities.test.ts
git commit -m "Add opportunity validation with the 2-signals/2-sources rule"
```

---

### Task 10: IA — esquema, prompt y proveedores con respaldo

**Files:**
- Create: `lib/engine/ai/schema.ts`, `lib/engine/ai/prompt.ts`, `lib/engine/ai/providers.ts`
- Create: `tests/engine/ai-fixture.ts`, `tests/engine/ai.test.ts`

**Interfaces:**
- Consumes: `RawData`, `Signal`, `Anchors`.
- Produces: `aiOutputSchema` (zod) y `type AiOutput`; `buildPrompt(raw: RawData, anchors: Anchors, signals: Signal[]): string`; `interface JsonModel { name: string; generate: (prompt: string) => Promise<string> }`; `geminiModel(apiKey: string, model?: string): JsonModel`; `groqModel(apiKey: string, model?: string, fetcher?: Fetcher): JsonModel`; `generateAiOutput(prompt: string, models: JsonModel[], attemptsPerModel?: number): Promise<AiOutput>`; `class AiUnavailableError extends Error`.
- Produces (tests): `validAiOutput: AiOutput` en `tests/engine/ai-fixture.ts`.

- [ ] **Step 1: Crear la respuesta de IA de ejemplo**

`tests/engine/ai-fixture.ts`:

```ts
import type { AiOutput } from "../../lib/engine/ai/schema";

export const validAiOutput: AiOutput = {
  resumen: {
    queHace: "Software de facturación online para autónomos.",
    paraQuien: "Autónomos y pequeñas empresas en España.",
    tipoNegocio: "saas",
    comoGanaDinero: "Suscripción mensual con dos planes.",
    precios: ["Básico 9 €/mes", "Pro 29 €/mes"],
  },
  trafico: { comentario: "Tráfico medio y en ligera caída." },
  ingresos: {
    anualMin: 300000,
    anualMax: 1200000,
    valoracionMin: 1500000,
    valoracionMax: 6000000,
    confianza: "baja",
    suposiciones: ["500.000–5.000.000 visitas/mes × 0,5 % registro × 20 % pago × 15 €/mes"],
  },
  senalesMercado: [{ id: "mercado_competidores_con_app", etiqueta: "Sus competidores principales tienen app móvil" }],
  oportunidades: [
    { titulo: "App móvil para facturar desde el móvil", paraQuien: "competir", senales: ["sin_app_movil", "mercado_competidores_con_app", "pagespeed_movil_bajo"] },
    { titulo: "Inventada sin datos", paraQuien: "mejorar", senales: ["no_existe"] },
  ],
  veredicto: {
    puntuaciones: {
      mercado: { valor: 70, senales: ["mercado_competidores_con_app"] },
      traccion: { valor: 50, senales: ["trafico_en_caida", "no_existe"] },
      monetizacion: { valor: 80, senales: [] },
      diferenciacion: { valor: 41, senales: [] },
    },
    fortalezas: ["Precios claros", "Plan gratuito", "Marca en español"],
    debilidades: ["Web lenta en móvil", "Sin app", "Tráfico en caída"],
    competidores: [{ nombre: "Holded", dominio: "holded.com" }],
    conclusion: "Negocio consolidado con margen de mejora en móvil.",
  },
};
```

- [ ] **Step 2: Escribir la prueba que falla**

`tests/engine/ai.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aiOutputSchema } from "../../lib/engine/ai/schema";
import { buildPrompt } from "../../lib/engine/ai/prompt";
import { generateAiOutput, groqModel, AiUnavailableError, type JsonModel } from "../../lib/engine/ai/providers";
import { validAiOutput } from "./ai-fixture";
import { makeRaw } from "./raw-fixture";
import { computeAnchors } from "../../lib/engine/anchors";
import { NOW } from "./fake-network";

const model = (name: string, answers: (string | Error)[]): JsonModel & { calls: number } => {
  const m = {
    name,
    calls: 0,
    generate: async () => {
      const answer = answers[Math.min(m.calls, answers.length - 1)];
      m.calls++;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return m;
};

const VALID = JSON.stringify(validAiOutput);

describe("aiOutputSchema", () => {
  it("acepta la respuesta de ejemplo", () => {
    expect(aiOutputSchema.safeParse(validAiOutput).success).toBe(true);
  });
  it("rechaza ids de mercado sin prefijo", () => {
    const bad = { ...validAiOutput, senalesMercado: [{ id: "competidores", etiqueta: "x" }] };
    expect(aiOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("buildPrompt", () => {
  it("incluye dominio, anclas y señales con sus ids", () => {
    const raw = makeRaw({ pagespeed: { mobile: 30, desktop: 90 } });
    const prompt = buildPrompt(raw, computeAnchors(raw, NOW), [
      { id: "pagespeed_movil_bajo", family: "tecnica", source: "pagespeed", label: "Rendimiento móvil bajo: 30/100" },
    ]);
    expect(prompt).toContain("facturo.example");
    expect(prompt).toContain("pagespeed_movil_bajo");
    expect(prompt).toContain("5000000"); // ancla de visitas
    expect(prompt).toContain("mercado_");
  });
});

describe("generateAiOutput", () => {
  it("devuelve la primera respuesta válida", async () => {
    const m = model("gemini", [VALID]);
    expect(await generateAiOutput("p", [m])).toEqual(validAiOutput);
    expect(m.calls).toBe(1);
  });

  it("acepta JSON envuelto en bloque de código", async () => {
    expect(await generateAiOutput("p", [model("gemini", ["```json\n" + VALID + "\n```"])])).toEqual(validAiOutput);
  });

  it("reintenta si el JSON no es válido", async () => {
    const m = model("gemini", ["no es json", '{"resumen":{}}', VALID]);
    expect(await generateAiOutput("p", [m])).toEqual(validAiOutput);
    expect(m.calls).toBe(3);
  });

  it("pasa al proveedor de respaldo si se agota el cupo", async () => {
    const gemini = model("gemini", [new Error("429 RESOURCE_EXHAUSTED")]);
    const groq = model("groq", [VALID]);
    expect(await generateAiOutput("p", [gemini, groq])).toEqual(validAiOutput);
    expect(gemini.calls).toBe(1);
  });

  it("lanza AiUnavailableError si todo falla", async () => {
    await expect(
      generateAiOutput("p", [model("gemini", ["mal"]), model("groq", [new Error("caído")])]),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("lanza AiUnavailableError si no hay modelos configurados", async () => {
    await expect(generateAiOutput("p", [])).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("groqModel", () => {
  it("usa la API compatible con OpenAI en modo JSON", async () => {
    let body: Record<string, unknown> = {};
    const m = groqModel("KEY", "llama-test", async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ choices: [{ message: { content: VALID } }] });
    });
    expect(await m.generate("hola")).toBe(VALID);
    expect(body).toMatchObject({ model: "llama-test", response_format: { type: "json_object" } });
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

Run: `npm test -- ai.test`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 4: Implementar `schema.ts`**

`lib/engine/ai/schema.ts`:

```ts
import { z } from "zod";

const confidence = z.enum(["baja", "media", "alta"]);
const subscore = z.object({ valor: z.number().min(0).max(100), senales: z.array(z.string()) });

export const aiOutputSchema = z.object({
  resumen: z.object({
    queHace: z.string(),
    paraQuien: z.string(),
    tipoNegocio: z.enum(["saas", "ecommerce", "marketplace", "contenido_ads", "servicios", "app", "otro"]),
    comoGanaDinero: z.string(),
    precios: z.array(z.string()),
  }),
  trafico: z.object({ comentario: z.string() }),
  ingresos: z.object({
    anualMin: z.number().nullable(),
    anualMax: z.number().nullable(),
    valoracionMin: z.number().nullable(),
    valoracionMax: z.number().nullable(),
    confianza: confidence,
    suposiciones: z.array(z.string()),
  }),
  senalesMercado: z.array(z.object({ id: z.string().regex(/^mercado_[a-z0-9_]+$/), etiqueta: z.string() })),
  oportunidades: z.array(
    z.object({ titulo: z.string(), paraQuien: z.enum(["competir", "mejorar"]), senales: z.array(z.string()) }),
  ),
  veredicto: z.object({
    puntuaciones: z.object({
      mercado: subscore,
      traccion: subscore,
      monetizacion: subscore,
      diferenciacion: subscore,
    }),
    fortalezas: z.array(z.string()),
    debilidades: z.array(z.string()),
    competidores: z.array(z.object({ nombre: z.string(), dominio: z.string().nullable() })),
    conclusion: z.string(),
  }),
});

export type AiOutput = z.infer<typeof aiOutputSchema>;
```

- [ ] **Step 5: Implementar `prompt.ts`**

`lib/engine/ai/prompt.ts`:

```ts
import type { Anchors } from "../anchors";
import type { RawData, Signal } from "../types";

const OUTPUT_SHAPE = `{
  "resumen": { "queHace": string, "paraQuien": string, "tipoNegocio": "saas"|"ecommerce"|"marketplace"|"contenido_ads"|"servicios"|"app"|"otro", "comoGanaDinero": string, "precios": string[] },
  "trafico": { "comentario": string },
  "ingresos": { "anualMin": number|null, "anualMax": number|null, "valoracionMin": number|null, "valoracionMax": number|null, "confianza": "baja"|"media"|"alta", "suposiciones": string[] },
  "senalesMercado": [{ "id": "mercado_<snake_case>", "etiqueta": string }],
  "oportunidades": [{ "titulo": string, "paraQuien": "competir"|"mejorar", "senales": string[] }],
  "veredicto": {
    "puntuaciones": { "mercado": { "valor": 0-100, "senales": string[] }, "traccion": {...}, "monetizacion": {...}, "diferenciacion": {...} },
    "fortalezas": [3 strings], "debilidades": [3 strings],
    "competidores": [{ "nombre": string, "dominio": string|null }],
    "conclusion": string
  }
}`;

export function buildPrompt(raw: RawData, anchors: Anchors, signals: Signal[]): string {
  const data = {
    dominio: raw.domain,
    web: raw.site && {
      paginas: raw.site.pages.map((p) => ({ ...p, text: p.text.slice(0, 3000) })),
      idiomas: raw.site.languages,
      redes: raw.site.socialLinks,
      llamadasALaAccion: raw.site.ctas,
      preciosDetectados: raw.site.pricesFound,
      tieneBlog: raw.site.hasBlog,
      planGratuitoOPrueba: raw.site.hasFreePlanOrTrial,
      testimonios: raw.site.hasTestimonials,
      tecnologias: raw.site.technologies,
      datosEstructurados: raw.site.jsonLdTypes,
    },
    tranco: raw.tranco,
    cloudflareRadar: raw.radar,
    pagespeed: raw.pagespeed,
    registroDominio: raw.rdap,
    waybackMachine: raw.wayback,
    fuentesNoDisponibles: raw.unavailable,
    anclas: anchors,
  };

  return `Eres analista de negocios digitales de DNAweb. Analiza el negocio con los datos de abajo y responde SOLO con un JSON válido, en español, con exactamente esta forma:

${OUTPUT_SHAPE}

Reglas:
1. No inventes cifras. Para el tráfico usa las "anclas" (visitasMes) como base. Si no hay datos para estimar ingresos o valoración, pon null y confianza "baja".
2. En "suposiciones" explica el cálculo de ingresos con números (por ejemplo: "visitas × conversión × precio").
3. "senalesMercado": de 0 a 5 hechos sobre el mercado y los competidores que conozcas con seguridad (por ejemplo, qué ofrecen los competidores y este negocio no). Cada id empieza por "mercado_".
4. "oportunidades": de 3 a 6. Cada una debe citar en "senales" los ids de las señales que la respaldan, tomados SOLO de la lista de señales de abajo o de tus "senalesMercado". Cita al menos 2 señales de fuentes distintas; las oportunidades sin respaldo se descartan.
5. "paraQuien": "competir" si sirve para competir contra este negocio, "mejorar" si sirve para mejorarlo si fuera tuyo.
6. En cada puntuación del veredicto cita los ids de las señales en que te apoyas.
7. "competidores": de 3 a 5 competidores reales y probables.

Señales detectadas (id — fuente — descripción):
${signals.map((s) => `- ${s.id} — ${s.source} — ${s.label}`).join("\n") || "- (ninguna)"}

Datos:
${JSON.stringify(data)}`;
}
```

- [ ] **Step 6: Implementar `providers.ts`**

`lib/engine/ai/providers.ts`:

```ts
import { GoogleGenAI } from "@google/genai";
import type { Fetcher } from "../types";
import { aiOutputSchema, type AiOutput } from "./schema";

export interface JsonModel {
  name: string;
  generate: (prompt: string) => Promise<string>;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export function geminiModel(apiKey: string, model = "gemini-2.5-flash"): JsonModel {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: `gemini:${model}`,
    generate: async (prompt) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: 0.3 },
      });
      return response.text ?? "";
    },
  };
}

export function groqModel(apiKey: string, model = "llama-3.3-70b-versatile", fetcher: Fetcher = fetch): JsonModel {
  return {
    name: `groq:${model}`,
    generate: async (prompt) => {
      const res = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Groq respondió ${res.status}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? "";
    },
  };
}

const stripFences = (text: string) => text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

const isQuotaError = (error: unknown) =>
  error instanceof Error && /429|RESOURCE_EXHAUSTED|quota/i.test(error.message);

export async function generateAiOutput(
  prompt: string,
  models: JsonModel[],
  attemptsPerModel = 3,
): Promise<AiOutput> {
  const errors: string[] = [];

  for (const model of models) {
    for (let attempt = 0; attempt < attemptsPerModel; attempt++) {
      try {
        const parsed = aiOutputSchema.safeParse(JSON.parse(stripFences(await model.generate(prompt))));
        if (parsed.success) return parsed.data;
        errors.push(`${model.name}: JSON con forma incorrecta`);
      } catch (error) {
        errors.push(`${model.name}: ${error instanceof Error ? error.message : String(error)}`);
        if (isQuotaError(error)) break; // cupo agotado: pasar al siguiente proveedor
      }
    }
  }

  throw new AiUnavailableError(errors.length ? errors.join(" | ") : "No hay ningún proveedor de IA configurado.");
}
```

- [ ] **Step 7: Ejecutar y comprobar que pasa**

Run: `npm test -- ai.test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/engine/ai tests/engine/ai-fixture.ts tests/engine/ai.test.ts
git commit -m "Add AI output schema, prompt and providers with fallback"
```

---

### Task 11: Informe final, `analyze()`, CLI y registro de decisiones

**Files:**
- Create: `lib/engine/report.ts`, `lib/engine/analyze.ts`, `scripts/analyze.ts`, `tests/engine/analyze.test.ts`
- Create: `docs/decisiones/0001-mvp-gratuito.md`, `docs/decisiones/0002-motor-en-tres-fases.md`, `docs/decisiones/0003-anclas-de-trafico.md`, `docs/decisiones/0004-regla-de-oportunidades.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces (report.ts): `interface Report` (ver código); `buildReport(raw: RawData, deps: { models: JsonModel[]; now: () => Date }, onStep?: StepReporter): Promise<Report>`; pasos `"Detectando señales…"`, `"Generando informe…"`.
- Produces (analyze.ts): `interface AnalyzeDeps extends CollectDeps { models: JsonModel[] }`; `analyze(input: string, deps: AnalyzeDeps, onStep?: StepReporter): Promise<{ raw: RawData; report: Report }>`; `depsFromEnv(env?: NodeJS.ProcessEnv): AnalyzeDeps`. Plan 2 usará `collect` + `buildReport` por separado (para la caché de 24 h) y `analyze` en el caso normal.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/engine/analyze.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { analyze, depsFromEnv } from "../../lib/engine/analyze";
import { buildReport } from "../../lib/engine/report";
import { InvalidUrlError } from "../../lib/engine/url";
import { fakeFetcher, fakeGetPage, NOW } from "./fake-network";
import { validAiOutput } from "./ai-fixture";
import { makeRaw, makeSite } from "./raw-fixture";
import type { JsonModel } from "../../lib/engine/ai/providers";

const fakeModel: JsonModel = { name: "fake", generate: async () => JSON.stringify(validAiOutput) };

describe("buildReport", () => {
  const raw = makeRaw({
    site: makeSite({ hasAppLinks: false }),
    pagespeed: { mobile: 30, desktop: 90 },
    tranco: { rank: 60000, trend: "baja" },
  });

  it("combina anclas, señales y respuesta de la IA", async () => {
    const report = await buildReport(raw, { models: [fakeModel], now: () => NOW });

    expect(report.dominio).toBe("facturo.example");
    expect(report.generadoEn).toBe(NOW.toISOString());
    expect(report.resumen.tipoNegocio).toBe("saas");
    expect(report.trafico).toMatchObject({
      visitasMes: { min: 500_000, max: 5_000_000 },
      confianza: "media",
      tendencia: "baja",
      antiguedadAnios: 11,
    });
    expect(report.ingresos.anualMin).toBe(300000);
  });

  it("filtra oportunidades con la regla 2+2 y añade las señales de mercado", async () => {
    const report = await buildReport(raw, { models: [fakeModel], now: () => NOW });
    expect(report.oportunidades).toHaveLength(1);
    expect(report.oportunidades[0]).toMatchObject({ titulo: "App móvil para facturar desde el móvil", confianza: "media" });
    expect(report.oportunidades[0].evidencias.map((e) => e.source)).toEqual(["web", "mercado", "pagespeed"]);
    expect(report.senales.map((s) => s.id)).toContain("mercado_competidores_con_app");
  });

  it("calcula la puntuación global y limpia señales inexistentes del veredicto", async () => {
    const report = await buildReport(raw, { models: [fakeModel], now: () => NOW });
    expect(report.veredicto.puntuacion).toBe(60); // (70 + 50 + 80 + 41) / 4 = 60,25
    expect(report.veredicto.puntuaciones.traccion.senales).toEqual(["trafico_en_caida"]);
    expect(report.veredicto.fortalezas).toHaveLength(3);
  });

  it("marca el análisis como limitado si apenas hay texto", async () => {
    const limited = await buildReport(makeRaw({ site: makeSite({ textLength: 100 }) }), { models: [fakeModel], now: () => NOW });
    expect(limited.analisisLimitado).toBe(true);
  });

  it("informa de los pasos", async () => {
    const steps: string[] = [];
    await buildReport(raw, { models: [fakeModel], now: () => NOW }, (s) => {
      steps.push(s);
    });
    expect(steps).toEqual(["Detectando señales…", "Generando informe…"]);
  });
});

describe("analyze", () => {
  it("ejecuta el motor completo de URL a informe", async () => {
    const steps: string[] = [];
    const { raw, report } = await analyze(
      "Facturo.example/precios",
      { getPage: fakeGetPage, fetcher: fakeFetcher(), radarToken: "tok", now: () => NOW, models: [fakeModel] },
      (s) => {
        steps.push(s);
      },
    );
    expect(raw.domain).toBe("facturo.example");
    expect(report.dominio).toBe("facturo.example");
    expect(steps).toEqual(["Leyendo la web…", "Analizando tráfico y presencia…", "Detectando señales…", "Generando informe…"]);
  });

  it("rechaza URLs inválidas antes de hacer peticiones", async () => {
    const fetcher = async () => {
      throw new Error("no debería llamarse");
    };
    await expect(
      analyze("localhost", { getPage: fakeGetPage, fetcher, now: () => NOW, models: [fakeModel] }),
    ).rejects.toBeInstanceOf(InvalidUrlError);
  });
});

describe("depsFromEnv", () => {
  it("configura Gemini y Groq según las variables disponibles", () => {
    const deps = depsFromEnv({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q", GROQ_MODEL: "m" } as NodeJS.ProcessEnv);
    expect(deps.models.map((m) => m.name)).toEqual(["gemini:gemini-2.5-flash", "groq:m"]);
    expect(deps.radarToken).toBeUndefined();
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npm test -- analyze`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementar `report.ts`**

`lib/engine/report.ts`:

```ts
import { computeAnchors } from "./anchors";
import { extractSignals } from "./signals";
import { validateOpportunities, type Opportunity } from "./opportunities";
import { buildPrompt } from "./ai/prompt";
import { generateAiOutput, type JsonModel } from "./ai/providers";
import type { AiOutput } from "./ai/schema";
import type { StepReporter } from "./collect";
import type { Confidence, PageSpeedData, Range, RawData, Signal, SourceId, Technology, Trend } from "./types";

type SubscoreKey = keyof AiOutput["veredicto"]["puntuaciones"];
type Subscore = { valor: number; senales: string[] };

export interface Report {
  dominio: string;
  generadoEn: string;
  analisisLimitado: boolean;
  resumen: AiOutput["resumen"];
  trafico: {
    visitasMes: Range | null;
    confianza: Confidence;
    tendencia: Trend | "no estimable";
    redes: Record<string, string>;
    pagespeed: PageSpeedData | null;
    antiguedadAnios: number | null;
    tecnologias: Technology[];
    comentario: string;
  };
  ingresos: AiOutput["ingresos"];
  oportunidades: Opportunity[];
  pistas: Opportunity[];
  veredicto: {
    puntuacion: number;
    puntuaciones: Record<SubscoreKey, Subscore>;
    fortalezas: string[];
    debilidades: string[];
    competidores: AiOutput["veredicto"]["competidores"];
    conclusion: string;
  };
  senales: Signal[];
  fuentesNoDisponibles: SourceId[];
}

const SUBSCORE_KEYS: SubscoreKey[] = ["mercado", "traccion", "monetizacion", "diferenciacion"];

export async function buildReport(
  raw: RawData,
  deps: { models: JsonModel[]; now: () => Date },
  onStep: StepReporter = () => {},
): Promise<Report> {
  const now = deps.now();

  await onStep("Detectando señales…");
  const anchors = computeAnchors(raw, now);
  const baseSignals = extractSignals(raw, now);

  await onStep("Generando informe…");
  const ai = await generateAiOutput(buildPrompt(raw, anchors, baseSignals), deps.models);

  const marketSignals: Signal[] = ai.senalesMercado.map((m) => ({
    id: m.id,
    family: "mercado",
    source: "mercado",
    label: m.etiqueta,
  }));
  const signals = [...baseSignals, ...marketSignals.filter((m) => !baseSignals.some((b) => b.id === m.id))];
  const knownIds = new Set(signals.map((s) => s.id));

  const { oportunidades, pistas } = validateOpportunities(ai.oportunidades, signals);

  const puntuaciones = Object.fromEntries(
    SUBSCORE_KEYS.map((key) => {
      const s = ai.veredicto.puntuaciones[key];
      return [key, { valor: Math.round(s.valor), senales: s.senales.filter((id) => knownIds.has(id)) }];
    }),
  ) as Record<SubscoreKey, Subscore>;
  const puntuacion = Math.round(SUBSCORE_KEYS.reduce((sum, k) => sum + puntuaciones[k].valor, 0) / SUBSCORE_KEYS.length);

  return {
    dominio: raw.domain,
    generadoEn: now.toISOString(),
    analisisLimitado: !raw.site || raw.site.textLength < 500,
    resumen: ai.resumen,
    trafico: {
      visitasMes: anchors.visitasMes,
      confianza: anchors.confianzaTrafico,
      tendencia: raw.tranco?.trend ?? "no estimable",
      redes: raw.site?.socialLinks ?? {},
      pagespeed: raw.pagespeed,
      antiguedadAnios: anchors.antiguedadAnios,
      tecnologias: raw.site?.technologies ?? [],
      comentario: ai.trafico.comentario,
    },
    ingresos: ai.ingresos,
    oportunidades,
    pistas,
    veredicto: {
      puntuacion,
      puntuaciones,
      fortalezas: ai.veredicto.fortalezas.slice(0, 3),
      debilidades: ai.veredicto.debilidades.slice(0, 3),
      competidores: ai.veredicto.competidores.slice(0, 5),
      conclusion: ai.veredicto.conclusion,
    },
    senales: signals,
    fuentesNoDisponibles: raw.unavailable,
  };
}
```

- [ ] **Step 4: Implementar `analyze.ts`**

`lib/engine/analyze.ts`:

```ts
import { normalizeUrl } from "./url";
import { createSafeGetter } from "./safe-fetch";
import { collect, type CollectDeps, type StepReporter } from "./collect";
import { buildReport, type Report } from "./report";
import { geminiModel, groqModel, type JsonModel } from "./ai/providers";
import type { RawData } from "./types";

export interface AnalyzeDeps extends CollectDeps {
  models: JsonModel[];
}

export async function analyze(
  input: string,
  deps: AnalyzeDeps,
  onStep: StepReporter = () => {},
): Promise<{ raw: RawData; report: Report }> {
  const normalized = normalizeUrl(input);
  const raw = await collect(normalized, deps, onStep);
  const report = await buildReport(raw, deps, onStep);
  return { raw, report };
}

export function depsFromEnv(env: NodeJS.ProcessEnv = process.env): AnalyzeDeps {
  const models: JsonModel[] = [];
  if (env.GEMINI_API_KEY) models.push(geminiModel(env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined));
  if (env.GROQ_API_KEY) models.push(groqModel(env.GROQ_API_KEY, env.GROQ_MODEL || undefined));

  return {
    getPage: createSafeGetter(),
    fetcher: fetch,
    radarToken: env.CLOUDFLARE_RADAR_TOKEN || undefined,
    pagespeedKey: env.PAGESPEED_API_KEY || undefined,
    now: () => new Date(),
    models,
  };
}
```

- [ ] **Step 5: Ejecutar y comprobar que pasa**

Run: `npm test -- analyze`
Expected: PASS.

- [ ] **Step 6: Crear la CLI**

`scripts/analyze.ts`:

```ts
import { analyze, depsFromEnv } from "../lib/engine/analyze";

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Uso: npm run analyze -- <url>");
    process.exit(1);
  }
  const started = Date.now();
  const { report } = await analyze(input, depsFromEnv(), (step) => console.error(`→ ${step}`));
  console.log(JSON.stringify(report, null, 2));
  console.error(`✓ Listo en ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  process.exit(1);
});
```

- [ ] **Step 7: Registrar las decisiones**

`docs/decisiones/0001-mvp-gratuito.md`:

```markdown
# 0001 — El MVP es 100 % gratuito

- **Fecha:** 2026-10-14
- **Contexto:** Queremos validar DNAweb sin gastar dinero en APIs ni cobrar a usuarios.
- **Decisión:** Solo fuentes gratuitas (la web, detección propia de tecnologías, Tranco, Cloudflare Radar, PageSpeed, RDAP, Wayback Machine) y la capa gratuita de Gemini, con Groq como respaldo. Los usuarios tienen 5 créditos gratis al mes; sin Stripe ni planes.
- **Descartado:** Similarweb/Semrush/BuiltWith (cientos de €/mes); suscripción con Stripe (se añadirá tras validar interés).
- **Consecuencias:** Las cifras son estimaciones con rango y confianza. Las fuentes están aisladas en `lib/engine/sources/`, así que añadir una de pago es crear un módulo nuevo.
```

`docs/decisiones/0002-motor-en-tres-fases.md`:

```markdown
# 0002 — Motor en tres fases y separado de la interfaz

- **Fecha:** 2026-10-14
- **Decisión:** `lib/engine/` funciona en 3 fases: (1) recoger datos, (2) calcular anclas y señales por código, (3) la IA redacta el informe en JSON validado con zod. El motor no importa React ni Next.js, y toda la red se inyecta por parámetro.
- **Por qué:** Que la IA razone sobre datos calculados (y no los invente), poder probar todo sin internet, y poder cambiar de proveedor de IA sin tocar el resto.
- **Uso:** `npm run analyze -- <url>` ejecuta el motor completo desde la terminal.
```

`docs/decisiones/0003-anclas-de-trafico.md`:

```markdown
# 0003 — Tabla ranking → visitas mensuales

- **Fecha:** 2026-10-14
- **Decisión:** El tráfico se estima con una tabla fija a partir del ranking de Tranco (o, si falta, la franja de Cloudflare Radar):

| Ranking | Visitas/mes |
|---|---|
| ≤ 100 | 500 M – 5.000 M |
| ≤ 1.000 | 50 M – 500 M |
| ≤ 10.000 | 5 M – 50 M |
| ≤ 100.000 | 500 K – 5 M |
| ≤ 1.000.000 | 50 K – 500 K |
| Fuera del ranking | 0 – 50 K |

- **Confianza:** media si hay dato de Tranco y de Radar; baja si solo hay uno.
- **Pendiente de calibrar:** contrastar con 10–20 webs de tráfico conocido y ajustar la tabla (en `lib/engine/anchors.ts`).
```

`docs/decisiones/0004-regla-de-oportunidades.md`:

```markdown
# 0004 — Oportunidades respaldadas por varias señales

- **Fecha:** 2026-10-14
- **Decisión:** Una oportunidad solo se muestra si cita ≥ 2 señales existentes de ≥ 2 fuentes distintas. Con 1 señal pasa a "Pistas a investigar". La confianza la calcula el código: ≥ 4 señales y ≥ 3 fuentes → alta; ≥ 3 señales → media; si no → baja.
- **Por qué:** Evitar que la IA invente oportunidades sin datos; el usuario ve la lista de evidencias de cada una.
- **Dónde:** `lib/engine/signals.ts` (señales objetivas) y `lib/engine/opportunities.ts` (regla y confianza).
```

- [ ] **Step 8: Ejecutar todas las pruebas y el linter**

Run: `npm test`
Expected: PASS en todos los archivos.

Run: `npx tsc --noEmit`
Expected: sin errores de tipos.

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 9: Prueba manual con webs reales**

Requisito: `GEMINI_API_KEY` en `.env.local` (gratis en https://aistudio.google.com/apikey). Comprueba en https://ai.google.dev/gemini-api/docs/models que `gemini-2.5-flash` sigue disponible en la capa gratuita; si no, cambia `GEMINI_MODEL`.

```bash
npm run analyze -- notion.so
```

```bash
npm run analyze -- zara.com
```

```bash
npm run analyze -- wallapop.com
```

Expected: cada uno imprime los 4 pasos y un JSON con las 5 secciones. Revisa que (a) las visitas tienen sentido para la marca, (b) cada oportunidad lista ≥ 2 evidencias de fuentes distintas, (c) `fuentesNoDisponibles` solo contiene fuentes sin configurar (por ejemplo `radar` si no hay token). Anota en `docs/decisiones/0003-anclas-de-trafico.md` cualquier desajuste del tráfico observado.

- [ ] **Step 10: Commit**

```bash
git add lib/engine/report.ts lib/engine/analyze.ts scripts/analyze.ts tests/engine/analyze.test.ts docs/decisiones
git commit -m "Add report assembly, analyze entry point, CLI and decision log"
```
