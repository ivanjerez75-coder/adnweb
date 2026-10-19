import { describe, it, expect } from "vitest";
import { analyze, depsFromEnv } from "../../lib/engine/analyze";
import { buildReport, clampIngresos } from "../../lib/engine/report";
import { InvalidUrlError } from "../../lib/engine/url";
import { fakeFetcher, fakeGetPage, NOW } from "./fake-network";
import { validAiOutput } from "./ai-fixture";
import { makeRaw, makeSite, ps } from "./raw-fixture";
import type { JsonModel } from "../../lib/engine/ai/providers";

const fakeModel: JsonModel = { name: "fake", generate: async () => JSON.stringify(validAiOutput) };

describe("buildReport", () => {
  const raw = makeRaw({
    site: makeSite({ hasAppLinks: false }),
    pagespeed: ps(30, 90),
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
      antiguedadDominioAnios: 11,
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

  it("informa de la redirección y de si se adoptó el dominio final", async () => {
    expect((await buildReport(raw, { models: [fakeModel], now: () => NOW })).redireccion).toBeNull();
    const foreign = makeRaw({ finalDomain: "instagram.com", companyNameFromPage: false });
    expect((await buildReport(foreign, { models: [fakeModel], now: () => NOW })).redireccion).toEqual({ a: "instagram.com", adoptada: false });
    const adopted = makeRaw({ domain: "notion.so", rootDomain: "notion.com", finalDomain: "notion.com" });
    expect((await buildReport(adopted, { models: [fakeModel], now: () => NOW })).redireccion).toEqual({ a: "notion.com", adoptada: true });
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

describe("clampIngresos", () => {
  const base = validAiOutput.ingresos;
  const traffic = { visitasMes: { min: 500_000, max: 5_000_000 }, confianzaTrafico: "media" as const };

  it("deja intactos unos ingresos coherentes", () => {
    expect(clampIngresos(base, traffic)).toEqual(base);
  });

  it("anula las cifras y baja la confianza si no hay tráfico estimado", () => {
    const out = clampIngresos({ ...base, confianza: "alta" }, { visitasMes: null, confianzaTrafico: "baja" });
    expect(out).toEqual({
      ...base,
      anualMin: null,
      anualMax: null,
      valoracionMin: null,
      valoracionMax: null,
      confianza: "baja",
    });
  });

  it("descarta valores negativos", () => {
    const out = clampIngresos({ ...base, anualMin: -10, valoracionMax: -1 }, traffic);
    expect(out.anualMin).toBeNull();
    expect(out.anualMax).toBe(base.anualMax);
    expect(out.valoracionMin).toBe(base.valoracionMin);
    expect(out.valoracionMax).toBeNull();
  });

  it("intercambia mínimo y máximo si vienen al revés", () => {
    const out = clampIngresos({ ...base, anualMin: 900, anualMax: 100, valoracionMin: 50, valoracionMax: 10 }, traffic);
    expect(out).toMatchObject({ anualMin: 100, anualMax: 900, valoracionMin: 10, valoracionMax: 50 });
  });

  it("limita la confianza a la del tráfico", () => {
    expect(clampIngresos({ ...base, confianza: "alta" }, traffic).confianza).toBe("media");
    expect(clampIngresos({ ...base, confianza: "alta" }, { ...traffic, confianzaTrafico: "baja" }).confianza).toBe("baja");
    expect(clampIngresos({ ...base, confianza: "baja" }, traffic).confianza).toBe("baja");
    expect(clampIngresos({ ...base, confianza: "media" }, { ...traffic, confianzaTrafico: "alta" }).confianza).toBe("media");
  });

  it("se aplica en buildReport", async () => {
    const ai = { ...validAiOutput, ingresos: { ...validAiOutput.ingresos, confianza: "alta" as const, anualMin: 5, anualMax: -3 } };
    const model: JsonModel = { name: "fake", generate: async () => JSON.stringify(ai) };
    const report = await buildReport(makeRaw({ tranco: null, radar: null }), { models: [model], now: () => NOW });
    expect(report.ingresos).toMatchObject({ anualMin: null, anualMax: null, valoracionMin: null, valoracionMax: null, confianza: "baja" });
    const withTraffic = await buildReport(makeRaw({ radar: null }), { models: [model], now: () => NOW });
    expect(withTraffic.ingresos).toMatchObject({ anualMin: 5, anualMax: null, confianza: "baja" });
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
    const deps = depsFromEnv({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q", GROQ_MODEL: "m" } as unknown as NodeJS.ProcessEnv);
    expect(deps.models.map((m) => m.name)).toEqual(["gemini:gemini-3.5-flash", "gemini:gemini-flash-lite-latest", "groq:m"]);
    expect(deps.radarToken).toBeUndefined();
  });
});
