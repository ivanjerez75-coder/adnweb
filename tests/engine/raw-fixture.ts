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
    companyName: "Facturo",
    jobBoards: [],
    appStoreIds: [],
    ...overrides,
  };
}

export function makeRaw(overrides: Partial<RawData> = {}): RawData {
  return {
    url: "https://facturo.example/",
    domain: "facturo.example",
    rootDomain: "facturo.example",
    finalDomain: null,
    companyNameFromPage: true,
    collectedAt: "2026-10-14T00:00:00.000Z",
    site: makeSite(),
    foreignSite: null,
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
    paginas: null,
    version: 3,
    fuentes: {
      web: "ok", tecnologias: "ok", tranco: "ok", radar: "ok", pagespeed: "ok", rdap: "ok", wayback: "ok",
      sitemap: "no_aplica", rutas: "fallo", empleo: "no_aplica", appstore: "no_aplica", wikidata: "no_aplica", dns: "fallo", hackernews: "fallo", paginas: "no_aplica",
    },
    unavailable: [],
    ...overrides,
  };
}
