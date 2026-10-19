import { describe, it, expect } from "vitest";
import {
  construirMetricas,
  escenarioIngresos,
  preciosPublicados,
  parsearPrecio,
  type Metrica,
} from "../../../lib/engine/v3/estimates";
import { makeRaw, makeSite, ps } from "../raw-fixture";

const NOW = new Date("2026-10-18T00:00:00Z");
const get = (ms: Metrica[], clave: string) => {
  const m = ms.find((x) => x.clave === clave);
  if (!m) throw new Error(`falta ${clave}`);
  return m;
};
const wd = (revenue: { amount: number; currency: string; year: number | null } | null) => ({
  id: "Q1", description: null, inception: null, founders: [], headquarters: null, employees: null, employeesYear: null, revenue,
});
const CLAVES = [
  "visitas_mensuales", "popularidad_tranco", "popularidad_radar", "usuarios_reales_crux", "ingresos_publicados", "valoracion",
  "pagespeed_movil", "pagespeed_escritorio", "accesibilidad", "seo_tecnico", "buenas_practicas",
  "paginas_sitemap", "titulos_descripciones", "idiomas", "blog_activo",
];

describe("parsearPrecio", () => {
  it("conserva moneda, importe y periodicidad", () => {
    expect(parsearPrecio("29 €/mes")).toMatchObject({ importe: 29, moneda: "EUR", periodicidad: "mes" });
    expect(parsearPrecio("$100 per month")).toMatchObject({ importe: 100, moneda: "USD", periodicidad: "mes" });
    expect(parsearPrecio("290 € al año")).toMatchObject({ importe: 290, periodicidad: "año" });
    expect(parsearPrecio("1.200 € anual")).toMatchObject({ importe: 1200, periodicidad: "año" });
    expect(parsearPrecio("9,99 €")).toMatchObject({ importe: 9.99, periodicidad: null });
    expect(parsearPrecio("gratis")).toBeNull();
  });
});

describe("construirMetricas: sin datos publicados (teb-like)", () => {
  const raw = makeRaw({ tranco: null, radar: null, site: makeSite({ pricesFound: [] }) });
  const ms = construirMetricas(raw, NOW);

  it("siempre incluye todas las métricas, sin omitir ninguna", () => {
    for (const c of CLAVES) expect(ms.some((m) => m.clave === c)).toBe(true);
    expect(new Set(ms.map((m) => m.clave)).size).toBe(ms.length);
  });
  it("visitas mensuales: nunca un número", () => {
    const v = get(ms, "visitas_mensuales");
    expect(v).toMatchObject({ valor: null, estado: "insuficiente", confianza: "insuficiente" });
    expect(v.metodologia + v.motivoConfianza).toMatch(/No hay datos fiables disponibles/);
  });
  it("ingresos insuficientes y sin escenario", () => {
    expect(get(ms, "ingresos_publicados")).toMatchObject({ valor: null, estado: "insuficiente" });
    expect(ms.some((m) => m.clave === "escenario_ingresos")).toBe(false);
  });
  it("valoración no estimable", () => {
    const v = get(ms, "valoracion");
    expect(v.estado).toBe("no_aplica");
    expect(v.valor).toBeNull();
    expect(JSON.stringify(v)).toContain("No estimable con los datos disponibles");
  });
  it("Tranco y Radar sin dato: insuficiente", () => {
    expect(get(ms, "popularidad_tranco").estado).toBe("insuficiente");
    expect(get(ms, "popularidad_radar").estado).toBe("insuficiente");
  });
});

describe("construirMetricas: popularidad", () => {
  it("Tranco puesto 50000: observado, alta, no mide visitas", () => {
    const m = get(construirMetricas(makeRaw({ tranco: { rank: 50_000, trend: "sube" } }), NOW), "popularidad_tranco");
    expect(m).toMatchObject({ valor: 50_000, unidad: "puesto", tipo: "observado", confianza: "alta", estado: "disponible" });
    expect(m.limitaciones.join(" ")).toContain("No mide visitas");
    expect(m.fuente).toMatch(/Tranco/);
  });
  it("Radar con franja: observado y no mide visitas", () => {
    const m = get(construirMetricas(makeRaw({ radar: { bucket: 10_000, rank: null } }), NOW), "popularidad_radar");
    expect(m).toMatchObject({ tipo: "observado", confianza: "alta", estado: "disponible" });
    expect(m.limitaciones.join(" ")).toContain("No mide visitas");
  });
});

