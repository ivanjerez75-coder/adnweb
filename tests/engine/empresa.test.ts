import { describe, it, expect } from "vitest";
import { buildEmpresa } from "../../lib/engine/empresa";
import { validateClaims } from "../../lib/engine/claims";
import { makeRaw, makeSite } from "./raw-fixture";
import type { Signal } from "../../lib/engine/types";

describe("buildEmpresa", () => {
  it("rellena la ficha con la fuente de cada dato y null si falta", () => {
    const raw = makeRaw({
      wikidata: { id: "Q1", description: null, inception: 2016, founders: ["Ana"], headquarters: "Madrid", employees: 80, employeesYear: 2024, revenue: null },
      empleo: { platform: "lever", token: "f", openings: 7, byArea: { Ventas: 7 }, linkedFromSite: true },
      dns: { emailProvider: "Google Workspace", tools: [] },
      sitemap: { urlCount: 120, sections: [], languages: ["fr"], lastModified: "2026-10-01", recentBlogPosts: 0, complete: true, candidatas: [] },
      hackernews: { total: 2, lastYear: 1, top: { title: "Show HN", points: 10 } },
    });
    const e = buildEmpresa(raw);
    expect(e.nombre).toEqual({ valor: "Facturo", fuente: "web" });
    expect(e.fundacion).toEqual({ valor: 2016, fuente: "wikidata" });
    expect(e.fundadores).toEqual({ valor: ["Ana"], fuente: "wikidata" });
    expect(e.empleados).toEqual({ valor: 80, fuente: "wikidata" });
    expect(e.empleadosAnio).toEqual({ valor: 2024, fuente: "wikidata" });
    expect(e.ingresosPublicos).toBeNull();
    expect(e.empleo).toEqual({ valor: { ofertas: 7, porArea: { Ventas: 7 }, plataforma: "lever", confianza: "alta" }, fuente: "empleo" });
    expect(e.app).toBeNull();
    expect(e.emailCorporativo).toEqual({ valor: "Google Workspace", fuente: "dns" });
    expect(e.herramientas).toBeNull();
    expect(e.web).toEqual({ valor: { paginas: 120, ultimaActualizacion: "2026-10-01", idiomas: ["es", "en", "fr"], completo: true }, fuente: "sitemap" });
    expect(e.menciones).toEqual({ valor: { total: 2, ultimoAnio: 1, destacada: { titulo: "Show HN", puntos: 10 } }, fuente: "hackernews" });
  });

  it("nombre: no toma el de la página si es de otro (redirección a una plataforma)", () => {
    const raw = makeRaw({ site: makeSite({ companyName: "Instagram" }), finalDomain: "instagram.com", companyNameFromPage: false });
    expect(buildEmpresa(raw).nombre).toBeNull();
  });

  it("web: completo false si el sitemap no se leyó entero (la UI muestra «≥ N»)", () => {
    const raw = makeRaw({ sitemap: { urlCount: 1500, sections: [], languages: [], lastModified: null, recentBlogPosts: 0, complete: false, candidatas: [] } });
    expect(buildEmpresa(raw).web?.valor).toMatchObject({ paginas: 1500, completo: false });
  });

  it("empleo: confianza alta si la web enlaza el tablero, media si se adivinó", () => {
    const job = (linkedFromSite: boolean) =>
      buildEmpresa(makeRaw({ empleo: { platform: "ashby", token: "f", openings: 3, byArea: {}, linkedFromSite } })).empleo?.valor.confianza;
    expect(job(true)).toBe("alta");
    expect(job(false)).toBe("media");
  });
});

describe("validateClaims", () => {
  const s = (id: string, polarity: "positiva" | "negativa"): Signal => ({ id, family: "traccion", source: "web", label: id, polarity });
  const signals = [s("a", "positiva"), s("b", "positiva"), s("n", "negativa")];

  it("conserva solo afirmaciones con señales reales de la polaridad pedida, máx. 3", () => {
    const claims = [
      { texto: "1", senales: ["a", "a"] },
      { texto: "2", senales: ["n"] },
      { texto: "3", senales: ["zzz"] },
      { texto: "4", senales: ["b", "n"] },
      { texto: "5", senales: ["a"] },
      { texto: "6", senales: ["b"] },
    ];
    expect(validateClaims(claims, signals, "positiva").map((c) => [c.texto, c.evidencias.map((e) => e.id)])).toEqual([
      ["1", ["a"]],
      ["4", ["b"]],
      ["5", ["a"]],
    ]);
  });
});
