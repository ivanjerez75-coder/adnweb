import { describe, it, expect } from "vitest";
import { generarAprender } from "../../../lib/engine/v3/sections/aprender";
import type { Adn } from "../../../lib/engine/v3/sections/adn";
import { buildEvidence } from "../../../lib/engine/v3/evidence";
import { SeccionVaciaError } from "../../../lib/engine/v3/errors";
import { makeRaw } from "../raw-fixture";
import type { JsonModel } from "../../../lib/engine/ai/providers";

const raw = makeRaw({
  paginas: [{ id: "p1", url: "https://x.example/", titulo: "I", tieneDescripcion: true, extractos: [{ id: "p1-e1", cita: "Hola" }] }],
});
const reg = buildEvidence(raw, []);
const adn: Adn = {
  queEs: null,
  propuestaValor: null,
  tipoNegocio: "saas",
  lineas: [{ nombre: "A", queOfrece: ["x"], publico: "", comoSeContrata: "", ingresos: "", evidencias: [] }],
  comoFunciona: null,
  modeloEstado: "desconocido",
  canales: [],
  afirmaciones: [],
};
function fake(obj: object) {
  const prompts: string[] = [];
  const m: JsonModel = { name: "fake", generate: async (p) => (prompts.push(p), JSON.stringify(obj)) };
  return { prompts, deps: { models: [m], runOpts: { sleep: async () => {} } } };
}
const items = (n: number, ev = ["p1-e1"]) => Array.from({ length: n }, (_, i) => ({ texto: `Aprender ${i}`, evidencias: ev }));

describe("generarAprender", () => {
  it("recorta a 4 sin reintentar y descarta los sin evidencia válida", async () => {
    const { deps, prompts } = fake({ items: [...items(6), { texto: "x", evidencias: ["zzz"] }] });
    const r = await generarAprender(raw, adn, null, reg, deps);
    expect(r).toHaveLength(4);
    expect(r.every((i) => i.evidencias.length >= 1)).toBe(true);
    expect(prompts).toHaveLength(1);
  });
  it("sin ningún item válido lanza SeccionVaciaError", async () => {
    const { deps } = fake({ items: items(3, ["zzz"]) });
    await expect(generarAprender(raw, adn, null, reg, deps)).rejects.toBeInstanceOf(SeccionVaciaError);
  });
  it("no rellena: devuelve los que sobreviven", async () => {
    const { deps } = fake({ items: [...items(1), { texto: "malo", evidencias: ["zzz"] }] });
    expect(await generarAprender(raw, adn, null, reg, deps)).toHaveLength(1);
  });
  it("el prompt incluye competidores verificados y delimitador", async () => {
    const { deps, prompts } = fake({ items: items(2) });
    await generarAprender(raw, adn, null, reg, deps, [
      { nombre: "Rival", web: "https://r.example", ofrece: "Cosas de rival", diferencias: [], verificado: true },
      { nombre: "Dudoso", web: null, ofrece: "NoVerificado", diferencias: [], verificado: false },
    ]);
    expect(prompts[0]).toContain("Rival");
    expect(prompts[0]).not.toContain("Dudoso");
    expect(prompts[0]).toContain("<<<DATOS_WEB");
  });
});
