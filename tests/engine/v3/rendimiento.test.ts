import { describe, it, expect } from "vitest";
import {
  generarRendimiento,
  interpretarDimensiones,
  interpretarMetrica,
  noSePuedeSaberPorTipo,
  pulidoValido,
} from "../../../lib/engine/v3/sections/rendimiento";
import { BACKLINKS_ITEM } from "../../../lib/engine/v3/sections/comun";
import { construirMetricas } from "../../../lib/engine/v3/estimates";
import { contieneCifraNoRespaldada } from "../../../lib/engine/v3/filtro";
import type { DnaScore } from "../../../lib/engine/v3/score";
import { makeRaw } from "../raw-fixture";
import { anatomiaBase, fakeModel } from "./fixtures-v4";

const raw = makeRaw({
  pagespeed: { mobile: 64, desktop: 93, accesibilidad: 41, buenasPracticas: 78, seo: 85, campo: null, obtenidoEn: "2026-10-14T00:00:00.000Z" },
  tranco: { rank: 123456 } as never,
});
const metricas = construirMetricas(raw, new Date("2026-10-18T10:00:00.000Z"));
const score = { global: 70, dimensiones: [] } as unknown as DnaScore;
const anatomia = anatomiaBase(["saas"]);
const numeros = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

describe("interpretaciones de código", () => {
  it("nunca hablan de ventas ni de clientes perdidos ni dan cifras distintas del valor de la métrica", () => {
    let vistas = 0;
    for (const m of metricas) {
      const t = interpretarMetrica(m);
      if (!t) continue;
      vistas++;
      expect(t).not.toMatch(/ventas|clientes perdidos|clientes/i);
      expect(contieneCifraNoRespaldada(t)).toBe(false);
      const propias = new Set([...numeros(String(typeof m.valor === "object" && m.valor ? `${m.valor.min} ${m.valor.max}` : m.valor)), "100"]);
      for (const n of numeros(t)) expect(propias.has(n), `${m.clave}: ${t}`).toBe(true);
    }
    expect(vistas).toBeGreaterThan(5);
  });

  it("móvil por debajo de lo recomendable se dice con su propio valor", () => {
    const m = metricas.find((x) => x.clave === "pagespeed_movil")!;
    expect(interpretarMetrica(m)).toContain("64/100");
    expect(interpretarMetrica(m)).toContain("conviene revisarlo");
  });

  it("las visitas siempre dicen que no hay datos fiables", () => {
    const d = interpretarDimensiones(raw, metricas).find((x) => x.clave === "trafico")!;
    expect(d.interpretacion).toContain("No hay datos fiables disponibles");
    expect(d.metricas).toContain("visitas_mensuales");
  });

  it("cinco dimensiones en orden; adquisición lista canales observables", () => {
    const dims = interpretarDimensiones(raw, metricas);
    expect(dims.map((d) => d.clave)).toEqual(["trafico", "seo", "tecnico", "experiencia", "adquisicion"]);
    const adq = dims.find((d) => d.clave === "adquisicion")!;
    expect(adq.canales?.map((c) => c.tipo)).toContain("redes");
    for (const d of dims) expect(d.interpretacion.length).toBeGreaterThan(0);
  });

  it("sin métricas, la dimensión dice que no hay datos", () => {
    const d = interpretarDimensiones(raw, []).find((x) => x.clave === "tecnico")!;
    expect(d.interpretacion).toBe("No hay datos suficientes para interpretar esta dimensión.");
    expect(d.metricas).toEqual([]);
  });
});

describe("pulidoValido", () => {
  const base = "La web tarda en móvil más de lo recomendable (64/100 en PageSpeed).";
  it("acepta un texto sin cifras nuevas", () => {
    expect(pulidoValido("En móvil la web va lenta (64/100).", base)).toBe("En móvil la web va lenta (64/100).");
  });
  it("rechaza cifras nuevas, ventas y porcentajes", () => {
    expect(pulidoValido("En móvil va lenta: 64/100, peor que el 70 de la media.", base)).toBeNull();
    expect(pulidoValido("Esto le hace perder ventas.", base)).toBeNull();
    expect(pulidoValido("Mejorará un 20 %.", base)).toBeNull();
  });
});

describe("generarRendimiento", () => {
  it("sin IA usa el texto de código y la lista por tipología con backlinks al final", async () => {
    const { deps } = fakeModel("FAIL");
    const r = await generarRendimiento(raw, metricas, anatomia, score, deps);
    expect(r.score).toBe(score);
    expect(r.dimensiones).toEqual(interpretarDimensiones(raw, metricas));
    expect(r.noSePuedeSaber).toEqual(noSePuedeSaberPorTipo(["saas"]));
    expect(r.noSePuedeSaber.at(-1)).toBe(BACKLINKS_ITEM);
  });

  it("una sola llamada de IA; usa el pulido válido y descarta el que añade cifras", async () => {
    const { deps, prompts } = fakeModel({
      interpretaciones: { tecnico: "En móvil la web va lenta (64/100) y en escritorio rápida (93/100).", seo: "El SEO está al 99/100." },
      noSePuedeSaber: ["Margen real (p3, p4)", "Factura unos 2 M€ al año", "No se conoce el churn", BACKLINKS_ITEM],
    });
    const r = await generarRendimiento(raw, metricas, anatomia, Promise.resolve(score), deps);
    expect(prompts).toHaveLength(1);
    const base = interpretarDimensiones(raw, metricas);
    expect(r.dimensiones.find((d) => d.clave === "tecnico")!.interpretacion).toBe("En móvil la web va lenta (64/100) y en escritorio rápida (93/100).");
    expect(r.dimensiones.find((d) => d.clave === "seo")!.interpretacion).toBe(base.find((d) => d.clave === "seo")!.interpretacion);
    expect(r.noSePuedeSaber).toEqual(["Margen real", "No se conoce el churn", BACKLINKS_ITEM]);
  });

  it("recorta noSePuedeSaber a 8 con backlinks una sola vez", async () => {
    const items = Array.from({ length: 12 }, (_, i) => `Cosa ${String.fromCharCode(65 + i)}`);
    const { deps } = fakeModel({ interpretaciones: {}, noSePuedeSaber: items });
    const r = await generarRendimiento(raw, metricas, anatomia, score, deps);
    expect(r.noSePuedeSaber).toHaveLength(8);
    expect(r.noSePuedeSaber.filter((x) => x === BACKLINKS_ITEM)).toHaveLength(1);
  });

  it("experiencia recibe las fricciones del diagnóstico (siempre potenciales)", async () => {
    const { deps } = fakeModel({ interpretaciones: { experiencia: "Texto pulido." }, noSePuedeSaber: [] });
    const fr = [{ id: "x1", tipo: "pasos", texto: "Hay que pasar por muchos pasos", potencial: true as const }];
    const r = await generarRendimiento(raw, metricas, anatomia, score, deps, Promise.resolve(fr));
    const exp = r.dimensiones.find((d) => d.clave === "experiencia")!;
    expect(exp.fricciones).toEqual(fr);
    expect(exp.interpretacion).toContain("fricciones potenciales");
  });

  it("el código para organizaciones sociales no habla de precios ni ventas", () => {
    const xs = noSePuedeSaberPorTipo(["organizacion_social"]);
    expect(xs[0]).toContain("Financiación");
    expect(xs.join(" ")).not.toMatch(/ventas/i);
  });
});
