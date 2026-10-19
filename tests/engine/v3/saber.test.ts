import { describe, it, expect } from "vitest";
import { generarNoSabemos, BACKLINKS_ITEM } from "../../../lib/engine/v3/sections/saber";
import type { Adn } from "../../../lib/engine/v3/sections/adn";
import { makeRaw } from "../raw-fixture";
import type { JsonModel } from "../../../lib/engine/ai/providers";

const adn: Adn = {
  queEs: null,
  propuestaValor: null,
  tipoNegocio: "saas",
  lineas: [{ nombre: "Facturación", queOfrece: ["Facturas"], publico: "", comoSeContrata: "", ingresos: "", evidencias: [] }],
  comoFunciona: null,
  modeloEstado: "desconocido",
  canales: [],
  afirmaciones: [],
};
function fake(answer: string) {
  const prompts: string[] = [];
  const m: JsonModel = { name: "fake", generate: async (p) => (prompts.push(p), answer) };
  return { prompts, deps: { models: [m], runOpts: { sleep: async () => {} } } };
}
const raw = makeRaw({});

describe("generarNoSabemos", () => {
  it("añade siempre el item de backlinks si falta", async () => {
    const { deps } = fake(JSON.stringify({ items: ["Margen real", "Número de clientes", "Retención"] }));
    const r = await generarNoSabemos(raw, adn, deps);
    expect(r).toContain(BACKLINKS_ITEM);
    expect(BACKLINKS_ITEM).toBe("Backlinks y palabras clave (requieren herramientas de pago)");
  });
  it("no duplica backlinks y recorta a 8", async () => {
    const items = Array.from({ length: 12 }, (_, i) => `Cosa ${i}`);
    items.splice(2, 0, BACKLINKS_ITEM);
    const { deps } = fake(JSON.stringify({ items }));
    const r = await generarNoSabemos(raw, adn, deps);
    expect(r.length).toBe(8);
    expect(r.filter((x) => x === BACKLINKS_ITEM)).toHaveLength(1);
  });
  it("con 8 items sin backlinks, lo incluye y mantiene 8", async () => {
    const items = Array.from({ length: 9 }, (_, i) => `Cosa ${i}`);
    const { deps } = fake(JSON.stringify({ items }));
    const r = await generarNoSabemos(raw, adn, deps);
    expect(r.length).toBe(8);
    expect(r).toContain(BACKLINKS_ITEM);
  });
  it("el prompt incluye el tipo y las líneas", async () => {
    const { deps, prompts } = fake(JSON.stringify({ items: ["a", "b", "c"] }));
    await generarNoSabemos(raw, adn, deps);
    expect(prompts[0]).toContain("saas");
    expect(prompts[0]).toContain("Facturación");
  });
});
