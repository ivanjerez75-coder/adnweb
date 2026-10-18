import { describe, it, expect } from "vitest";
import { collect, InsufficientDataError } from "../../lib/engine/collect";
import { BlockedUrlError, type PageGetter } from "../../lib/engine/safe-fetch";
import { buildReport } from "../../lib/engine/report";
import type { JsonModel } from "../../lib/engine/ai/providers";
import { fakeFetcher, fakeGetPage, NOW } from "./fake-network";
import { validAiOutput } from "./ai-fixture";

const input = { url: "https://facturo.example/", domain: "facturo.example" };
const baseDeps = { getPage: fakeGetPage, fetcher: fakeFetcher(), radarToken: "tok", now: () => NOW };

describe("collect", () => {
  it("reúne todas las fuentes", async () => {
    const raw = await collect(input, baseDeps);
    expect(raw.domain).toBe("facturo.example");
    expect(raw.collectedAt).toBe(NOW.toISOString());
    expect(raw.site?.pricesFound).toEqual(["9 €", "29 €"]);
    expect(raw.tranco).toEqual({ rank: 60000, trend: "baja" });
    expect(raw.radar).toEqual({ bucket: 100000, rank: null });
    expect(raw.pagespeed).toEqual({ mobile: 34, desktop: 34 });
    expect(raw.rdap).toEqual({ registeredAt: "2015-03-02" });
    expect(raw.wayback).toEqual({ firstCapture: "2015-04-01", lastChange: "2025-11-01", changesLastYear: 0 });
    expect(raw.unavailable).toEqual([]);
    expect(raw.rootDomain).toBe("facturo.example");
    expect(raw.fuentes).toEqual({
      web: "ok", tecnologias: "ok", tranco: "ok", radar: "ok", pagespeed: "ok", rdap: "ok", wayback: "ok",
      sitemap: "no_aplica", rutas: "ok", empleo: "no_aplica", appstore: "no_aplica", wikidata: "no_aplica", dns: "ok", hackernews: "ok", paginas: "ok",
    });
    expect(raw.dns).toEqual({ emailProvider: "Google Workspace", tools: [{ name: "Mailchimp", category: "email" }] });
    expect(raw.rutas).toEqual({ found: ["precios"], checked: ["blog", "precios", "empleo", "about"] });
  });

  it("lee en profundidad las páginas propias en extractos numerados (versión 3)", async () => {
    const raw = await collect(input, baseDeps);
    expect(raw.version).toBe(3);
    expect(raw.fuentes.paginas).toBe("ok");
    const home = raw.paginas?.find((p) => p.url === "https://facturo.example/");
    expect(home?.id).toMatch(/^p\d+$/);
    expect(home?.extractos.length).toBeGreaterThan(0);
    expect(home?.extractos[0].id).toBe(`${home?.id}-e1`);
    for (const e of home?.extractos ?? []) expect(e.cita.length).toBeLessThanOrEqual(200);
  });

  it("marca Radar como no aplicable si no hay token", async () => {
    const raw = await collect(input, { ...baseDeps, radarToken: undefined });
    expect(raw.radar).toBeNull();
    expect(raw.fuentes.radar).toBe("no_aplica");
    expect(raw.unavailable).toEqual([]);
  });

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

  it.each([[{ bucket: null }], [{ bucket: "" }], [{ bucket: 0 }]])(
    "una franja de Radar no válida no cuenta como tráfico (%o)",
    async (details) => {
      const fetcher = fakeFetcher({
        "tranco-list.eu": () => Response.json({ ranks: [] }),
        "api.cloudflare.com": () => Response.json({ result: { details_0: details } }),
      });
      const getPage = async () => {
        throw new Error("bloqueado por antibots");
      };
      await expect(collect(input, { ...baseDeps, fetcher, getPage })).rejects.toBeInstanceOf(InsufficientDataError);
    },
  );

  it("un rango de Radar sin franja sí cuenta como tráfico", async () => {
    const fetcher = fakeFetcher({
      "tranco-list.eu": () => Response.json({ ranks: [] }),
      "api.cloudflare.com": () => Response.json({ result: { details_0: { rank: 321 } } }),
    });
    const getPage = async () => {
      throw new Error("bloqueado por antibots");
    };
    const raw = await collect(input, { ...baseDeps, fetcher, getPage });
    expect(raw.radar).toEqual({ bucket: null, rank: 321 });
  });

  it("consulta Tranco, Radar y RDAP con el dominio registrable y el resto con el host completo", async () => {
    const urls: string[] = [];
    const base = fakeFetcher();
    const fetcher = async (url: string, init?: RequestInit) => {
      urls.push(url);
      return base(url, init);
    };
    const pages: string[] = [];
    const getPage = async (url: string) => {
      pages.push(url);
      return { url, status: 200, headers: {}, text: "<html><body>Hola</body></html>" };
    };
    const raw = await collect({ url: "https://app.hubspot.com/", domain: "app.hubspot.com" }, { ...baseDeps, fetcher, getPage });

    expect(raw.domain).toBe("app.hubspot.com");
    expect(urls).toContain("https://tranco-list.eu/api/ranks/domain/hubspot.com");
    expect(urls.some((u) => u.startsWith("https://api.cloudflare.com/client/v4/radar/ranking/domain/hubspot.com?"))).toBe(true);
    expect(urls).toContain("https://rdap.org/domain/hubspot.com");
    const wayback = urls.filter((u) => u.includes("web.archive.org"));
    expect(wayback.length).toBeGreaterThan(0);
    expect(wayback.every((u) => u.includes("app.hubspot.com"))).toBe(true);
    expect(pages[0]).toBe("https://app.hubspot.com/");
  });

  it.each(["tienda.myshopify.com", "miapp.vercel.app"])(
    "no colapsa el subdominio alojado %s al dominio de la plataforma",
    async (domain) => {
      const urls: string[] = [];
      const base = fakeFetcher();
      const fetcher = async (url: string, init?: RequestInit) => {
        urls.push(url);
        return base(url, init);
      };
      const getPage = async (url: string) => ({ url, status: 200, headers: {}, text: "<html><body>Hola</body></html>" });
      await collect({ url: `https://${domain}/`, domain }, { ...baseDeps, fetcher, getPage });

      expect(urls).toContain(`https://tranco-list.eu/api/ranks/domain/${domain}`);
      expect(urls.some((u) => u.startsWith(`https://api.cloudflare.com/client/v4/radar/ranking/domain/${domain}?`))).toBe(true);
      expect(urls).toContain(`https://rdap.org/domain/${domain}`);
    },
  );

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

describe("collect — redirecciones a otro dominio", () => {
  const recording = (overrides: Parameters<typeof fakeFetcher>[0] = {}) => {
    const urls: string[] = [];
    const base = fakeFetcher(overrides);
    const fetcher = async (url: string, init?: RequestInit) => {
      urls.push(url);
      return base(url, init);
    };
    return { urls, fetcher };
  };
  const redirectTo = (from: string, to: string, title: string): PageGetter & { calls: string[] } => {
    const calls: string[] = [];
    return Object.assign(
      async (url: string) => {
        calls.push(url);
        return url === from
          ? { url: to, status: 200, headers: {}, text: `<html><head><title>${title}</title></head><body></body></html>` }
          : { url, status: 404, headers: {}, text: "" };
      },
      { calls },
    );
  };

  it("notion.so → www.notion.com: adopta notion.com y usa ambos dominios para App Store y Wikidata", async () => {
    const { urls, fetcher } = recording({
      "itunes.apple.com": () =>
        Response.json({ results: [{ trackName: "Notion", trackViewUrl: "https://apps.apple.com/app/id1", userRatingCount: 10, sellerUrl: "https://www.notion.so/" }] }),
    });
    const getPage = redirectTo("https://notion.so/", "https://www.notion.com/", "Notion");
    const raw = await collect({ url: "https://notion.so/", domain: "notion.so" }, { ...baseDeps, getPage, fetcher });
    expect(raw.rootDomain).toBe("notion.com");
    expect(raw.finalDomain).toBe("notion.com");
    expect(raw.companyNameFromPage).toBe(true);
    expect(urls).toContain("https://tranco-list.eu/api/ranks/domain/notion.com");
    expect(raw.appstore?.name).toBe("Notion"); // vendedor en notion.so, aceptado
  });

  it("acme.example → instagram.com/acme: NO adopta la identidad de Instagram", async () => {
    const { urls, fetcher } = recording();
    const getPage = redirectTo("https://acme.example/", "https://www.instagram.com/acme/", "Instagram");
    const raw = await collect({ url: "https://acme.example/", domain: "acme.example" }, { ...baseDeps, getPage, fetcher });
    expect(raw.rootDomain).toBe("acme.example");
    expect(raw.finalDomain).toBe("instagram.com");
    expect(raw.companyNameFromPage).toBe(false);
    expect(urls).toContain("https://tranco-list.eu/api/ranks/domain/acme.example");
    expect(urls.some((u) => u.includes("instagram.com"))).toBe(false);
    expect(urls.some((u) => u.includes("wbsearchentities") && /search=acme(&|$)/.test(u))).toBe(true);
    expect(urls.some((u) => u.includes("itunes.apple.com/search?term=acme&"))).toBe(true);
    // El sitemap sería el de Instagram: no se lee.
    expect(getPage.calls.some((u) => u.includes("robots.txt") || u.includes("sitemap"))).toBe(false);
    expect(raw.fuentes.sitemap).toBe("no_aplica");
  });

  it("acme.example → other.example (otra primera etiqueta): NO adopta", async () => {
    const { urls, fetcher } = recording();
    const getPage = redirectTo("https://acme.example/", "https://other.example/", "Other Corp");
    const raw = await collect({ url: "https://acme.example/", domain: "acme.example" }, { ...baseDeps, getPage, fetcher });
    expect(raw.rootDomain).toBe("acme.example");
    expect(raw.finalDomain).toBe("other.example");
    expect(urls).toContain("https://rdap.org/domain/acme.example");
    expect(urls.some((u) => u.includes("search=Other"))).toBe(false);
  });

  it("acme.example → acme.myshopify.com: una plataforma de la lista no se adopta aunque coincida la etiqueta", async () => {
    const { urls, fetcher } = recording();
    const getPage = redirectTo("https://acme.example/", "https://acme.myshopify.com/", "Acme");
    const raw = await collect({ url: "https://acme.example/", domain: "acme.example" }, { ...baseDeps, getPage, fetcher });
    expect(raw.rootDomain).toBe("acme.example");
    expect(urls).toContain("https://tranco-list.eu/api/ranks/domain/acme.example");
  });

  it("no usa las apps ni los tableros de empleo que enlaza la página de otro", async () => {
    const { urls, fetcher } = recording();
    const html = `<html><head><title>Instagram</title></head><body><a href="https://apps.apple.com/app/instagram/id389801252">App</a><a href="https://jobs.lever.co/meta">Jobs</a></body></html>`;
    const getPage: PageGetter = async (url) =>
      url === "https://acme.example/"
        ? { url: "https://www.instagram.com/acme/", status: 200, headers: {}, text: html }
        : { url, status: 404, headers: {}, text: "" };
    await collect({ url: "https://acme.example/", domain: "acme.example" }, { ...baseDeps, getPage, fetcher });
    expect(urls.some((u) => u.includes("lookup?id=389801252"))).toBe(false);
    expect(urls.some((u) => u.includes("api.lever.co/v0/postings/meta"))).toBe(false);
  });

  it("sin redirección, finalDomain es null", async () => {
    const raw = await collect(input, baseDeps);
    expect(raw.finalDomain).toBeNull();
    expect(raw.companyNameFromPage).toBe(true);
    expect(raw.foreignSite).toBeNull();
  });

  describe("acme.example → instagram.com/acme con apps, 5 idiomas y analítica en la página de Instagram", () => {
    const hreflangs = ["es", "en", "fr", "de", "it"].map((l) => `<link rel="alternate" hreflang="${l}" href="https://www.instagram.com/${l}/acme/">`).join("");
    const html =
      `<html lang="en"><head><title>Instagram</title>${hreflangs}` +
      `<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>` +
      `<script src="https://widget.intercom.io/widget/x"></script><script src="https://js.hs-scripts.com/1.js"></script>` +
      `<script src="https://chimpstatic.com/mcjs-connected/js/users/x.js"></script></head>` +
      `<body><h1>Instagram</h1><p>${"Comparte fotos y vídeos con tus amigos. ".repeat(80)}</p>` +
      `<a href="https://apps.apple.com/app/instagram/id389801252">App Store</a><a href="https://play.google.com/store/apps/details?id=com.instagram.android">Google Play</a>` +
      `<a href="https://jobs.lever.co/meta">Jobs</a></body></html>`;
    const getPage: PageGetter = async (url) =>
      url === "https://acme.example/"
        ? { url: "https://www.instagram.com/acme/", status: 200, headers: {}, text: html }
        : { url, status: 404, headers: {}, text: "" };
    const fetcher = fakeFetcher({
      pagespeedonline: () => Response.json({ lighthouseResult: { categories: { performance: { score: 0.97 } } } }),
    });
    const acme = { url: "https://acme.example/", domain: "acme.example" };
    const fakeModel: JsonModel = { name: "fake", generate: async () => JSON.stringify(validAiOutput) };

    it("la página de otro no cuenta como web propia: va a foreignSite y PageSpeed no aplica", async () => {
      const raw = await collect(acme, { ...baseDeps, getPage, fetcher });
      expect(raw.site).toBeNull();
      expect(raw.foreignSite?.finalUrl).toBe("https://www.instagram.com/acme/");
      expect(raw.fuentes.web).toBe("ok");
      expect(raw.pagespeed).toBeNull();
      expect(raw.fuentes.pagespeed).toBe("no_aplica");
      expect(raw.unavailable).not.toContain("pagespeed");
      expect(raw.fuentes.tecnologias).toBe("no_aplica");
    });

    it("hechos, señales, tecnologías, nombre y análisis limitado se calculan como si no hubiera web", async () => {
      const raw = await collect(acme, { ...baseDeps, getPage, fetcher });
      const report = await buildReport(raw, { models: [fakeModel], now: () => NOW });
      expect(report.hechos.app).not.toBe("si");
      const ids = report.senales.map((s) => s.id);
      for (const id of ["multi_idioma", "stack_crecimiento", "web_rapida"]) expect(ids).not.toContain(id);
      expect(report.senales.filter((s) => ["web", "tecnologias", "pagespeed"].includes(s.source))).toEqual([]);
      // Solo quedan las herramientas que el DNS ve en acme.example.
      expect(report.trafico.tecnologias).toEqual(raw.dns?.tools ?? []);
      expect(report.trafico.tecnologias.map((t) => t.name)).not.toContain("Google Analytics");
      expect(report.trafico.pagespeed).toBeNull();
      expect(report.trafico.redes).toEqual({});
      expect(report.empresa.nombre).toBeNull();
      expect(report.fuentes.pagespeed).toBe("no_aplica");
      expect(report.fuentes.web).toBe("ok");
      expect(report.analisisLimitado).toBe(true);
    });

    it("sin web propia ni tráfico lanza InsufficientDataError aunque se leyera la página de otro", async () => {
      const noTraffic = fakeFetcher({
        "tranco-list.eu": () => Response.json({ ranks: [] }),
        "api.cloudflare.com": () => new Response("", { status: 404 }),
      });
      await expect(collect(acme, { ...baseDeps, getPage, fetcher: noTraffic })).rejects.toBeInstanceOf(InsufficientDataError);
    });
  });

  it("notion.so → notion.com (adoptado): la web sigue siendo propia y PageSpeed se usa", async () => {
    const getPage: PageGetter = async (url) =>
      url === "https://notion.so/"
        ? { url: "https://www.notion.com/", status: 200, headers: {}, text: `<html><head><title>Notion</title></head><body><a href="https://apps.apple.com/app/notion/id1232780281">App</a></body></html>` }
        : { url, status: 404, headers: {}, text: "" };
    const raw = await collect({ url: "https://notion.so/", domain: "notion.so" }, { ...baseDeps, getPage });
    expect(raw.site?.finalUrl).toBe("https://www.notion.com/");
    expect(raw.site?.hasAppLinks).toBe(true);
    expect(raw.foreignSite).toBeNull();
    expect(raw.pagespeed).toEqual({ mobile: 34, desktop: 34 });
    expect(raw.fuentes.pagespeed).toBe("ok");
    expect(raw.fuentes.tecnologias).toBe("ok");
  });
});
