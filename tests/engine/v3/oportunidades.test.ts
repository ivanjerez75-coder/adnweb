import { describe, it, expect } from "vitest";
import { calcularPrioridad, generarOportunidades } from "../../../lib/engine/v3/sections/oportunidades";
import type { Diagnostico } from "../../../lib/engine/v3/sections/diagnostico";
import type { Competencia } from "../../../lib/engine/v3/sections/competencia";
import { buildEvidence, type Evidence } from "../../../lib/engine/v3/evidence";
import { SeccionVaciaError } from "../../../lib/engine/v3/errors";
import { makeRaw } from "../raw-fixture";
import { anatomiaBase, fakeModel } from "./fixtures-v4";

const raw = makeRaw({
  paginas: [
    {
      id: "p1",
      url: "https://facturo.example/",
      titulo: "Inicio",
      tieneDescripcion: true,
      extractos: [
        { id: "p1-e1", cita: "Facturación online para autónomos" },
        { id: "p1-e2", cita: "Contacta para más información" },
      ],
    },
  ],
});
const c1e1: Evidence = { id: "c1-e1", tipo: "pagina", texto: "Alfa: desde 9 €", url: "https://alfa.com", fuente: "https://alfa.com" };
const regTotal = new Map([...buildEvidence(raw, []), [c1e1.id, c1e1]]);
const ev = (id: string) => regTotal.get(id)!;

const diagnostico: Diagnostico = {
  fortalezas: [{ id: "f1", texto: "Explica bien el producto", frenteA: "Alfa", paraQuien: "autónomos", evidencias: [ev("p1-e1")], clase: "observado" }],
  debilidades: [{ id: "d1", texto: "No muestra casos de clientes", porQueImporta: "Confianza", evidencias: [ev("p1-e2")], clase: "inferencia" }],
  riesgos: [{ id: "r1", texto: "Depende de un canal", evidencias: [ev("p1-e1")], clase: "hipotesis" }],
  fricciones: [{ id: "x1", tipo: "pasos", texto: "Hay que contactar para todo", evidencias: [ev("p1-e2")], potencial: true }],
  integrado: { texto: "" },
  comprobaciones: [],
};
const competencia = {
  competidores: [],
  matriz: { dimensiones: [], filas: [] },
  ganaPierde: [
    { dimension: "precio", destaca: "c1", evidencia: [c1e1], porQueImporta: "", aprender: "", diferenciarse: "" },
    { dimension: "cliente", destaca: "sin_datos", evidencia: [], porQueImporta: "", aprender: "", diferenciarse: "" },
  ],
} as unknown as Competencia;

const crit = (i: string, e: string, v: string, d: string, f: string) => ({ impacto: i, evidencia: e, viabilidad: v, diferenciacion: d, facilidadValidacion: f });
const op = (titulo: string, over: object = {}) => ({
  tipologia: "mejorar",
  titulo,
  origen: ["d1"],
  ficha: {
    evidencia: { texto: "La web no enseña casos", evidencias: ["p1-e2"] },
    problema: "Quien llega no ve pruebas",
    solucion: "Publicar dos casos reales",
    porQuePodria: "Da confianza",
    faltaComprobar: ["Si hay clientes dispuestos a salir"],
  },
  estado: "por_validar",
  criterios: crit("medio", "medio", "medio", "medio", "medio"),
  ...over,
});

const generar = (ops: object[], d: Diagnostico | null = diagnostico, c: Competencia | null = competencia) => {
  const f = fakeModel({ oportunidades: ops });
  return { f, p: generarOportunidades(raw, anatomiaBase(), d, c, regTotal, f.deps) };
};

describe("calcularPrioridad", () => {
  it("alto=3, medio=2, bajo=1; 3+3+3+2+2 = 13 → alta", () => {
    expect(calcularPrioridad(crit("alto", "alto", "alto", "medio", "medio") as never)).toEqual({ puntos: 13, prioridad: "alta" });
  });
  it("umbrales: ≥ 12 alta, ≥ 9 media, si no baja", () => {
    expect(calcularPrioridad(crit("alto", "alto", "medio", "medio", "medio") as never).prioridad).toBe("alta");
    expect(calcularPrioridad(crit("alto", "medio", "medio", "medio", "medio") as never).prioridad).toBe("media");
    expect(calcularPrioridad(crit("medio", "medio", "medio", "bajo", "bajo") as never)).toEqual({ puntos: 8, prioridad: "baja" });
    expect(calcularPrioridad(crit("medio", "medio", "bajo", "bajo", "medio") as never).prioridad).toBe("baja");
    expect(calcularPrioridad(crit("medio", "medio", "medio", "medio", "bajo") as never).prioridad).toBe("media");
  });
});

