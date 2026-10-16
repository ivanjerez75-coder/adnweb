import { describe, it, expect } from "vitest";
import { confidenceFor, validateOpportunities } from "../../lib/engine/opportunities";
import type { Signal, SourceId } from "../../lib/engine/types";

const sig = (id: string, source: SourceId): Signal => ({ id, family: "producto", source, label: id, polarity: "negativa" });

const SIGNALS: Signal[] = [
  sig("a_web", "web"),
  sig("b_web", "web"),
  sig("c_tranco", "tranco"),
  sig("d_wayback", "wayback"),
  sig("e_pagespeed", "pagespeed"),
  sig("mercado_x", "mercado"),
];

describe("confidenceFor", () => {
  it("baja con 2 señales de 2 fuentes", () => {
    expect(confidenceFor([sig("1", "web"), sig("2", "tranco")])).toBe("baja");
  });
  it("media con 3 señales", () => {
    expect(confidenceFor([sig("1", "web"), sig("2", "web"), sig("3", "tranco")])).toBe("media");
  });
  it("media con 4 señales de solo 2 fuentes", () => {
    expect(confidenceFor([sig("1", "web"), sig("2", "web"), sig("3", "web"), sig("4", "tranco")])).toBe("media");
  });
  it("alta con 4 señales de 3 fuentes", () => {
    expect(confidenceFor([sig("1", "web"), sig("2", "web"), sig("3", "tranco"), sig("4", "wayback")])).toBe("alta");
  });
});

describe("validateOpportunities", () => {
  it("acepta solo oportunidades con ≥2 señales de ≥2 fuentes y ordena por confianza", () => {
    const result = validateOpportunities(
      [
        { titulo: "Dos de la misma fuente", paraQuien: "competir", senales: ["a_web", "b_web"] },
        { titulo: "Baja", paraQuien: "mejorar", senales: ["a_web", "c_tranco"] },
        { titulo: "Alta", paraQuien: "competir", senales: ["a_web", "b_web", "c_tranco", "mercado_x"] },
        { titulo: "Inventada", paraQuien: "competir", senales: ["no_existe", "tampoco"] },
        { titulo: "Una sola", paraQuien: "mejorar", senales: ["e_pagespeed", "no_existe"] },
      ],
      SIGNALS,
    );

    expect(result.oportunidades.map((o) => [o.titulo, o.confianza])).toEqual([
      ["Alta", "alta"],
      ["Baja", "baja"],
    ]);
    expect(result.oportunidades[0].evidencias.map((e) => e.id)).toEqual(["a_web", "b_web", "c_tranco", "mercado_x"]);
    expect(result.pistas.map((p) => p.titulo)).toEqual(["Dos de la misma fuente", "Una sola"]);
  });

  it("ignora ids repetidos", () => {
    const result = validateOpportunities(
      [{ titulo: "Repetida", paraQuien: "competir", senales: ["a_web", "a_web", "a_web"] }],
      SIGNALS,
    );
    expect(result.oportunidades).toEqual([]);
    expect(result.pistas[0].evidencias).toHaveLength(1);
  });

  it("devuelve como máximo 5 oportunidades", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      titulo: `O${i}`,
      paraQuien: "competir" as const,
      senales: ["a_web", "c_tranco"],
    }));
    expect(validateOpportunities(many, SIGNALS).oportunidades).toHaveLength(5);
  });
});
