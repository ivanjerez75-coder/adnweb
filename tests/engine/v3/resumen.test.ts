import { describe, it, expect } from "vitest";
import { construirResumen, type CoberturaInforme } from "../../../lib/engine/v3/sections/resumen";
import type { Anatomia } from "../../../lib/engine/v3/sections/anatomia";
import type { Diagnostico } from "../../../lib/engine/v3/sections/diagnostico";
import type { Oportunidad } from "../../../lib/engine/v3/sections/oportunidades";
import { construirMetricas, preciosPublicados, type Metrica } from "../../../lib/engine/v3/estimates";
import { makeRaw } from "../raw-fixture";
import { anatomiaBase, FMT } from "./fixtures-v4";

const anatomia = {
  nombre: "Facturo",
  fraseResumen: { texto: "Facturación online para pymes", evidencias: [] },
  tipologias: [{ tipo: "saas", certeza: "alta", explicacion: "", evidencias: [] }],
  modeloEstado: "probable",
} as unknown as Anatomia;

const diag = (over: Partial<Diagnostico> = {}): Diagnostico => ({
  fortalezas: [
    { ...FMT, id: "f1", texto: "Clara", frenteA: "", paraQuien: "", evidencias: [], clase: "inferencia" },
    { ...FMT, id: "f2", texto: "Barata", frenteA: "", paraQuien: "", evidencias: [], clase: "inferencia" },
  ],
  debilidades: [{ ...FMT, id: "d1", texto: "Sin casos", porQueImporta: "", evidencias: [], clase: "inferencia" }],
  riesgos: [],
  fricciones: [{ ...FMT, id: "x1", tipo: "precio", texto: "Precio escondido", evidencias: [], potencial: true }],
  integrado: { texto: "" },
  comprobaciones: [],
  ...over,
});

const m = (clave: string, estado: Metrica["estado"]) => ({ clave, estado }) as Metrica;
const op = (id: string, prioridad: Oportunidad["prioridad"]) => ({ id, prioridad }) as Oportunidad;
const cobertura = { competencia: { estado: "fallido", motivo: "x" } } as unknown as CoberturaInforme;
const meta = { dominio: "facturo.example", fecha: "2026-10-19T00:00:00.000Z" };

describe("construirResumen", () => {
  it("hallazgos: solo los que superan los tres filtros y tienen evidencia, por prioridad, como mucho 3", () => {
    const e = [{ id: "p1-e1", tipo: "pagina" as const, texto: "x", fuente: "web" }];
    const alto = { relevancia: "alto", fiabilidad: "alto", utilidad: "medio", prioridad: "alta" } as const;
    const d = diag({
      fortalezas: [
        { ...FMT, id: "f1", texto: "Clara", frenteA: "", paraQuien: "", evidencias: e, clase: "observado" },
        { ...FMT, id: "f2", texto: "Bonita", frenteA: "", paraQuien: "", evidencias: e, clase: "observado", relevancia: "bajo", prioridad: "baja" },
      ],
      debilidades: [{ ...FMT, ...alto, id: "d1", texto: "Sin casos", evidencias: e, clase: "inferencia" }],
      riesgos: [
        { ...FMT, id: "r1", texto: "Dependencia", evidencias: e, clase: "hipotesis" },
        { ...FMT, id: "r2", texto: "Otro riesgo", evidencias: e, clase: "hipotesis" },
      ],
      fricciones: [{ ...FMT, ...alto, id: "x1", tipo: "precio", texto: "Precio escondido", evidencias: [], potencial: true }],
    });
    const r = construirResumen(anatomia, d, [], [], cobertura, meta);
    expect(r.hallazgos.map((h) => [h.tipo, h.id, h.prioridad])).toEqual([
      ["debilidad", "d1", "alta"],
      ["fortaleza", "f1", "media"],
      ["riesgo", "r1", "media"],
    ]);
    expect(r.hallazgos[0]).toMatchObject({ titulo: "Título", estado: "por_comprobar" });
  });

  it("destacado no repite cuando hay otra; sin diagnóstico no hay hallazgos", () => {
    const r = construirResumen(anatomia, diag(), [], [], cobertura, meta);
    expect(r.destacado.fortaleza?.id).toBe("f2");
    expect(r.destacado.debilidad?.id).toBe("d1");
    const sin = construirResumen(anatomia, null, null, [], cobertura, meta);
    expect(sin.hallazgos).toEqual([]);
    expect(sin.destacado).toEqual({});
    expect(sin.oportunidad).toBeNull();
  });

  it("indicadores: solo disponibles, por prioridad y como mucho 4", () => {
    const metricas = [
      m("visitas_mensuales", "insuficiente"),
      m("pagespeed_movil", "disponible"),
      m("popularidad_tranco", "error"),
      m("idiomas", "disponible"),
      m("ingresos_publicados", "disponible"),
      m("pagespeed_escritorio", "disponible"),
      m("seo_tecnico", "disponible"),
      m("escenario_ingresos", "disponible"),
    ];
    const r = construirResumen(anatomia, null, null, metricas, cobertura, meta);
    expect(r.indicadores.map((x) => x.clave)).toEqual(["ingresos_publicados", "pagespeed_movil", "pagespeed_escritorio", "idiomas"]);
  });

  it("copia frase, modelo, categoría, cobertura y la oportunidad de más prioridad", () => {
    const r = construirResumen(anatomia, diag(), [op("o1", "media"), op("o2", "alta"), op("o3", "alta")], [], cobertura, meta);
    expect(r).toMatchObject({ nombre: "Facturo", dominio: meta.dominio, fecha: meta.fecha, categoria: ["saas"], frase: anatomia.fraseResumen, cobertura });
    expect(r.modelo.estado).toBe("probable");
    expect(r.oportunidad?.id).toBe("o2");
  });

  it("datosClave: los de la tipología con el contexto de datos; sin contexto, vacío", () => {
    const raw = makeRaw();
    const metricas = construirMetricas(raw, new Date("2026-10-19"));
    const r = construirResumen(anatomiaBase(["saas"]), null, null, metricas, cobertura, meta, { raw, precios: preciosPublicados(raw) });
    expect(r.datosClave.map((d) => d.clave)).toEqual(["planes_publicados", "prueba_gratuita", "pagespeed_movil"]);
    expect(construirResumen(anatomia, null, null, [], cobertura, meta).datosClave).toEqual([]);
  });
});