describe("generarOportunidades", () => {
  it("descarta la oportunidad cuyo origen no existe y conserva solo los orígenes que resuelven", async () => {
    const { p } = generar([
      op("Inventada", { origen: ["f99", "gp:inventada"] }),
      op("Mixta", { origen: ["zz", "d1", "gp:precio", "gp:cliente"] }),
      op("Sin origen", { origen: [] }),
      op("Fricción", { origen: ["x1"] }),
    ]);
    const r = await p;
    expect(r.map((o) => o.titulo)).toEqual(["Mixta", "Fricción"]);
    expect(r[0].origen).toEqual(["d1", "gp:precio"]);
  });

  it("ordena por prioridad y luego por puntos, y numera o1, o2… tras ordenar", async () => {
    const { p } = generar([
      op("Baja", { criterios: crit("bajo", "bajo", "bajo", "bajo", "bajo") }),
      op("Media 10", { criterios: crit("alto", "medio", "medio", "medio", "bajo") }),
      op("Alta 13", { criterios: crit("alto", "alto", "alto", "medio", "medio") }),
      op("Media 11", { criterios: crit("alto", "alto", "medio", "medio", "bajo") }),
      op("Alta 15", { criterios: crit("alto", "alto", "alto", "alto", "alto") }),
    ]);
    const r = await p;
    expect(r.map((o) => o.titulo)).toEqual(["Alta 15", "Alta 13", "Media 11", "Media 10", "Baja"]);
    expect(r.map((o) => o.id)).toEqual(["o1", "o2", "o3", "o4", "o5"]);
    expect(r.map((o) => o.prioridad)).toEqual(["alta", "alta", "media", "media", "baja"]);
  });

  it("como máximo 6; exige evidencia válida y tipología conocida; siempre hipótesis", async () => {
    const muchas = Array.from({ length: 8 }, (_, i) => op(`Op ${i}`));
    muchas.push(op("Sin evidencia", { ficha: { ...op("x").ficha, evidencia: { texto: "x", evidencias: ["zz"] } } }));
    muchas.unshift(op("Tipología rara", { tipologia: "fusion" }));
    const r = await generar(muchas).p;
    expect(r).toHaveLength(6);
    expect(r.every((o) => o.clase === "hipotesis")).toBe(true);
    expect(r.some((o) => o.titulo === "Tipología rara" || o.titulo === "Sin evidencia")).toBe(false);
    expect(r[0].ficha.evidencia.evidencias[0].id).toBe("p1-e2");
  });

  it("filtra el texto libre; un criterio raro cuenta como bajo; 'detectada' exige extracto de la web", async () => {
    const r = await generar([
      op("Subir ventas", {
        ficha: { ...op("x").ficha, porQuePodria: "Aumentará las ventas un 30 %. Da confianza.", faltaComprobar: ["La tasa de conversión actual", "Si 500 clientes lo piden"] },
        criterios: crit("altísimo", "medio", "medio", "medio", "medio"),
        estado: "detectada",
      }),
      op("Precio", { origen: ["gp:precio"], estado: "detectada", ficha: { ...op("x").ficha, evidencia: { texto: "Alfa publica precio", evidencias: ["c1-e1"] } } }),
    ]).p;
    const a = r.find((o) => o.titulo === "Subir ventas")!;
    expect(a.ficha.porQuePodria).toBe("Da confianza.");
    expect(a.ficha.faltaComprobar).toEqual(["La tasa de conversión actual"]);
    expect(a.criterios.impacto).toBe("bajo");
    expect(a.estado).toBe("detectada");
    expect(r.find((o) => o.titulo === "Precio")!.estado).toBe("por_validar");
  });

  it("el prompt lista los hallazgos con sus ids y las dimensiones gp: con datos, dentro del delimitador", async () => {
    const { f, p } = generar([op("A")]);
    await p;
    const pr = f.prompts[0];
    expect(pr).toContain("d1: No muestra casos de clientes");
    expect(pr).toContain("gp:precio");
    expect(pr).not.toContain("gp:cliente");
  });

  it("sin ninguna oportunidad válida → SeccionVaciaError; sin hallazgos no llama a la IA", async () => {
    await expect(generar([op("X", { origen: ["zz"] })]).p).rejects.toBeInstanceOf(SeccionVaciaError);
    const vacio = { ...diagnostico, fortalezas: [], debilidades: [], riesgos: [], fricciones: [] };
    const g = generar([op("A")], vacio, null);
    await expect(g.p).rejects.toBeInstanceOf(SeccionVaciaError);
    expect(g.f.prompts).toHaveLength(0);
  });
});
