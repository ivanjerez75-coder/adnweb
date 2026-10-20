import { describe, it, expect } from "vitest";
import { claseDeAfirmacion, aplicaPrecios } from "../../../lib/engine/v3/clases";
import type { Evidence } from "../../../lib/engine/v3/evidence";

const pagina: Evidence = { id: "p1-e1", tipo: "pagina", texto: "cita", url: "https://x.example/", fuente: "https://x.example/" };
const tranco: Evidence = { id: "dato:tranco", tipo: "dato", texto: "Puesto 5", fuente: "tranco" };
const senal: Evidence = { id: "s1", tipo: "senal", texto: "Usa Stripe", fuente: "tech" };

describe("claseDeAfirmacion", () => {
  it("extracto de página declarado en la web → observado", () => {
    expect(claseDeAfirmacion([pagina], { declaradoEnWeb: true })).toBe("observado");
  });
  it("extracto de página sin declaración en la web → inferencia", () => {
    expect(claseDeAfirmacion([pagina])).toBe("inferencia");
  });
  it("solo dato:tranco → fuente_externa", () => {
    expect(claseDeAfirmacion([tranco])).toBe("fuente_externa");
  });
  it("dato externo junto a una señal → inferencia", () => {
    expect(claseDeAfirmacion([tranco, senal])).toBe("inferencia");
  });
  it("solo señales → inferencia", () => {
    expect(claseDeAfirmacion([senal])).toBe("inferencia");
  });
  it("sin evidencias → inferencia", () => {
    expect(claseDeAfirmacion([])).toBe("inferencia");
  });
  it("siempreHipotesis gana a todo", () => {
    expect(claseDeAfirmacion([pagina], { declaradoEnWeb: true, siempreHipotesis: true })).toBe("hipotesis");
  });
});

describe("aplicaPrecios", () => {
  it("organizacion_social → false", () => expect(aplicaPrecios(["organizacion_social"])).toBe(false));
  it("saas → true", () => expect(aplicaPrecios(["saas"])).toBe(true));
  it("[saas, servicio_profesional] → true", () => expect(aplicaPrecios(["saas", "servicio_profesional"])).toBe(true));
  it("todas las líneas por presupuesto → false", () => {
    expect(aplicaPrecios(["saas"], [{ comoSeContrata: "Por presupuesto" }, { comoSeContrata: "Previo presupuesto" }])).toBe(false);
  });
  it("alguna línea no es por presupuesto → true", () => {
    expect(aplicaPrecios(["saas"], [{ comoSeContrata: "Por presupuesto" }, { comoSeContrata: "Suscripción" }])).toBe(true);
  });
});
