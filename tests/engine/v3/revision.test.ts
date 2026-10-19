import { describe, it, expect } from "vitest";
import { generarRevision } from "../../../lib/engine/v3/sections/revision";
import type { Adn } from "../../../lib/engine/v3/sections/adn";
import { buildEvidence } from "../../../lib/engine/v3/evidence";
import { makeRaw } from "../raw-fixture";
import type { JsonModel } from "../../../lib/engine/ai/providers";
import type { Signal } from "../../../lib/engine/types";

const paginas = [
  {
    id: "p1",
    url: "https://x.example/",
    titulo: "Inicio",
    tieneDescripcion: true,
    extractos: [
      { id: "p1-e1", cita: "Facturas en 1 minuto" },
      { id: "p1-e2", cita: "Contacta" },
    ],
  },
];
const sig = { id: "s1", family: "tech", source: "web", label: "Usa WordPress", polarity: "neutral" } as unknown as Signal;
const raw = makeRaw({ paginas });
const reg = buildEvidence(raw, [sig]);
const mkAdn = (nombres: string[]): Adn => ({
  queEs: null,
  propuestaValor: null,
  tipoNegocio: "saas",
  lineas: nombres.map((nombre) => ({ nombre, queOfrece: ["x"], publico: "", comoSeContrata: "", ingresos: "", evidencias: [] })),
  comoFunciona: null,
  modeloEstado: "desconocido",
  canales: [],
  afirmaciones: [],
});
const checks = (v = "si") => ({ propuestaClara: v, diceAQuien: v, muestraCasos: "no", facilContacto: v, orientacionPrecio: "no" });
function fake(obj: object) {
  const prompts: string[] = [];
  const m: JsonModel = { name: "fake", generate: async (p) => (prompts.push(p), JSON.stringify(obj)) };
  return { prompts, deps: { models: [m], runOpts: { sleep: async () => {} } } };
}
const bien = (n: number, ev = ["p1-e1"]) => Array.from({ length: n }, (_, i) => ({ texto: `Bien ${i}`, evidencias: ev }));

