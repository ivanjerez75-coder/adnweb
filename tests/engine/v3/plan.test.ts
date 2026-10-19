import { describe, it, expect } from "vitest";
import { contienePlazoOImporte, generarPlan } from "../../../lib/engine/v3/sections/plan";
import type { Oportunidad } from "../../../lib/engine/v3/sections/oportunidades";
import type { Diagnostico } from "../../../lib/engine/v3/sections/diagnostico";
import { SeccionVaciaError } from "../../../lib/engine/v3/errors";
import { fakeModel } from "./fixtures-v4";

const ev = { id: "p1-e1", tipo: "pagina" as const, texto: "Cita", url: "https://x.example/", fuente: "https://x.example/" };
const oportunidad: Oportunidad = {
  id: "o1",
  tipologia: "mejorar",
  titulo: "Mostrar casos de clientes",
  origen: ["d1"],
  ficha: { evidencia: { texto: "No hay casos", evidencias: [ev] }, problema: "Falta confianza", solucion: "Publicar casos", porQuePodria: "Da confianza", faltaComprobar: ["Si hay clientes dispuestos"] },
  estado: "por_validar",
  criterios: { impacto: "alto", evidencia: "medio", viabilidad: "medio", diferenciacion: "bajo", facilidadValidacion: "alto" },
  prioridad: "media",
  clase: "hipotesis",
};
const diagnostico: Diagnostico = {
  fortalezas: [{ id: "f1", texto: "Claro", frenteA: "Alfa", paraQuien: "pymes", evidencias: [ev], clase: "observado" }],
  debilidades: [{ id: "d1", texto: "No muestra casos", porQueImporta: "Confianza", evidencias: [ev], clase: "inferencia" }],
  riesgos: [{ id: "r1", texto: "Un canal", evidencias: [ev], clase: "hipotesis" }],
  fricciones: [{ id: "x1", tipo: "pasos", texto: "Hay que contactar para todo", evidencias: [ev], potencial: true }],
  integrado: { texto: "" },
  comprobaciones: [],
};

const accion = (tarea: string, over: object = {}) => ({
  origen: "o1",
  tarea,
  porQue: "Es lo más barato de comprobar",
  recursos: ["Lista de clientes"],
  indicador: "Clientes que aceptan",
  criterio: { continuar: "Si la mayoría acepta", modificar: "Si piden cambios", descartar: "Si nadie acepta" },
  ...over,
});
const generar = (respuesta: object, ops: Oportunidad[] = [oportunidad], d: Diagnostico | null = diagnostico) => {
  const f = fakeModel(respuesta);
  return { f, p: generarPlan(ops, d, f.deps) };
};

describe("contienePlazoOImporte", () => {
  it("detecta plazos, fechas e importes", () => {
    for (const t of ["Hazlo en 2 semanas", "Invertir 500 €", "Antes de marzo", "En el Q3", "Durante tres meses", "Lanzar el 15/11", "Para 2027", "$300 de anuncios", "En 30 días"]) {
      expect(contienePlazoOImporte(t), t).toBe(true);
    }
    for (const t of ["Preguntar a cinco clientes", "Medir las solicitudes mensuales", "Revisar la página de precios"]) {
      expect(contienePlazoOImporte(t), t).toBe(false);
    }
  });
});

describe("generarPlan", () => {
  it("descarta las acciones con un origen desconocido o con plazos e importes", async () => {
    const r = await generar({
      comprobar: [
        accion("Preguntar a clientes"),
        accion("Inventada", { origen: "o9" }),
        accion("De una fortaleza", { origen: "f1" }),
        accion("Publicar casos", { porQue: "Se puede hacer en 2 semanas" }),
        accion("Anuncios", { recursos: ["500 € de presupuesto"] }),
      ],
      experimentar: [accion("Simplificar el contacto", { origen: "x1" })],
      medir: [accion("Medir peticiones", { origen: "d1", criterio: { continuar: "Si suben", modificar: "", descartar: "Si en marzo no hay cambios" } })],
    }).p;
    expect(r.comprobar.map((a) => a.tarea)).toEqual(["Preguntar a clientes"]);
    expect(r.experimentar.map((a) => a.origen)).toEqual(["x1"]);
    expect(r.medir).toEqual([]);
    expect(r.comprobar[0]).toMatchObject({ id: "a1", porQue: "Es lo más barato de comprobar", recursos: ["Lista de clientes"], indicador: "Clientes que aceptan" });
    expect(r.experimentar[0].id).toBe("a2");
  });

  it("como máximo 3 acciones por grupo; sin tarea o indicador se descarta", async () => {
    const r = await generar({
      comprobar: ["A", "B", "C", "D", "E"].map((t) => accion(t)),
      experimentar: [accion("Sin indicador", { indicador: "" }), accion("")],
      medir: [accion("M1"), accion("M1")],
    }).p;
    expect(r.comprobar.map((a) => a.tarea)).toEqual(["A", "B", "C"]);
    expect(r.experimentar).toEqual([]);
    expect(r.medir.map((a) => a.tarea)).toEqual(["M1"]);
  });

  it("filtra el texto libre (cifras de ventas)", async () => {
    const r = await generar({ comprobar: [accion("Probar casos", { porQue: "Aumentará las ventas. Da confianza." })], experimentar: [], medir: [] }).p;
    expect(r.comprobar[0].porQue).toBe("Da confianza.");
  });

  it("el prompt lista las oportunidades y los hallazgos enlazables dentro del delimitador", async () => {
    const { f, p } = generar({ comprobar: [accion("A")] });
    await p;
    expect(f.prompts[0]).toContain("o1: Mostrar casos de clientes");
    expect(f.prompts[0]).toContain("d1: No muestra casos");
    expect(f.prompts[0]).toContain("x1: Hay que contactar para todo");
    expect(f.prompts[0]).not.toContain("f1: Claro");
  });

  it("sin acciones válidas → SeccionVaciaError; sin orígenes no llama a la IA", async () => {
    await expect(generar({ comprobar: [accion("X", { origen: "zz" })] }).p).rejects.toBeInstanceOf(SeccionVaciaError);
    const g = generar({ comprobar: [accion("A")] }, [], null);
    await expect(g.p).rejects.toBeInstanceOf(SeccionVaciaError);
    expect(g.f.prompts).toHaveLength(0);
  });
});
