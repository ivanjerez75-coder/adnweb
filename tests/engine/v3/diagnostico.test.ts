import { describe, it, expect } from "vitest";
import { generarDiagnostico } from "../../../lib/engine/v3/sections/diagnostico";
import type { Competencia } from "../../../lib/engine/v3/sections/competencia";
import { buildEvidence, type Evidence } from "../../../lib/engine/v3/evidence";
import { SeccionVaciaError } from "../../../lib/engine/v3/errors";
import { makeRaw, makeSite } from "../raw-fixture";
import { anatomiaBase, fakeModel } from "./fixtures-v4";

const raw = makeRaw({
  paginas: [
    {
      id: "p1",
      url: "https://facturo.example/",
      titulo: "Inicio",
      tieneDescripcion: true,
      extractos: [
        { id: "p1-e1", cita: "Facturación online para autónomos y pymes" },
        { id: "p1-e2", cita: "Contacta con nosotros para más información" },
      ],
    },
  ],
});
const regSitio = buildEvidence(raw, [{ id: "s1", kind: "tecnica", source: "tecnologias", label: "Usa Stripe" } as never]);
const c1e1: Evidence = { id: "c1-e1", tipo: "pagina", texto: "Alfa: facturas desde el móvil", url: "https://alfa.com", fuente: "https://alfa.com" };
const regTotal = new Map([...regSitio, [c1e1.id, c1e1]]);
const competencia = {
  competidores: [{ id: "c1", nombre: "Alfa", web: "https://alfa.com", descripcion: "", tipo: "directo", motivo: "", verificado: true, comprobadoEn: "", fuentes: [], ficha: null }],
  matriz: { dimensiones: [], filas: [] },
  ganaPierde: [],
} as unknown as Competencia;
const ev = ["p1-e1"];

const respuesta = (over: object = {}) => ({
  fortalezas: [
    { texto: "Explica el producto con claridad", frenteA: "c1", paraQuien: "autónomos", evidencias: ["p1-e1", "c1-e1"], declaradoEnWeb: true },
    { texto: "Sin frente", frenteA: "", paraQuien: "x", evidencias: ev },
    { texto: "Sin evidencias", frenteA: "Alfa", paraQuien: "x", evidencias: ["zz"] },
    { texto: "Se apoya en un competidor", frenteA: "Alfa", paraQuien: "pymes", evidencias: ["c1-e1"] },
  ],
  debilidades: [
    { texto: "Solo señales", porQueImporta: "x", evidencias: ["s1"] },
    { texto: "Solo competidor", porQueImporta: "x", evidencias: ["c1-e1"] },
    { texto: "No explica los planes", porQueImporta: "El cliente no sabe qué elige", evidencias: ["p1-e2", "s1"] },
    { texto: "Tiene pocos clientes y malas ventas perdidas", porQueImporta: "x", evidencias: ev },
  ],
  riesgos: [{ texto: "Depende de un solo canal", evidencias: ev }],
  fricciones: [
    { tipo: "precio", texto: "No se ve el precio", evidencias: ["p1-e2"] },
    { tipo: "pasos", texto: "Hay que contactar para todo", evidencias: ["p1-e2"] },
    { tipo: "raro", texto: "x", evidencias: ev },
  ],
  lineas: [{ nombre: "facturación", checks: { propuestaClara: "si", diceAQuien: "no", muestraCasos: "no", facilContacto: "si", orientacionPrecio: "no" }, evidenciasChecks: ["p1-e1"] }],
  integrado: "La web explica bien el producto (p1-e1). Subirá las ventas un 30 %. La prioridad es aclarar los planes.",
  ...over,
});

