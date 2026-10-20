import type { Anatomia } from "../../../lib/engine/v3/sections/anatomia";
import type { Tipologia } from "../../../lib/engine/v3/clases";
import type { JsonModel } from "../../../lib/engine/ai/providers";
import type { FormatoHallazgo } from "../../../lib/engine/v3/sections/diagnostico";

/** Campos del formato estándar de hallazgo, para fixtures de diagnóstico. */
export const FMT: FormatoHallazgo = {
  titulo: "Título",
  porQueImporta: "",
  queHacer: "",
  estado: "por_comprobar",
  relevancia: "medio",
  fiabilidad: "medio",
  utilidad: "medio",
  prioridad: "media",
};

const vacio = { declara: null, interpretamos: null };

/** Anatomía mínima para probar las secciones que la reciben. */
export function anatomiaBase(tipos: Tipologia[] = ["saas"], over: Partial<Anatomia> = {}): Anatomia {
  return {
    nombre: "Facturo",
    fraseResumen: { texto: "Facturación online para pymes", evidencias: [] },
    identidad: { producto: vacio, problema: vacio, paraQuien: vacio, beneficio: vacio, argumento: vacio, diferenciacion: vacio },
    tipologias: tipos.map((tipo) => ({ tipo, certeza: "alta" as const, explicacion: "", evidencias: [] })),
    hibrido: tipos.length >= 2,
    lineas: [{ nombre: "Facturación", queOfrece: ["Facturas"], publico: "pymes", comoSeContrata: "web", evidencias: [] }],
    monetizacion: [],
    cliente: { explicito: null, necesidades: [], sectores: [], mensaje: null, segmentosAlternativos: [] },
    canales: [],
    afirmaciones: [],
    modeloEstado: "probable",
    ...over,
  };
}

/** Modelo falso con una respuesta fija (o que falla con "FAIL"); guarda los prompts. */
export function fakeModel(answer: unknown) {
  const prompts: string[] = [];
  const m: JsonModel = {
    name: "fake",
    generate: async (p) => {
      prompts.push(p);
      if (answer === "FAIL") throw new Error("boom");
      return typeof answer === "string" ? answer : JSON.stringify(answer);
    },
  };
  return { prompts, deps: { models: [m], runOpts: { sleep: async () => {}, attemptsPerModel: 1 } } };
}
