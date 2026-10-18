import { describe, it, expect } from "vitest";
import { fetchPageSpeed, parsePageSpeed } from "../../lib/engine/sources/pagespeed";

const NOW = new Date("2026-10-18T00:00:00Z");

const categories = {
  performance: { score: 0.34 },
  accessibility: { score: 0.91 },
  "best-practices": { score: 0.83 },
  seo: { score: 1 },
};
const metrics = {
  LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2400 },
  INTERACTION_TO_NEXT_PAINT: { percentile: 180 },
  CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 8 },
};

describe("parsePageSpeed", () => {
  it("lee las 4 categorías en escala 0-100", () => {
    const r = parsePageSpeed({ lighthouseResult: { categories } });
    expect(r).toMatchObject({ performance: 34, accessibility: 91, bestPractices: 83, seo: 100, campo: null });
  });

  it("usa loadingExperience como campo de la URL", () => {
    const r = parsePageSpeed({
      lighthouseResult: { categories },
      loadingExperience: { metrics, overall_category: "AVERAGE" },
      originLoadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 9999 } }, overall_category: "SLOW" },
    });
    expect(r.campo).toEqual({ fuente: "url", lcpMs: 2400, inpMs: 180, cls: 0.08, categoria: "AVERAGE" });
  });

  it("recurre al origen si la URL no tiene datos", () => {
    const r = parsePageSpeed({
      lighthouseResult: { categories },
      loadingExperience: { id: "x" },
      originLoadingExperience: { metrics, overall_category: "FAST" },
    });
    expect(r.campo).toEqual({ fuente: "origen", lcpMs: 2400, inpMs: 180, cls: 0.08, categoria: "FAST" });
  });

  it("campo null si no hay datos, y valores ausentes como null", () => {
    expect(parsePageSpeed({ lighthouseResult: { categories } }).campo).toBeNull();
    const r = parsePageSpeed({
      lighthouseResult: { categories: { performance: { score: 0.5 } } },
      loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3000 } } },
    });
    expect(r.seo).toBeNull();
    expect(r.campo).toEqual({ fuente: "url", lcpMs: 3000, inpMs: null, cls: null, categoria: null });
  });
});

describe("fetchPageSpeed", () => {
  it("pide las 4 categorías en móvil y solo rendimiento en escritorio", async () => {
    const urls: string[] = [];
    const data = await fetchPageSpeed(
      "https://x.example/",
      async (url) => {
        urls.push(url);
        if (url.includes("strategy=desktop")) return Response.json({ lighthouseResult: { categories: { performance: { score: 0.9 } } } });
        return Response.json({ lighthouseResult: { categories }, loadingExperience: { metrics, overall_category: "FAST" } });
      },
      NOW,
      "KEY",
    );
    const mobile = urls.find((u) => u.includes("strategy=mobile"))!;
    const desktop = urls.find((u) => u.includes("strategy=desktop"))!;
    for (const c of ["performance", "accessibility", "best-practices", "seo"]) expect(mobile).toContain(`category=${c}`);
    expect(desktop).toContain("category=performance");
    expect(desktop).not.toContain("category=seo");
    expect(urls.every((u) => u.includes("key=KEY"))).toBe(true);
    expect(data).toEqual({
      mobile: 34, desktop: 90, accesibilidad: 91, buenasPracticas: 83, seo: 100,
      campo: { fuente: "url", lcpMs: 2400, inpMs: 180, cls: 0.08, categoria: "FAST" },
      obtenidoEn: NOW.toISOString(),
    });
  });

  it("tolera que falle escritorio", async () => {
    const data = await fetchPageSpeed("https://x.example/", async (url) =>
      url.includes("strategy=desktop") ? new Response("", { status: 500 }) : Response.json({ lighthouseResult: { categories } }), NOW);
    expect(data).toMatchObject({ mobile: 34, desktop: null, seo: 100 });
    expect(data.error).toBeUndefined();
  });

  it("móvil falla pero escritorio responde: conserva la nota y la puntuación", async () => {
    const data = await fetchPageSpeed("https://x.example/", async (url) =>
      url.includes("strategy=mobile") ? new Response("", { status: 429 }) : Response.json({ lighthouseResult: { categories: { performance: { score: 0.7 } } } }), NOW);
    expect(data).toMatchObject({ mobile: null, desktop: 70, seo: null });
    expect(data.error).toMatch(/^móvil no disponible: /);
  });

  it("error de cuota: devuelve error y puntuaciones null", async () => {
    const data = await fetchPageSpeed("https://x.example/", async () => new Response("quota", { status: 429 }), NOW);
    expect(data.error).toMatch(/cuota|429/i);
    expect(data).toMatchObject({ mobile: null, desktop: null, accesibilidad: null, buenasPracticas: null, seo: null, campo: null });
  });

  it("lanza error si fallan ambos por otra causa", async () => {
    await expect(fetchPageSpeed("https://x.example/", async () => new Response("", { status: 500 }), NOW)).rejects.toThrow();
  });
});
