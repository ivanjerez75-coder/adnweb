import { describe, it, expect } from "vitest";
import { visitsFromRank, computeAnchors } from "../../lib/engine/anchors";
import { makeRaw } from "./raw-fixture";
import { NOW } from "./fake-network";

describe("visitsFromRank", () => {
  it.each([
    [50, { min: 500_000_000, max: 5_000_000_000 }],
    [800, { min: 50_000_000, max: 500_000_000 }],
    [5000, { min: 5_000_000, max: 50_000_000 }],
    [60000, { min: 500_000, max: 5_000_000 }],
    [900000, { min: 50_000, max: 500_000 }],
    [2_000_000, { min: 0, max: 50_000 }],
  ])("rank %i → %o", (rank, range) => {
    expect(visitsFromRank(rank)).toEqual(range);
  });
});

describe("computeAnchors", () => {
  it("usa Tranco y da confianza media si Radar también tiene dato", () => {
    expect(computeAnchors(makeRaw(), NOW)).toEqual({
      visitasMes: { min: 5_000_000, max: 50_000_000 },
      confianzaTrafico: "media",
      antiguedadDominioAnios: 11,
      ingresosPublicos: null,
      empleados: null,
    });
  });

  it("usa Radar si Tranco no tiene rango, con confianza baja", () => {
    const a = computeAnchors(makeRaw({ tranco: null, radar: { bucket: 100000, rank: null } }), NOW);
    expect(a.visitasMes).toEqual({ min: 500_000, max: 5_000_000 });
    expect(a.confianzaTrafico).toBe("baja");
  });

  it("prefiere el rango exacto de Radar a la franja", () => {
    const a = computeAnchors(makeRaw({ tranco: null, radar: { bucket: 100000, rank: 800 } }), NOW);
    expect(a.visitasMes).toEqual({ min: 50_000_000, max: 500_000_000 });
  });

  it("no trata una franja o rango no válidos como top 100", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const a = computeAnchors(makeRaw({ tranco: null, radar: { bucket: bad, rank: bad } }), NOW);
      expect(a.visitasMes).toEqual({ min: 0, max: 50_000 });
      expect(a.confianzaTrafico).toBe("baja");
    }
    const t = computeAnchors(makeRaw({ tranco: { rank: 0, trend: null }, radar: null }), NOW);
    expect(t.visitasMes).toEqual({ min: 0, max: 50_000 });
  });

  it("da confianza media con Tranco y solo el rango de Radar", () => {
    const a = computeAnchors(makeRaw({ radar: { bucket: null, rank: 4000 } }), NOW);
    expect(a.confianzaTrafico).toBe("media");
  });

  it("interpreta 'fuera de Tranco' como menos de 50.000 visitas", () => {
    const a = computeAnchors(makeRaw({ tranco: { rank: null, trend: null }, radar: null }), NOW);
    expect(a.visitasMes).toEqual({ min: 0, max: 50_000 });
  });

  it("no estima tráfico sin fuentes y usa Wayback si no hay RDAP", () => {
    const a = computeAnchors(makeRaw({ tranco: null, radar: null, rdap: null }), NOW);
    expect(a.visitasMes).toBeNull();
    expect(a.antiguedadDominioAnios).toBe(11);
  });
});
