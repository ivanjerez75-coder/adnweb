import { describe, it, expect } from "vitest";
import { evaluarCobertura, type EntradaCobertura } from "../../../lib/engine/v3/cobertura";
import { makeRaw, makeSite, ps } from "../raw-fixture";

const pag = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://facturo.example/${i}`, title: "t", description: "", headings: [], text: "x" }));
const base = (over: Partial<EntradaCobertura> = {}): EntradaCobertura => ({ raw: makeRaw(), secciones: {}, estados: {}, ...over });

describe("evaluarCobertura", () => {
  it("auditoria: válida con PageSpeed y ≥ 3 páginas", () => {
    const raw = makeRaw({ site: makeSite({ pages: pag(3) }), pagespeed: ps(80, 90) });
    expect(evaluarCobertura(base({ raw })).auditoria.estado).toBe("valido");
  });
  it("auditoria: parcial si solo se cumple una condición", () => {
    expect(evaluarCobertura(base({ raw: makeRaw({ site: makeSite({ pages: pag(1) }), pagespeed: ps(80, 90) }) })).auditoria.estado).toBe("parcial");
    expect(evaluarCobertura(base({ raw: makeRaw({ site: makeSite({ pages: pag(4) }), pagespeed: null }) })).auditoria.estado).toBe("parcial");
  });
  it("auditoria: fallida sin PageSpeed y con una página", () => {
    const r = evaluarCobertura(base({ raw: makeRaw({ site: makeSite({ pages: pag(1) }), pagespeed: null }) }));
    expect(r.auditoria).toMatchObject({ estado: "fallido" });
    expect(r.auditoria.motivo).not.toBe("");
  });
  it("rendimiento: válido con móvil y escritorio, parcial con uno, fallido sin ninguno", () => {
    expect(evaluarCobertura(base({ raw: makeRaw({ pagespeed: ps(80, 90) }) })).rendimiento.estado).toBe("valido");
    expect(evaluarCobertura(base({ raw: makeRaw({ pagespeed: ps(80, null) }) })).rendimiento.estado).toBe("parcial");
    expect(evaluarCobertura(base({ raw: makeRaw({ pagespeed: ps(null, null) }) })).rendimiento.estado).toBe("fallido");
  });
  it("competencia: ≥ 2 verificados válida, 1 parcial, 0 fallida", () => {
    const comp = (n: number, v: number) => ({ competidores: Array.from({ length: n }, (_, i) => ({ nombre: `c${i}`, verificado: i < v })) });
    const cob = (c: unknown) => evaluarCobertura(base({ secciones: { competencia: c }, estados: { competencia: "lista" } })).competencia.estado;
    expect(cob(comp(3, 2))).toBe("valido");
    expect(cob(comp(3, 1))).toBe("parcial");
    expect(cob(comp(3, 0))).toBe("fallido");
    expect(cob(undefined)).toBe("fallido");
  });
  it("identidad: fallida sin web", () => {
    expect(evaluarCobertura(base({ raw: makeRaw({ site: null }) })).identidad.estado).toBe("fallido");
  });
  it("modelo sigue el estado de anatomía", () => {
    expect(evaluarCobertura(base({ secciones: { anatomia: {} }, estados: { anatomia: "lista" } })).modelo.estado).toBe("valido");
    expect(evaluarCobertura(base({ estados: { anatomia: "error" } })).modelo.estado).toBe("fallido");
  });
  it("diagnóstico, oportunidades y plan: lista con contenido válida, vacía parcial, error fallida", () => {
    const r = evaluarCobertura(
      base({
        secciones: { diagnostico: { fortalezas: ["a"] }, oportunidades: [], plan: null },
        estados: { diagnostico: "lista", oportunidades: "lista", plan: "error" },
      }),
    );
    expect(r.diagnostico.estado).toBe("valido");
    expect(r.oportunidades.estado).toBe("parcial");
    expect(r.plan.estado).toBe("fallido");
  });
});
