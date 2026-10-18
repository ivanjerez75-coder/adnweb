import { describe, it, expect } from "vitest";
import { generarCierre } from "../../../lib/engine/v3/sections/cierre";
import type { DnaScore } from "../../../lib/engine/v3/score";
import type { Adn } from "../../../lib/engine/v3/sections/adn";
import { buildEvidence } from "../../../lib/engine/v3/evidence";
import { makeRaw } from "../raw-fixture";
import type { JsonModel } from "../../../lib/engine/ai/providers";

const raw = makeRaw({
  paginas: [
    {
      id: "p1",
      url: "https://x.example/",
      titulo: "I",
      tieneDescripcion: true,
      extractos: [
        { id: "p1-e1", cita: "Hola" },
        { id: "p1-e2", cita: "Adios" },
      ],
    },
  ],
});
const reg = buildEvidence(raw, []);
const adn: Adn = {
  queEs: null,
  propuestaValor: null,
  tipoNegocio: "saas",
  lineas: [{ nombre: "A", queOfrece: ["x"], publico: "", comoSeContrata: "", ingresos: "", evidencias: [] }],
  comoFunciona: null,
};
const score: DnaScore = {
  aviso: "Resume indicadores públicos; no es una valoración financiera.",
  global: 60,
  criterios: [
    { clave: "claridad", nombre: "Claridad", valor: 80, motivos: ["+1: x"], evidencias: [] },
    { clave: "novedad", nombre: "Novedad", valor: null, motivos: [], evidencias: [] },
  ],
};
function fake(obj: object) {
  const prompts: string[] = [];
  const m: JsonModel = { name: "fake", generate: async (p) => (prompts.push(p), JSON.stringify(obj)) };
  return { prompts, deps: { models: [m], runOpts: { sleep: async () => {} } } };
}
const acc = (que: string, impacto: string, esfuerzo: string, ev = ["p1-e1", "p1-e2"]) => ({
  que,
  porque: "porque " + que,
  evidencias: ev,
  impacto,
  esfuerzo,
  datosQueFaltan: [],
});

describe("generarCierre", () => {
  it("descarta una acción con una sola evidencia", async () => {
    const { deps } = fake({ motivos: {}, acciones: [acc("Una", "alto", "bajo", ["p1-e1"]), acc("Dos", "alto", "bajo")] });
    const r = await generarCierre(raw, adn, null, score, reg, deps);
    expect(r.acciones.map((a) => a.que)).toEqual(["Dos"]);
    expect(r.acciones[0].evidencias).toHaveLength(2);
  });
  it("ordena por impacto desc y esfuerzo asc, y recorta a 3", async () => {
    const { deps } = fake({
      motivos: {},
      acciones: [acc("A", "bajo", "bajo"), acc("B", "alto", "alto"), acc("C", "alto", "bajo"), acc("D", "medio", "medio"), acc("E", "medio", "bajo")],
    });
    const r = await generarCierre(raw, adn, null, score, reg, deps);
    expect(r.acciones.map((a) => a.que)).toEqual(["C", "B", "E"]);
  });
  it("no rellena por debajo de 3 y descarta impacto/esfuerzo inválidos", async () => {
    const { deps } = fake({ motivos: {}, acciones: [acc("Ok", "medio", "medio"), acc("Mala", "enorme", "bajo")] });
    const r = await generarCierre(raw, adn, null, score, reg, deps);
    expect(r.acciones.map((a) => a.que)).toEqual(["Ok"]);
  });
  it("sin acciones válidas devuelve lista vacía, sin lanzar", async () => {
    const { deps } = fake({ motivos: {}, acciones: [] });
    expect((await generarCierre(raw, adn, null, score, reg, deps)).acciones).toEqual([]);
  });
  it("motivos: solo claves conocidas, como array de una línea", async () => {
    const { deps, prompts } = fake({ motivos: { claridad: "Se entiende bien", inventada: "x", novedad: "  " }, acciones: [] });
    const r = await generarCierre(raw, adn, null, score, reg, deps);
    expect(r.motivos).toEqual({ claridad: ["Se entiende bien"] });
    expect(prompts[0]).toContain("claridad");
    expect(prompts[0]).toContain("<<<DATOS_WEB");
  });
});
