import { describe, it, expect } from "vitest";
import { calcularScore, AVISO_SCORE, type DnaScore } from "../../../lib/engine/v3/score";
import type { Adn } from "../../../lib/engine/v3/sections/adn";
import type { Revision } from "../../../lib/engine/v3/sections/revision";
import { buildEvidence } from "../../../lib/engine/v3/evidence";
import { computeFacts } from "../../../lib/engine/facts";
import { makeRaw, makeSite } from "../raw-fixture";
import type { RawData, Signal } from "../../../lib/engine/types";

const sig = (id: string): Signal => ({ id, family: "confianza", source: "web", label: id, polarity: "positiva" });
const lineaAdn = (over: Partial<Adn["lineas"][number]> = {}) => ({
  nombre: "A",
  queOfrece: ["facturas"],
  publico: "",
  comoSeContrata: "",
  ingresos: "",
  evidencias: [],
  ...over,
});
const mkAdn = (lineas = [lineaAdn()]): Adn => ({ queEs: null, propuestaValor: null, tipoNegocio: "saas", lineas, comoFunciona: null });
const checks = (v: string) => ({ propuestaClara: v, diceAQuien: v, muestraCasos: v, facilContacto: v, orientacionPrecio: v });
const mkRev = (c: object[]): Revision =>
  ({ bien: [], problemas: [], lineas: c.map((ch, i) => ({ nombre: `L${i}`, checks: ch, evidenciasChecks: [] })) }) as unknown as Revision;

function score(raw: RawData, o: { signals?: Signal[]; adn?: Adn; rev?: Revision | null; comp?: string[] } = {}): DnaScore {
  const signals = o.signals ?? [];
  return calcularScore(raw, computeFacts(raw), signals, o.adn ?? mkAdn(), o.rev ?? null, o.comp ?? [], buildEvidence(raw, signals));
}
const val = (s: DnaScore, clave: string) => s.criterios.find((c) => c.clave === clave)!.valor;