describe("generarDiagnostico", () => {
  it("fortalezas: exigen frenteA y evidencia; pueden apoyarse en un competidor; ids secuenciales", async () => {
    const { deps } = fakeModel(respuesta());
    const d = await generarDiagnostico(raw, anatomiaBase(["saas"]), competencia, regTotal, deps);
    expect(d.fortalezas.map((f) => [f.id, f.texto, f.frenteA])).toEqual([
      ["f1", "Explica el producto con claridad", "c1"],
      ["f2", "Se apoya en un competidor", "Alfa"],
    ]);
    expect(d.fortalezas[0].clase).toBe("observado");
    expect(d.fortalezas[1].evidencias.map((e) => e.id)).toEqual(["c1-e1"]);
  });

  it("una debilidad sin extracto de la propia web se descarta; la que afirma malas ventas también", async () => {
    const { deps } = fakeModel(respuesta());
    const d = await generarDiagnostico(raw, anatomiaBase(["saas"]), competencia, regTotal, deps);
    expect(d.debilidades.map((x) => [x.id, x.texto])).toEqual([["d1", "No explica los planes"]]);
    expect(d.debilidades[0].porQueImporta).toBe("El cliente no sabe qué elige");
  });

  it("los riesgos son siempre hipótesis", async () => {
    const { deps } = fakeModel(respuesta());
    const d = await generarDiagnostico(raw, anatomiaBase(["saas"]), competencia, regTotal, deps);
    expect(d.riesgos).toHaveLength(1);
    expect(d.riesgos.every((r) => r.clase === "hipotesis")).toBe(true);
    expect(d.riesgos[0].id).toBe("r1");
  });

  it("fricciones potenciales, tipos válidos e ids secuenciales", async () => {
    const { deps } = fakeModel(respuesta());
    const d = await generarDiagnostico(raw, anatomiaBase(["saas"]), competencia, regTotal, deps);
    expect(d.fricciones.map((x) => [x.id, x.tipo])).toEqual([
      ["x1", "precio"],
      ["x2", "pasos"],
    ]);
    expect(d.fricciones.every((x) => x.potencial === true)).toBe(true);
  });

  it("una fricción de precio no aplica a una organización social (ni la de la IA ni la de código)", async () => {
    const sinPrecios = makeRaw({ ...raw, site: makeSite({ pricesFound: [] }) });
    const { deps, prompts } = fakeModel(respuesta());
    const d = await generarDiagnostico(sinPrecios, anatomiaBase(["organizacion_social"]), null, regTotal, deps);
    expect(d.fricciones.map((x) => x.tipo)).toEqual(["pasos"]);
    expect(d.fricciones[0].id).toBe("x1");
    expect(prompts[0]).toContain("no propongas fricciones de precio");
  });

  it("sin precios en una web que sí debería publicarlos, el código añade la fricción de precio", async () => {
    const sinPrecios = makeRaw({ ...raw, site: makeSite({ pricesFound: [] }) });
    const { deps } = fakeModel(respuesta({ fricciones: [] }));
    const d = await generarDiagnostico(sinPrecios, anatomiaBase(["saas"]), null, regSitio, deps);
    expect(d.fricciones).toMatchObject([{ id: "x1", tipo: "precio", potencial: true, evidencias: [] }]);
  });

  it("el integrado pasa por el filtro y pierde los ids sueltos", async () => {
    const { deps } = fakeModel(respuesta());
    const d = await generarDiagnostico(raw, anatomiaBase(["saas"]), competencia, regTotal, deps);
    expect(d.integrado.texto).toBe("La web explica bien el producto. La prioridad es aclarar los planes.");
  });

  it("si el integrado no sobrevive al filtro, el código lo redacta", async () => {
    const { deps } = fakeModel(respuesta({ integrado: "Aumentará las ventas un 20 %." }));
    const d = await generarDiagnostico(raw, anatomiaBase(["saas"]), competencia, regTotal, deps);
    expect(d.integrado.texto).toContain("Su principal fortaleza: Explica el producto con claridad.");
    expect(d.integrado.texto).toContain("Prioridad propuesta");
  });

  it("comprobaciones: cuentan con extracto de página propia; sin él se anulan", async () => {
    const { deps } = fakeModel(respuesta());
    const d = await generarDiagnostico(raw, anatomiaBase(["saas"]), competencia, regTotal, deps);
    expect(d.comprobaciones).toEqual([expect.objectContaining({ nombre: "Facturación", checks: expect.objectContaining({ propuestaClara: "si" }) })]);
    const { deps: d2 } = fakeModel(respuesta({ lineas: [{ nombre: "Facturación", checks: { propuestaClara: "si" }, evidenciasChecks: ["s1"] }] }));
    const r2 = await generarDiagnostico(raw, anatomiaBase(["saas"]), competencia, regTotal, d2);
    expect(r2.comprobaciones[0].checks.propuestaClara).toBe("no_aplica");
  });

  it("el prompt incluye los extractos de los competidores verificados", async () => {
    const { deps, prompts } = fakeModel(respuesta());
    await generarDiagnostico(raw, anatomiaBase(["saas"]), competencia, regTotal, deps);
    expect(prompts[0]).toContain("[c1] Alfa");
    expect(prompts[0]).toContain("c1-e1");
  });

  it("sin nada válido lanza SeccionVaciaError", async () => {
    const { deps } = fakeModel({ fortalezas: [], debilidades: [], riesgos: [], fricciones: [], lineas: [], integrado: "" });
    const conPrecios = makeRaw({ ...raw, legal: undefined });
    await expect(generarDiagnostico(conPrecios, anatomiaBase(["saas"]), null, regSitio, deps)).rejects.toBeInstanceOf(SeccionVaciaError);
  });
});
