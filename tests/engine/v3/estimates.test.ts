import { describe, it, expect } from "vitest";
import { computeAnchors } from "../../../lib/engine/anchors";
import {
  estimarTrafico,
  estimarIngresosMensuales,
  estimarValoracion,
  metricasSeo,
  datosPublicados,
  parsearPrecioEur,
} from "../../../lib/engine/v3/estimates";
import { buildEvidence } from "../../../lib/engine/v3/evidence";
import { makeRaw } from "../raw-fixture";

const NOW = new Date("2026-10-18T00:00:00Z");

describe("estimarTrafico", () => {
  it("usa la tabla de rankings con su confianza", () => {
    const raw = makeRaw({ tranco: { rank: 5000, trend: "estable" }, radar: { bucket: 10000, rank: null } });
    const e = estimarTrafico(computeAnchors(raw, NOW));
    expect(e.valor).toEqual({ min: 5_000_000, max: 50_000_000 });
    expect(e.unidad).toBe("visitas/mes");
    expect(e.confianza).toBe("media");
    expect(e.fuente).toMatch(/Tranco/);
    expect(e.metodologia.length).toBeGreaterThan(10);
  });

  it("es no estimable sin ranking", () => {
    const e = estimarTrafico(computeAnchors(makeRaw({ tranco: null, radar: null }), NOW));
    expect(e.valor).toBeNull();
    expect(e.motivoNoEstimable).toMatch(/ranking/i);
  });
});

describe("parsearPrecioEur", () => {
  it("convierte a euros", () => {
    expect(parsearPrecioEur("9 €")).toBe(9);
    expect(parsearPrecioEur("$100")).toBeCloseTo(92);
    expect(parsearPrecioEur("1.200 €")).toBe(1200);
    expect(parsearPrecioEur("9,99 €")).toBeCloseTo(9.99);
    expect(parsearPrecioEur("gratis")).toBeNull();
  });
});

describe("estimarIngresosMensuales", () => {
  it("teb-like (servicios, sin precios ni Wikidata): no estimable con motivo en español", () => {
    const raw = makeRaw({ tranco: null, radar: null });
    const ing = estimarIngresosMensuales(raw, computeAnchors(raw, NOW), "servicios", []);
    expect(ing.valor).toBeNull();
    expect(ing.motivoNoEstimable).toMatch(/[a-z]{4}/i);
    const val = estimarValoracion(ing, "servicios");
    expect(val.valor).toBeNull();
    expect(val.motivoNoEstimable).toBeTruthy();
  });

  it("saas con tráfico y precios: rango según la fórmula, confianza baja", () => {
    const raw = makeRaw({ tranco: { rank: 5000, trend: "estable" }, radar: null });
    const anchors = computeAnchors(raw, NOW);
    const ing = estimarIngresosMensuales(raw, anchors, "saas", ["9 €", "29 €"]);
    // mediana de 9 y 29 = 19; visitas 5M-50M; conversión 2-5 %
    expect(ing.valor).toEqual({ min: 5_000_000 * 0.02 * 19, max: 50_000_000 * 0.05 * 19 });
    expect(ing.confianza).toBe("baja");
    expect(ing.unidad).toBe("€/mes");
    expect(ing.metodologia).toMatch(/conversión/i);
  });

  it("con ingresos de Wikidata usa el ancla / 12 con confianza alta", () => {
    const raw = makeRaw({
      wikidata: { id: "Q1", description: null, inception: 2000, founders: [], headquarters: null, employees: null, employeesYear: null, revenue: { amount: 12_000_000, currency: "EUR", year: 2024 } },
    });
    const ing = estimarIngresosMensuales(raw, computeAnchors(raw, NOW), "servicios", []);
    const v = ing.valor as { min: number; max: number };
    expect(v.min).toBeCloseTo(900_000, -2);
    expect(v.max).toBeCloseTo(1_100_000, -2);
    expect(ing.confianza).toBe("alta");
    expect(ing.fuente).toMatch(/Wikidata/);
  });

  it("sin precios válidos no estima aunque haya tráfico", () => {
    const raw = makeRaw();
    const ing = estimarIngresosMensuales(raw, computeAnchors(raw, NOW), "saas", ["gratis"]);
    expect(ing.valor).toBeNull();
    expect(ing.motivoNoEstimable).toMatch(/precio/i);
  });
});