describe("calcularScore", () => {
  it("aviso exacto y 6 criterios", () => {
    const s = score(makeRaw());
    expect(s.aviso).toBe("Resume indicadores públicos; no es una valoración financiera.");
    expect(AVISO_SCORE).toBe(s.aviso);
    expect(s.criterios.map((c) => c.clave)).toEqual(["claridad", "visibilidad", "monetizacion", "confianza", "presencia", "novedad"]);
  });

  it("claridad: % de si entre los no no_aplica, null con menos de 3 checks válidos", () => {
    const rev = mkRev([checks("si"), { ...checks("no_aplica"), propuestaClara: "no", diceAQuien: "no" }]);
    expect(val(score(makeRaw(), { rev }), "claridad")).toBe(71); // 5/7
    expect(val(score(makeRaw(), { rev: mkRev([{ ...checks("no_aplica"), propuestaClara: "si", diceAQuien: "no" }]) }), "claridad")).toBeNull();
    expect(val(score(makeRaw(), { rev: null }), "claridad")).toBeNull();
  });

  it("visibilidad: tramos de ranking, blog_activo y pagespeed, límites y null", () => {
    const base = (rank: number | null) => makeRaw({ tranco: { rank, trend: null }, radar: null });
    expect(val(score(base(5000)), "visibilidad")).toBe(85);
    expect(val(score(base(50_000)), "visibilidad")).toBe(65);
    expect(val(score(base(500_000)), "visibilidad")).toBe(45);
    expect(val(score(base(null)), "visibilidad")).toBe(25);
    expect(val(score(base(5000), { signals: [sig("blog_activo")] }), "visibilidad")).toBe(95);
    expect(val(score(base(null), { signals: [sig("pagespeed_movil_bajo")] }), "visibilidad")).toBe(15);
    expect(val(score(base(5000), { signals: [sig("blog_activo"), sig("pagespeed_movil_bajo")] }), "visibilidad")).toBe(85);
    expect(val(score(makeRaw({ tranco: null, radar: null })), "visibilidad")).toBeNull();
  });

  it("monetización: base 30 y sumas; null sin web", () => {
    const sinNada = makeRaw({ site: makeSite({ pricesFound: [], hasPricingPage: false }) });
    expect(val(score(sinNada), "monetizacion")).toBe(30);
    const pagos = makeRaw({ site: makeSite({ pricesFound: [], hasPricingPage: false, technologies: [{ name: "Stripe", category: "pagos" }] }) });
    expect(val(score(pagos), "monetizacion")).toBe(50);
    const adn = mkAdn([lineaAdn({ comoSeContrata: "Suscripción", evidencias: [{ id: "p1-e1", tipo: "pagina", texto: "t", fuente: "u" }] })]);
    const todo = makeRaw({ site: makeSite({ technologies: [{ name: "Stripe", category: "pagos" }] }) });
    expect(val(score(todo, { adn }), "monetizacion")).toBe(100);
    expect(val(score(makeRaw({ site: null })), "monetizacion")).toBeNull();
  });

  it("confianza y madurez: suma, resta y mínimo de 2 inputs", () => {
    const raw = makeRaw({
      fuentes: { ...makeRaw().fuentes, wikidata: "ok" },
      dns: { emailProvider: "Google Workspace", tools: [] },
      wikidata: { id: "Q1", description: null, inception: 2000, founders: [], headquarters: null, employees: null, employeesYear: null, revenue: null },
    });
    expect(val(score(raw, { signals: [sig("empresa_consolidada")] }), "confianza")).toBe(100);
    expect(val(score(raw, { signals: [sig("dominio_reciente")] }), "confianza")).toBe(50); // testimonios + wikidata + email - reciente
    const pocos = makeRaw({ site: null, rdap: null, wikidata: null, dns: null, fuentes: { ...makeRaw().fuentes, wikidata: "fallo" } });
    expect(val(score(pocos), "confianza")).toBeNull();
    const soloWikidata = makeRaw({
      site: null,
      rdap: null,
      dns: null,
      fuentes: { ...makeRaw().fuentes, wikidata: "ok" },
      wikidata: { id: "Q1", description: null, inception: 2000, founders: [], headquarters: null, employees: null, employeesYear: null, revenue: null },
    });
    expect(val(score(soloWikidata, { signals: [sig("empresa_consolidada")] }), "confianza")).toBeNull();
  });

  it("presencia digital: redes, blog, app y actividad reciente", () => {
    const sm = (lastModified: string) => ({ urlCount: 10, sections: [], languages: [], lastModified, recentBlogPosts: 0, complete: true, candidatas: [] });
    const raw = makeRaw({
      site: makeSite({ socialLinks: { a: "x", b: "y", c: "z" }, hasBlog: true, hasAppLinks: true }),
      sitemap: sm("2026-10-01"),
    });
    expect(val(score(raw), "presencia")).toBe(100);
    const vieja = makeRaw({
      site: makeSite({ socialLinks: { a: "x" }, hasBlog: false, hasAppLinks: false }),
      sitemap: sm("2025-01-01"),
    });
    expect(val(score(vieja), "presencia")).toBe(15);
    expect(val(score(makeRaw({ site: null })), "presencia")).toBeNull();
  });

  it("novedad: necesita 2 competidores; 50 + 10 por item no encontrado, tope 100", () => {
    const adn = mkAdn([lineaAdn({ queOfrece: ["Facturas", "Inventario", "Nóminas"] })]);
    expect(val(score(makeRaw(), { adn, comp: ["solo facturas aqui"] }), "novedad")).toBeNull();
    expect(val(score(makeRaw(), { adn, comp: ["vendemos facturas", "tambien facturas y nominas"] }), "novedad")).toBe(60);
    const muchos = mkAdn([lineaAdn({ queOfrece: Array.from({ length: 8 }, (_, i) => `cosa${i} rara`) })]);
    const sinNuevos = score(makeRaw(), { adn: mkAdn([lineaAdn({ queOfrece: ["facturas"] })]), comp: ["facturas", "mas facturas"] });
    expect(sinNuevos.criterios.find((c) => c.clave === "novedad")!.motivos.some((m) => m.includes("+0"))).toBe(false);
    const futura = makeRaw({
      site: makeSite({ socialLinks: {}, hasBlog: false, hasAppLinks: false }),
      sitemap: { urlCount: 1, sections: [], languages: [], lastModified: "2027-01-01", recentBlogPosts: 0, complete: true, candidatas: [] },
    });
    expect(val(score(futura), "presencia")).toBe(0);
    expect(val(score(makeRaw(), { adn: muchos, comp: ["a", "b"] }), "novedad")).toBe(100);
  });

  it("global: media redondeada de los no nulos; null con menos de 3", () => {
    const dos = score(makeRaw({ tranco: null, radar: null, site: null }), { rev: mkRev([checks("si")]) });
    expect(dos.criterios.filter((c) => c.valor !== null).length).toBeLessThan(3);
    expect(dos.global).toBeNull();
    const ok = score(makeRaw(), { rev: mkRev([checks("si")]) });
    const vals = ok.criterios.map((c) => c.valor).filter((v): v is number => v !== null);
    expect(vals.length).toBeGreaterThanOrEqual(3);
    expect(ok.global).toBe(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
  });

  it("los motivos son texto de código", () => {
    const s = score(makeRaw(), { signals: [sig("blog_activo")] });
    expect(s.criterios.find((c) => c.clave === "visibilidad")!.motivos.some((m) => m.includes("+10"))).toBe(true);
  });
});
