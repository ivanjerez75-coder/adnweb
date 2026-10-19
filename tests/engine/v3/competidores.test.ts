import { describe, it, expect } from "vitest";
import { generarCompetidores, normalizarTexto } from "../../../lib/engine/v3/sections/competidores";
import type { Adn } from "../../../lib/engine/v3/sections/adn";
import type { JsonModel } from "../../../lib/engine/ai/providers";
import type { PageGetter } from "../../../lib/engine/safe-fetch";
import { makeRaw } from "../raw-fixture";

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
const raw = makeRaw({});
const ownHost = new URL(raw.url).hostname;

const model = (fn: (p: string) => string): JsonModel => ({
  name: "fake",
  generate: async (p) => {
    const r = fn(p);
    if (r === "FAIL") throw new Error("boom");
    return r;
  },
});
const cands = [
  { nombre: "Alfa", web: "https://alfa.com", ofrece: "Facturas", terminos: ["facturación", "presupuestos", "contabilidad"] },
  { nombre: "Beta", web: "https://beta.com", ofrece: "ERP", terminos: ["inventario", "nóminas"] },
  { nombre: "Propio", web: `https://www.${ownHost}`, ofrece: "x", terminos: ["a", "b"] },
  { nombre: "Gamma", web: "ftp://gamma.com", ofrece: "x", terminos: ["a", "b"] },
];
const searchOk = model((p) =>
  p.includes("diferencias")
    ? "FAIL"
    : `Aquí tienes:\n${JSON.stringify({ competidores: cands })}`,
);
const page = (text: string) => ({ url: "", status: 200, headers: {}, text });
const getter = (map: Record<string, string | Error>): PageGetter => async (u) => {
  const v = map[new URL(u).hostname.replace(/^www\./, "")];
  if (v === undefined || v instanceof Error) throw v ?? new Error("nf");
  return page(v);
};
const runOpts = { sleep: async () => {} };

describe("generarCompetidores", () => {
  it("verifica con >=2 términos (sin acentos/mayúsculas), excluye propio y no-http", async () => {
    const getPage = getter({ "alfa.com": "<html><body>FACTURACION y Presupuestos online</body></html>", "beta.com": new Error("down") });
    const diff = model(() => JSON.stringify({ diferencias: [{ nombre: "Alfa", items: ["Es más barato"] }] }));
    const r = await generarCompetidores(raw, adn, { searchModels: [searchOk], models: [diff], getPage, runOpts });
    expect(r.lista.map((c) => c.nombre)).toEqual(["Alfa", "Beta"]);
    expect(r.lista[0]).toMatchObject({ verificado: true, diferencias: ["Es más barato"] });
    expect(r.lista[1]).toMatchObject({ verificado: false, diferencias: [] });
    expect(r.textosVerificados).toHaveLength(1);
    expect(r.textosVerificados[0]).toContain("facturacion y presupuestos");
  });
  it("homepage con un solo término no verifica", async () => {
    const getPage = getter({ "alfa.com": "solo facturacion", "beta.com": "inventario" });
    const r = await generarCompetidores(raw, adn, { searchModels: [searchOk], models: [searchOk], getPage, runOpts });
    expect(r.lista.every((c) => !c.verificado && c.diferencias.length === 0)).toBe(true);
    expect(r.textosVerificados).toEqual([]);
  });
  it("si falla la búsqueda usa el modelo normal y nada queda verificado", async () => {
    const plain = model(() => JSON.stringify({ competidores: cands }));
    let fetched = 0;
    const getPage: PageGetter = async () => (fetched++, page("facturacion presupuestos inventario nominas"));
    const r = await generarCompetidores(raw, adn, {
      searchModels: [model(() => "FAIL")],
      models: [plain],
      getPage,
      runOpts,
    });
    expect(r.lista.length).toBe(2);
    expect(r.lista.every((c) => !c.verificado && c.diferencias.length === 0)).toBe(true);
    expect(fetched).toBe(0);
  });
  it("timeout por homepage: página colgada no verifica", async () => {
    const getPage: PageGetter = () => new Promise(() => {});
    const r = await generarCompetidores(raw, adn, { searchModels: [searchOk], models: [searchOk], getPage, runOpts, timeoutMs: 20 });
    expect(r.lista.every((c) => !c.verificado)).toBe(true);
  });
  it("normalizarTexto", () => {
    expect(normalizarTexto("  Facturación\n\tÁÉ  ")).toBe("facturacion ae");
  });
});

describe("contienePalabra", () => {
  it("coincide con palabras o frases completas, no dentro de otra palabra", async () => {
    const { contienePalabra } = await import("../../../lib/engine/v3/sections/competidores");
    expect(contienePalabra("software de facturacion online", "facturacion")).toBe(true);
    expect(contienePalabra("software de facturacion online", "facturacion online")).toBe(true);
    expect(contienePalabra("autofacturacion", "facturacion")).toBe(false);
    expect(contienePalabra("precio (c++) aqui", "c++")).toBe(true);
  });
});
