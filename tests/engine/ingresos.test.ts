import { describe, it, expect } from "vitest";
import { publicRevenueAnchor, employeeRevenueAnchor, computeAnchors } from "../../lib/engine/anchors";
import { clampIngresos } from "../../lib/engine/report";
import { makeRaw } from "./raw-fixture";
import { NOW } from "./fake-network";
import type { WikidataData } from "../../lib/engine/types";

const wiki = (over: Partial<WikidataData> = {}): WikidataData => ({
  id: "Q1", description: null, inception: null, founders: [], headquarters: null, employees: null, revenue: null, ...over,
});

const base = {
  anualMin: 1_000_000, anualMax: 4_000_000, valoracionMin: 5_000_000, valoracionMax: 20_000_000,
  confianza: "media" as const, suposiciones: ["x"],
};

describe("publicRevenueAnchor", () => {
  it("convierte a EUR con ±10 % y confianza alta", () => {
    expect(publicRevenueAnchor(wiki({ revenue: { amount: 100_000_000, currency: "USD", year: 2024 } }))).toEqual({
      range: { min: 82_800_000, max: 101_200_000 },
      confianza: "alta",
      base: "Ingresos públicos (Wikidata, 2024): 92000000 €",
    });
  });
  it("descarta monedas desconocidas o importes no positivos", () => {
    expect(publicRevenueAnchor(wiki({ revenue: { amount: 5, currency: "JPY", year: null } }))).toBeNull();
    expect(publicRevenueAnchor(wiki({ revenue: { amount: 0, currency: "EUR", year: null } }))).toBeNull();
    expect(publicRevenueAnchor(null)).toBeNull();
  });
});

describe("employeeRevenueAnchor", () => {
  it("empleados × ingresos por empleado del sector, ×0,5–×1,5", () => {
    expect(employeeRevenueAnchor(100, "saas")).toEqual({
      range: { min: 7_500_000, max: 22_500_000 },
      confianza: "media",
      base: "100 empleados × 150000 € por empleado (saas)",
    });
  });
  it("null sin empleados", () => {
    expect(employeeRevenueAnchor(null, "saas")).toBeNull();
    expect(employeeRevenueAnchor(0, "saas")).toBeNull();
  });
});

describe("computeAnchors", () => {
  it("incluye ingresos públicos y empleados de Wikidata", () => {
    const a = computeAnchors(makeRaw({ wikidata: wiki({ employees: 40, revenue: { amount: 10_000_000, currency: "EUR", year: 2023 } }) }), NOW);
    expect(a.empleados).toBe(40);
    expect(a.ingresosPublicos?.range).toEqual({ min: 9_000_000, max: 11_000_000 });
  });
});

describe("clampIngresos v2", () => {
  const traffic = { visitasMes: { min: 1, max: 2 }, confianzaTrafico: "baja" as const };
  const anchor = { range: { min: 3_000_000, max: 6_000_000 }, confianza: "media" as const, base: "b" };

  it("intersecta el rango de la IA con el ancla y toma su confianza", () => {
    expect(clampIngresos(base, traffic, anchor)).toMatchObject({ anualMin: 3_000_000, anualMax: 4_000_000, confianza: "media" });
  });
  it("si no se solapan, gana el ancla", () => {
    expect(clampIngresos({ ...base, anualMin: 100, anualMax: 200 }, traffic, anchor)).toMatchObject({ anualMin: 3_000_000, anualMax: 6_000_000 });
  });
  it("usa el ancla aunque no haya tráfico ni cifras de la IA", () => {
    const out = clampIngresos({ ...base, anualMin: null, anualMax: null }, { visitasMes: null, confianzaTrafico: "baja" }, anchor);
    expect(out).toMatchObject({ anualMin: 3_000_000, anualMax: 6_000_000, confianza: "media" });
  });
  it("sin ancla mantiene la regla anterior (tope = confianza del tráfico)", () => {
    expect(clampIngresos(base, traffic)).toMatchObject({ anualMin: 1_000_000, anualMax: 4_000_000, confianza: "baja" });
  });
  it("sin tráfico ni ancla, todo null", () => {
    expect(clampIngresos(base, { visitasMes: null, confianzaTrafico: "baja" })).toMatchObject({ anualMin: null, valoracionMax: null, confianza: "baja" });
  });
});
