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
    expect(ids(raw)).not.toContain("fuera_top_1m");
  });

  it("no inventa señales de fuentes no disponibles", () => {
    expect(ids(makeRaw({ site: null, pagespeed: null, tranco: null, radar: null, wayback: null, rdap: null }))).toEqual([]);
  });
});

describe("extractSignals — fechas y umbrales", () => {
  it("dominio con fecha futura no es reciente", () => {
    expect(ids(makeRaw({ rdap: { registeredAt: "2030-01-01" } }))).not.toContain("dominio_reciente");
  });

  const emp = (n: number) => makeRaw({ empleo: { platform: "lever", token: "f", openings: n, byArea: {}, linkedFromSite: false } });
  const app = (rating: number, ratingCount: number) =>
    makeRaw({ appstore: { name: "F", rating, ratingCount, url: "u", linkedFromSite: true } });
  const wd = (employees: number) =>
    makeRaw({ wikidata: { id: "Q1", description: null, inception: null, founders: [], headquarters: null, employees, revenue: null } });
  const cases: [string, RawData, string, boolean][] = [
    ["4 ofertas", emp(4), "contratando", false],
    ["5 ofertas", emp(5), "contratando", true],
    ["29 ofertas contratando", emp(29), "contratando", true],
    ["29 ofertas no fuerte", emp(29), "contratacion_fuerte", false],
    ["30 ofertas", emp(30), "contratacion_fuerte", true],
    ["tranco 10000", makeRaw({ tranco: { rank: 10_000, trend: null } }), "trafico_alto", true],
    ["tranco 10001", makeRaw({ tranco: { rank: 10_001, trend: null } }), "trafico_alto", false],
    ["app 4.3", app(4.3, 1000), "app_valorada", true],
    ["app 4.2", app(4.2, 1000), "app_valorada", false],
    ["app 3.4/100", app(3.4, 100), "app_mal_valorada", true],
    ["app 3.4/99", app(3.4, 99), "app_mal_valorada", false],
    ["app 3.5/500", app(3.5, 500), "app_mal_valorada", false],
    ["3 posts", makeRaw({ sitemap: sitemap({ recentBlogPosts: 3 }) }), "blog_activo", false],
    ["4 posts", makeRaw({ sitemap: sitemap({ recentBlogPosts: 4 }) }), "blog_activo", true],
    ["móvil 89", makeRaw({ pagespeed: { mobile: 89, desktop: 90 } }), "web_rapida", false],
    ["móvil 90", makeRaw({ pagespeed: { mobile: 90, desktop: 90 } }), "web_rapida", true],
    ["199 empleados", wd(199), "plantilla_grande", false],
    ["200 empleados", wd(200), "plantilla_grande", true],
    ["HN 19", makeRaw({ hackernews: { total: 19, lastYear: 0, top: null } }), "notoriedad_tech", false],
    ["HN 20", makeRaw({ hackernews: { total: 20, lastYear: 0, top: null } }), "notoriedad_tech", true],
  ];
  it.each(cases)("%s", (_n, raw, id, expected) => {
    expect(ids(raw).includes(id)).toBe(expected);
  });
});

describe("allTechnologies", () => {
  it("une web y DNS sin duplicar por nombre", () => {
    const raw = makeRaw({ dns: { emailProvider: "Otro", tools: [{ name: "Mailchimp", category: "email" }, { name: "Salesforce", category: "ventas" }] } });
    expect(allTechnologies(raw).map((t) => t.name)).toEqual(["Google Analytics", "Intercom", "Mailchimp", "Salesforce"]);
  });
});