describe("construirMetricas: CrUX y PageSpeed", () => {
  it("con campo: usuarios reales observados", () => {
    const raw = makeRaw({
      pagespeed: { ...ps(80, 90), campo: { fuente: "origen", lcpMs: 2400, inpMs: 180, cls: 0.05, categoria: "FAST" } },
    });
    const m = get(construirMetricas(raw, NOW), "usuarios_reales_crux");
    expect(m).toMatchObject({ tipo: "observado", confianza: "alta", estado: "disponible" });
    expect(String(m.valor)).toMatch(/2400/);
    expect(m.limitaciones.join(" ")).toMatch(/visitas/i);
  });
  it("sin campo: insuficiente", () => {
    expect(get(construirMetricas(makeRaw(), NOW), "usuarios_reales_crux").estado).toBe("insuficiente");
  });
  it("puntuaciones disponibles", () => {
    const raw = makeRaw({ pagespeed: { ...ps(80, 90), accesibilidad: 95, buenasPracticas: 100, seo: 88 } });
    const ms = construirMetricas(raw, NOW);
    expect(get(ms, "pagespeed_movil")).toMatchObject({ valor: 80, unidad: "/100", tipo: "observado", confianza: "alta" });
    expect(get(ms, "pagespeed_escritorio").valor).toBe(90);
    expect(get(ms, "accesibilidad").valor).toBe(95);
    expect(get(ms, "seo_tecnico").valor).toBe(88);
    expect(get(ms, "buenas_practicas").valor).toBe(100);
  });
  it("error de PageSpeed: todas sus métricas con estado error y motivo", () => {
    const raw = makeRaw({ pagespeed: { ...ps(null, null), error: "cuota agotada" } });
    const ms = construirMetricas(raw, NOW);
    for (const c of ["pagespeed_movil", "pagespeed_escritorio", "accesibilidad", "seo_tecnico", "buenas_practicas", "usuarios_reales_crux"]) {
      const m = get(ms, c);
      expect(m.estado).toBe("error");
      expect(m.valor).toBeNull();
      expect(m.motivoConfianza).toBe("Cuota de PageSpeed agotada");
    }
  });
  it("móvil falla y escritorio responde: escritorio disponible; nunca se muestra el error en bruto", () => {
    const raw = makeRaw({ pagespeed: { ...ps(null, 92), error: "móvil no disponible: PageSpeed respondió 500" } });
    const ms = construirMetricas(raw, NOW);
    expect(get(ms, "pagespeed_escritorio")).toMatchObject({ estado: "disponible", valor: 92 });
    for (const c of ["pagespeed_movil", "accesibilidad", "seo_tecnico", "buenas_practicas", "usuarios_reales_crux"]) {
      const m = get(ms, c);
      expect(m.estado, c).toBe("error");
      expect(m.motivoConfianza, c).toBe("PageSpeed no respondió");
    }
    for (const m of ms) expect(m.motivoConfianza).not.toMatch(/respondió 500|móvil no disponible/);
  });
  it("cada métrica depende de su propio valor, no del campo error", () => {
    const raw = makeRaw({ pagespeed: { ...ps(70, 90), seo: 85, error: "algo raro" } });
    const ms = construirMetricas(raw, NOW);
    expect(get(ms, "pagespeed_movil")).toMatchObject({ estado: "disponible", valor: 70 });
    expect(get(ms, "seo_tecnico")).toMatchObject({ estado: "disponible", valor: 85 });
    expect(get(ms, "accesibilidad").motivoConfianza).toBe("PageSpeed no respondió");
  });
  it("pagespeed ausente: nunca omitida", () => {
    const ms = construirMetricas(makeRaw({ pagespeed: null }), NOW);
    expect(get(ms, "pagespeed_movil").valor).toBeNull();
    expect(get(ms, "pagespeed_movil").estado).not.toBe("disponible");
  });
});

describe("construirMetricas: ingresos publicados", () => {
  const ing = (year: number | null) =>
    get(construirMetricas(makeRaw({ wikidata: wd({ amount: 12_000_000, currency: "EUR", year }) }), NOW), "ingresos_publicados");
  it("reciente (≤ 2 años): alta, con año y moneda originales", () => {
    const m = ing(2025);
    expect(m).toMatchObject({ valor: 12_000_000, tipo: "observado", confianza: "alta", estado: "disponible", periodo: "2025" });
    expect(m.unidad).toContain("EUR");
    expect(m.fuente).toMatch(/Wikidata/);
  });
  it("de hace 3 años: media", () => expect(ing(2023).confianza).toBe("media"));
  it("de hace 5 años: media; de hace 6: baja", () => {
    expect(ing(2021).confianza).toBe("media");
    expect(ing(2020).confianza).toBe("baja");
  });
  it("sin año: baja", () => expect(ing(null).confianza).toBe("baja"));
  it("conserva la moneda original", () => {
    const m = get(construirMetricas(makeRaw({ wikidata: wd({ amount: 5_000_000, currency: "USD", year: 2025 }) }), NOW), "ingresos_publicados");
    expect(m.valor).toBe(5_000_000);
    expect(m.unidad).toContain("USD");
  });
});