describe("estimarValoracion", () => {
  it("multiplica ingresos anuales por el múltiplo y no supera la confianza de los ingresos", () => {
    const raw = makeRaw({ tranco: { rank: 5000, trend: "estable" }, radar: null });
    const ing = estimarIngresosMensuales(raw, computeAnchors(raw, NOW), "saas", ["9 €", "29 €"]);
    const val = estimarValoracion(ing, "saas");
    const r = ing.valor as { min: number; max: number };
    expect(val.valor).toEqual({ min: r.min * 12 * 3, max: r.max * 12 * 8 });
    expect(val.confianza).toBe("baja");
  });

  it("con ingresos de confianza alta, la valoración queda en media como máximo", () => {
    const raw = makeRaw({
      wikidata: { id: "Q1", description: null, inception: null, founders: [], headquarters: null, employees: null, employeesYear: null, revenue: { amount: 12_000_000, currency: "EUR", year: null } },
    });
    const ing = estimarIngresosMensuales(raw, computeAnchors(raw, NOW), "ecommerce", []);
    const val = estimarValoracion(ing, "ecommerce");
    expect(val.confianza).toBe("media");
    expect(val.valor).not.toBeNull();
  });

  it("tipo sin múltiplo de referencia: no estimable", () => {
    const raw = makeRaw({
      wikidata: { id: "Q1", description: null, inception: null, founders: [], headquarters: null, employees: null, employeesYear: null, revenue: { amount: 12_000_000, currency: "EUR", year: null } },
    });
    const ing = estimarIngresosMensuales(raw, computeAnchors(raw, NOW), "servicios", []);
    const val = estimarValoracion(ing, "servicios");
    expect(val.valor).toBeNull();
    expect(val.motivoNoEstimable).toMatch(/múltiplo/i);
  });
});

describe("metricasSeo", () => {
  it("cuenta títulos y descripciones de las páginas leídas", () => {
    const raw = makeRaw({
      sitemap: { urlCount: 120, sections: ["blog"], languages: ["es"], lastModified: "2026-10-01", recentBlogPosts: 2, complete: false, candidatas: [] },
      paginas: [
        { id: "p1", url: "https://facturo.example/", titulo: "Inicio", tieneDescripcion: true, extractos: [] },
        { id: "p2", url: "https://facturo.example/a", titulo: "", tieneDescripcion: false, extractos: [] },
        { id: "p3", url: "https://facturo.example/b", titulo: "B", tieneDescripcion: false, extractos: [] },
      ],
    });
    expect(metricasSeo(raw)).toEqual({
      paginasSitemap: 120,
      sitemapCompleto: false,
      pagespeedMovil: 90,
      titulosYDescripciones: { conTitulo: 2, conDescripcion: 1, total: 3 },
      idiomas: ["es", "en"],
      blogActivo: true,
    });
  });

  it("sin datos devuelve nulos y ceros", () => {
    const m = metricasSeo(makeRaw({ site: null, pagespeed: null }));
    expect(m).toMatchObject({ paginasSitemap: null, sitemapCompleto: false, pagespeedMovil: null, blogActivo: null });
    expect(m.titulosYDescripciones).toEqual({ conTitulo: 0, conDescripcion: 0, total: 0 });
  });
});

describe("datosPublicados", () => {
  it("cada dato apunta a un id dato:* del registro de evidencias", () => {
    const raw = makeRaw({
      wikidata: { id: "Q1", description: null, inception: 2012, founders: [], headquarters: "Madrid", employees: 80, employeesYear: 2024, revenue: null },
    });
    const datos = datosPublicados(raw);
    const reg = buildEvidence(raw, []);
    expect(datos.length).toBeGreaterThanOrEqual(3);
    for (const d of datos) {
      expect(d.evidencia).toMatch(/^dato:/);
      expect(reg.has(d.evidencia)).toBe(true);
      expect(d.etiqueta && d.valor && d.fuente).toBeTruthy();
    }
    expect(datos.find((d) => d.evidencia === "dato:fundacion")?.valor).toMatch(/2012/);
  });
});
