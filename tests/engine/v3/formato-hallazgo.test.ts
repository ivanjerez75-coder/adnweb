import { describe, it, expect } from "vitest";
import { estadoHallazgo, generarDiagnostico, prioridadHallazgo } from "../../../lib/engine/v3/sections/diagnostico";
import { esHibrido } from "../../../lib/engine/v3/sections/anatomia";
import { buildEvidence, type Evidence } from "../../../lib/engine/v3/evidence";
import { makeRaw } from "../raw-fixture";
import { anatomiaBase, fakeModel } from "./fixtures-v4";

const pag: Evidence = { id: "p1-e1", tipo: "pagina", texto: "x", url: "https://facturo.example/", fuente: "https://facturo.example/" };
const dato: Evidence = { id: "dato:tranco", tipo: "dato", texto: "x", fuente: "tranco" };

describe("prioridadHallazgo", () => {
  it("suma 3/2/1: 3+3+2 = 8 → alta; 6 → media; menos → baja", () => {
    expect(prioridadHallazgo({ relevancia: "alto", fiabilidad: "alto", utilidad: "medio" })).toEqual({ puntos: 8, prioridad: "alta" });
    expect(prioridadHallazgo({ relevancia: "medio", fiabilidad: "medio", utilidad: "medio" }).prioridad).toBe("media");
    expect(prioridadHallazgo({ relevancia: "alto", fiabilidad: "bajo", utilidad: "bajo" }).prioridad).toBe("baja");
  });
});

describe("estadoHallazgo", () => {
  it("comprobado solo con clase observado o fuente_externa y un extracto de página", () => {
    expect(estadoHallazgo("fortaleza", "observado", [pag])).toBe("comprobado");
    expect(estadoHallazgo("debilidad", "fuente_externa", [dato, pag])).toBe("comprobado");
    expect(estadoHallazgo("debilidad", "fuente_externa", [dato])).toBe("por_comprobar");
    expect(estadoHallazgo("fortaleza", "inferencia", [pag])).toBe("por_comprobar");
  });
  it("riesgos y fricciones siempre por comprobar", () => {
    expect(estadoHallazgo("riesgo", "observado", [pag])).toBe("por_comprobar");
    expect(estadoHallazgo("friccion", "observado", [pag])).toBe("por_comprobar");
  });
});

describe("esHibrido", () => {
  it("al menos 2 tipologías con certeza alta o media", () => {
    expect(esHibrido([{ certeza: "alta" }, { certeza: "media" }])).toBe(true);
    expect(esHibrido([{ certeza: "alta" }, { certeza: "baja" }])).toBe(false);
    expect(esHibrido([{ certeza: "alta" }])).toBe(false);
  });
});

describe("generarDiagnostico: formato estándar", () => {
  const raw = makeRaw({
    paginas: [{ id: "p1", url: "https://facturo.example/", titulo: "Inicio", tieneDescripcion: true, extractos: [{ id: "p1-e1", cita: "Facturas online" }, { id: "p1-e2", cita: "Contacta" }] }],
  });
  const reg = buildEvidence(raw, []);
  const respuesta = {
    fortalezas: [
      { texto: "Menor", frenteA: "Alfa", paraQuien: "x", evidencias: ["p1-e1"], declaradoEnWeb: true, relevancia: "bajo", fiabilidad: "alto", utilidad: "bajo" },
      {
        texto: "Explica el producto con claridad",
        frenteA: "Alfa",
        paraQuien: "pymes",
        evidencias: ["p1-e1"],
        declaradoEnWeb: true,
        titulo: "Una propuesta de valor clara y muy fácil de entender hoy",
        porQueImporta: "El cliente entiende qué compra.",
        queHacer: "Mantener el mensaje en la portada. Invertir 500 € en marzo.",
        relevancia: "alto",
        fiabilidad: "alto",
        utilidad: "medio",
      },
    ],
    debilidades: [],
    riesgos: [{ texto: "Depende de un canal", evidencias: ["p1-e1"], relevancia: "alto", fiabilidad: "alto", utilidad: "alto" }],
    fricciones: [],
    lineas: [],
    integrado: "",
  };

  it("ordena por prioridad, numera, recorta el título, filtra el qué hacer y decide el estado", async () => {
    const { deps } = fakeModel(respuesta);
    const d = await generarDiagnostico(raw, anatomiaBase(["saas"]), null, reg, deps);
    expect(d.fortalezas.map((f) => [f.id, f.texto, f.prioridad])).toEqual([
      ["f1", "Explica el producto con claridad", "alta"],
      ["f2", "Menor", "baja"],
    ]);
    const f = d.fortalezas[0];
    expect(f.titulo.split(" ")).toHaveLength(8);
    expect(f.queHacer).toBe("Mantener el mensaje en la portada.");
    expect(f.porQueImporta).toBe("El cliente entiende qué compra.");
    expect(f.estado).toBe("comprobado");
    expect(d.fortalezas[1].titulo).toBe("Menor");
  });

  it("un riesgo nunca es comprobado y su fiabilidad no pasa de medio", async () => {
    const { deps } = fakeModel(respuesta);
    const d = await generarDiagnostico(raw, anatomiaBase(["saas"]), null, reg, deps);
    expect(d.riesgos[0]).toMatchObject({ estado: "por_comprobar", fiabilidad: "medio", prioridad: "alta" });
  });

  it("el prompt incluye el foco de la tipología y la regla de diseño menor frente a problema técnico", async () => {
    const { deps, prompts } = fakeModel(respuesta);
    await generarDiagnostico(raw, anatomiaBase(["ecommerce"]), null, reg, deps);
    expect(prompts[0]).toMatch(/ecommerce: catálogo, rango de precios, envíos y devoluciones/);
    expect(prompts[0]).toMatch(/diferencia menor de diseño/);
    expect(prompts[0]).toMatch(/problema técnico crítico/);
  });
});