describe("generarRevision", () => {
  it("recorta bien a 5 y descarta los sin evidencia", async () => {
    const { deps } = fake({ bien: [...bien(7), { texto: "x", evidencias: ["zzz"] }], lineas: [], problemas: [] });
    const r = await generarRevision(raw, mkAdn(["A"]), reg, deps);
    expect(r.bien).toHaveLength(5);
    expect(r.bien[0].evidencias[0].id).toBe("p1-e1");
  });
  it("descarta un problema que cita solo una señal", async () => {
    const { deps } = fake({
      bien: bien(3),
      lineas: [],
      problemas: [
        { linea: "A", problema: "Solo señal", evidencias: ["s1"], mejora: "m" },
        { linea: "A", problema: "Con página", evidencias: ["p1-e2", "s1"], mejora: "m" },
      ],
    });
    const r = await generarRevision(raw, mkAdn(["A"]), reg, deps);
    expect(r.problemas.map((p) => p.problema)).toEqual(["Con página"]);
  });
  it("checks sin evidencia de página pasan a no_aplica", async () => {
    const { deps } = fake({
      bien: bien(3),
      lineas: [
        { nombre: "A", checks: checks(), evidenciasChecks: ["s1"] },
        { nombre: "B", checks: checks(), evidenciasChecks: ["p1-e1"] },
      ],
      problemas: [],
    });
    const r = await generarRevision(raw, mkAdn(["A", "B"]), reg, deps);
    const a = r.lineas.find((l) => l.nombre === "A")!;
    const b = r.lineas.find((l) => l.nombre === "B")!;
    expect(Object.values(a.checks).every((v) => v === "no_aplica")).toBe(true);
    expect(b.checks.propuestaClara).toBe("si");
    expect(b.checks.muestraCasos).toBe("no");
  });
  it("descarta líneas desconocidas salvo negocio de una sola línea", async () => {
    const multi = fake({
      bien: bien(3),
      lineas: [{ nombre: "Zeta", checks: checks(), evidenciasChecks: ["p1-e1"] }],
      problemas: [{ linea: "Zeta", problema: "p", evidencias: ["p1-e1"], mejora: "m" }],
    });
    const r1 = await generarRevision(raw, mkAdn(["A", "B"]), reg, multi.deps);
    expect(r1.lineas).toHaveLength(0);
    expect(r1.problemas).toHaveLength(0);
    const single = fake({
      bien: bien(3),
      lineas: [{ nombre: "Zeta", checks: checks(), evidenciasChecks: ["p1-e1"] }],
      problemas: [{ linea: "Zeta", problema: "p", evidencias: ["p1-e1"], mejora: "m" }],
    });
    const r2 = await generarRevision(raw, mkAdn(["Única"]), reg, single.deps);
    expect(r2.lineas[0].nombre).toBe("Única");
    expect(r2.problemas[0].linea).toBe("Única");
  });
  it("devuelve la revisión aunque bien y problemas queden vacíos", async () => {
    const { deps } = fake({ bien: [{ texto: "x", evidencias: ["zzz"] }], lineas: [], problemas: [] });
    const r = await generarRevision(raw, mkAdn(["A"]), reg, deps);
    expect(r).toEqual({ bien: [], lineas: [], problemas: [] });
  });
  it("el prompt lleva resumen del adn y delimitador", async () => {
    const { deps, prompts } = fake({ bien: [], lineas: [], problemas: [] });
    await generarRevision(raw, mkAdn(["Mi línea"]), reg, deps);
    expect(prompts[0]).toContain("Mi línea");
    expect(prompts[0]).toContain("<<<DATOS_WEB");
  });

  it("filtro de código en relevancia (bien) y mejora (problemas); las citas no se tocan", async () => {
    const { deps } = fake({
      bien: [{ texto: "Ok", evidencias: ["p1-e1"], relevancia: "Ayuda a decidir. Aumentará las ventas un 20 %." }],
      lineas: [],
      problemas: [{ linea: "A", problema: "p", evidencias: ["p1-e1"], mejora: "Añadir precios. Reducirá la tasa de conversión perdida.", relevancia: "r" }],
    });
    const r = await generarRevision(raw, mkAdn(["A"]), reg, deps);
    expect(r.bien[0].relevancia).toBe("Ayuda a decidir.");
    expect(r.problemas[0].mejora).toBe("Añadir precios.");
    expect(r.problemas[0].evidencias[0].texto).toBe(paginas[0].extractos[0].cita);
  });

  it("añade relevancia, confianza y limitaciones con valores por defecto seguros", async () => {
    const { deps } = fake({
      bien: [{ texto: "Ok", evidencias: ["p1-e1"], relevancia: "Ayuda a decidir", confianza: "alta", limitaciones: ["a", "b", "c", "d", "e"] }, { texto: "Raro", evidencias: ["p1-e2"], confianza: "segura" }],
      lineas: [],
      problemas: [{ linea: "A", problema: "p", evidencias: ["p1-e1"], mejora: "m", relevancia: "r", confianza: "baja", limitaciones: ["no se vio el checkout"] }],
    });
    const r = await generarRevision(raw, mkAdn(["A"]), reg, deps);
    expect(r.bien[0]).toMatchObject({ relevancia: "Ayuda a decidir", confianza: "alta" });
    expect(r.bien[0].limitaciones).toHaveLength(3);
    expect(r.bien[1]).toMatchObject({ relevancia: "", confianza: "media", limitaciones: [] });
    expect(r.problemas[0]).toMatchObject({ relevancia: "r", confianza: "baja", limitaciones: ["no se vio el checkout"] });
  });
  it("un bien que solo se apoya en afirmaciones de la empresa no se marca como comprobado", async () => {
    const adn = { ...mkAdn(["A"]), afirmaciones: [{ texto: "Somos los mejores", evidencias: [reg.get("p1-e2")!] }] };
    const { deps } = fake({
      bien: [
        { texto: "Presume", evidencias: ["p1-e2"], confianza: "alta" },
        { texto: "Mixto", evidencias: ["p1-e2", "p1-e1"], confianza: "alta" },
      ],
      lineas: [],
      problemas: [],
    });
    const r = await generarRevision(raw, adn, reg, deps);
    expect(r.bien[0].confianza).toBe("baja");
    expect(r.bien[0].limitaciones.join(" ")).toMatch(/afirma/i);
    expect(r.bien[1].confianza).toBe("alta");
  });
  it("el prompt prohíbe afirmar conversión, abandono o clientes perdidos", async () => {
    const { deps, prompts } = fake({ bien: [], lineas: [], problemas: [] });
    await generarRevision(raw, mkAdn(["A"]), reg, deps);
    expect(prompts[0]).toMatch(/conversión/i);
    expect(prompts[0]).toMatch(/clientes perdidos/i);
  });
});