describe("precios y escenario", () => {
  const rawPrecios = (pricesFound: string[]) => makeRaw({ site: makeSite({ pricesFound }) });

  it("preciosPublicados: importe, moneda, periodicidad, url y texto", () => {
    const p = preciosPublicados(rawPrecios(["29 €/mes", "290 €/año", "gratis"]));
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ importe: 29, moneda: "EUR", periodicidad: "mes", texto: "29 €/mes", plan: null });
    expect(p[0].url).toMatch(/^https:\/\//);
    expect(p[1]).toMatchObject({ importe: 290, periodicidad: "año" });
  });

  it("escenarioIngresos: mediana mensual de 29 €/mes y 290 €/año", () => {
    const e = escenarioIngresos(preciosPublicados(rawPrecios(["29 €/mes", "290 €/año"])))!;
    expect(e.map((x) => x.clientes)).toEqual([100, 500, 1000]);
    expect(e.map((x) => x.ingresosMes)).toEqual([2658, 13292, 26583]);
  });
  it("null sin precios", () => expect(escenarioIngresos([])).toBeNull());

  it("métrica escenario_ingresos: hipotética con texto fijo y supuestos", () => {
    const ms = construirMetricas(rawPrecios(["29 €/mes", "290 €/año"]), NOW);
    const m = get(ms, "escenario_ingresos");
    expect(m.tipo).toBe("hipotetico");
    expect(m.limitaciones).toContain("Escenario ilustrativo: no son los ingresos de la empresa");
    expect(m.supuestos.length).toBeGreaterThan(0);
    expect(m.supuestos.join(" ")).not.toMatch(/periodicidad desconocida/);
  });
  it("periodicidad desconocida se declara como supuesto", () => {
    const raw = rawPrecios(["desde 9 €"]);
    const m = get(construirMetricas(raw, NOW), "escenario_ingresos");
    expect(m.supuestos).toContain("periodicidad desconocida: se trata como mensual");
    expect(escenarioIngresos(preciosPublicados(raw))![0].ingresosMes).toBe(900);
  });
});

describe("construirMetricas: SEO", () => {
  it("sitemap, títulos, idiomas y blog", () => {
    const raw = makeRaw({
      sitemap: { urlCount: 120, sections: ["blog"], languages: ["es"], lastModified: "2026-10-01", recentBlogPosts: 2, complete: false, candidatas: [] },
      paginas: [
        { id: "p1", url: "https://facturo.example/", titulo: "Inicio", tieneDescripcion: true, extractos: [] },
        { id: "p2", url: "https://facturo.example/a", titulo: "", tieneDescripcion: false, extractos: [] },
      ],
    });
    const ms = construirMetricas(raw, NOW);
    expect(get(ms, "paginas_sitemap")).toMatchObject({ valor: 120, estado: "disponible" });
    expect(get(ms, "paginas_sitemap").limitaciones.join(" ")).toMatch(/al menos|incompleto/i);
    expect(String(get(ms, "titulos_descripciones").valor)).toMatch(/1.*2/);
    expect(String(get(ms, "idiomas").valor)).toMatch(/es/);
    expect(get(ms, "blog_activo")).toMatchObject({ valor: "Sí", estado: "disponible" });
  });
  it("sin sitemap ni páginas: insuficiente", () => {
    const ms = construirMetricas(makeRaw({ sitemap: null, paginas: null, site: null }), NOW);
    for (const c of ["paginas_sitemap", "titulos_descripciones", "idiomas", "blog_activo"]) {
      expect(get(ms, c)).toMatchObject({ valor: null, estado: "insuficiente" });
    }
  });
});

describe("inferirAnuales", () => {
  it("interpreta como anual un precio sin periodicidad ~10-12 veces otro de su moneda", async () => {
    const { inferirAnuales, escenarioIngresos } = await import("../../../lib/engine/v3/estimates");
    const base = { plan: null, url: "https://x.example/pricing" };
    const precios = inferirAnuales([
      { ...base, importe: 29, moneda: "USD", periodicidad: null, texto: "$29" },
      { ...base, importe: 290, moneda: "USD", periodicidad: null, texto: "$290" },
      { ...base, importe: 20, moneda: "EUR", periodicidad: null, texto: "€20" },
    ]);
    expect(precios.map((p) => p.periodicidad)).toEqual([null, "año", null]);
    expect(precios[1].periodicidadInferida).toBe(true);
    const sinInferir = escenarioIngresos([{ ...base, importe: 29, moneda: "USD", periodicidad: null, texto: "$29" }, { ...base, importe: 290, moneda: "USD", periodicidad: null, texto: "$290" }]);
    const inferido = escenarioIngresos(precios.slice(0, 2));
    expect(inferido![0].ingresosMes).toBeLessThan(sinInferir![0].ingresosMes);
  });
});
