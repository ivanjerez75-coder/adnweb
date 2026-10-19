import { describe, it, expect } from "vitest";
import { calcularScore, METODOLOGIA_DNA, PESOS_DNA, AVISO_SCORE, type DnaScore, type DimensionClave } from "../../../lib/engine/v3/score";
import { construirMetricas } from "../../../lib/engine/v3/estimates";
import type { Adn } from "../../../lib/engine/v3/sections/adn";
import type { Revision } from "../../../lib/engine/v3/sections/revision";
import { buildEvidence, type Evidence } from "../../../lib/engine/v3/evidence";
import { computeFacts } from "../../../lib/engine/facts";
import { makeRaw, makeSite, ps } from "../raw-fixture";
import type { LegalData, PageSpeedData, RawData } from "../../../lib/engine/types";

const NOW = new Date("2026-10-14T00:00:00.000Z");
const pagina = (id: string): Evidence => ({ id, tipo: "pagina", texto: "cita", url: "https://facturo.example/", fuente: "https://facturo.example/" });
const bloque = (id = "p1-e1") => ({ texto: "Texto", evidencias: [pagina(id)] });
const lineaAdn = (over: Partial<Adn["lineas"][number]> = {}) => ({
  nombre: "A",
  queOfrece: ["facturas"],
  publico: "",
  comoSeContrata: "",
  ingresos: "",
  evidencias: [],
  ...over,
});
const mkAdn = (over: Partial<Adn> = {}): Adn => ({ queEs: null, propuestaValor: null, tipoNegocio: "saas", lineas: [lineaAdn()], comoFunciona: null, modeloEstado: "desconocido", canales: [], afirmaciones: [], ...over });
const checks = (v: string) => ({ propuestaClara: v, diceAQuien: v, muestraCasos: v, facilContacto: v, orientacionPrecio: v });
const mkRev = (c: object[]): Revision =>
  ({ bien: [], problemas: [], lineas: c.map((ch, i) => ({ nombre: `L${i}`, checks: ch, evidenciasChecks: [] })) }) as unknown as Revision;

function score(raw: RawData, o: { adn?: Adn; rev?: Revision | null } = {}): DnaScore {
  return calcularScore(raw, computeFacts(raw), [], o.adn ?? mkAdn(), o.rev ?? null, construirMetricas(raw, NOW), buildEvidence(raw, []));
}
const dim = (s: DnaScore, clave: DimensionClave) => s.dimensiones.find((d) => d.clave === clave)!;
const ind = (s: DnaScore, d: DimensionClave, clave: string) => dim(s, d).indicadores.find((i) => i.clave === clave)!;

const FUENTES = makeRaw().fuentes;
/** Sin ningún dato: todo queda "no evaluado". */
const vacio = (over: Partial<RawData> = {}) =>
  makeRaw({
    site: null,
    tranco: null,
    radar: null,
    pagespeed: null,
    rdap: null,
    wayback: null,
    sitemap: null,
    dns: null,
    legal: null,
    paginas: null,
    fuentes: { ...FUENTES, tranco: "fallo", radar: "fallo", pagespeed: "fallo", rdap: "fallo" },
    ...over,
  });

const sitemap = (over: object = {}) => ({ urlCount: 60, sections: [], languages: [], lastModified: "2026-10-01", recentBlogPosts: 2, complete: true, candidatas: [], ...over });
const pagespeed = (over: Partial<PageSpeedData> = {}): PageSpeedData => ({
  mobile: 80,
  desktop: 90,
  accesibilidad: 100,
  buenasPracticas: 50,
  seo: 90,
  campo: { fuente: "url", lcpMs: 1500, inpMs: 100, cls: 0.01, categoria: "FAST" },
  obtenidoEn: "2026-10-14T00:00:00.000Z",
  ...over,
});
const legalCompleto = (over: Partial<LegalData> = {}): LegalData => ({
  avisoLegal: "https://facturo.example/aviso",
  privacidad: "https://facturo.example/privacidad",
  cookies: null,
  condiciones: null,
  cif: "B12345678",
  razonSocial: "Facturo SL",
  email: "hola@facturo.example",
  telefono: "910000000",
  direccion: null,
  fuentes: {},
  ...over,
});
const dns: RawData["dns"] = { emailProvider: "Google Workspace", tools: [] };

/** Fixture completo: todas las dimensiones con cobertura 1. */
function completo(over: Partial<RawData> = {}): RawData {
  return makeRaw({
    site: makeSite({
      hasPricingPage: true,
      pricesFound: ["9 €"],
      hasFreePlanOrTrial: false,
      technologies: [{ name: "Stripe", category: "pagos" }],
      socialLinks: { x: "https://twitter.com/facturo", linkedin: "https://linkedin.com/company/facturo" },
      hasTestimonials: true,
      ctas: ["Empieza ya"],
    }),
    pagespeed: pagespeed(),
    tranco: { rank: 5000, trend: "estable" },
    rdap: { registeredAt: "2015-03-02" },
    sitemap: sitemap(),
    dns,
    paginas: [
      { id: "p1", url: "https://facturo.example/", titulo: "Facturo", tieneDescripcion: true, extractos: [] },
      { id: "p2", url: "https://facturo.example/precios", titulo: "Precios", tieneDescripcion: false, extractos: [] },
    ],
    legal: legalCompleto(),
    ...over,
  });
}
const adnCompleto = () =>
  mkAdn({
    queEs: bloque("p1-e1"),
    propuestaValor: bloque("p1-e2"),
    lineas: [lineaAdn({ comoSeContrata: "Suscripción mensual", evidencias: [pagina("p1-e1")] })],
    modeloEstado: "confirmado",
    canales: [{ tipo: "prueba_gratuita", evidencias: [pagina("p1-e1")] }],
  });
const revCompleta = () => mkRev([checks("si")]);

describe("calcularScore: estructura y textos", () => {
  it("metodología, pesos 0.2, 5 dimensiones y avisos exactos", () => {
    const s = score(makeRaw());
    expect(METODOLOGIA_DNA).toBe("dna-score-1.0");
    expect(s.metodologia).toBe("dna-score-1.0");
    expect(s.dimensiones.map((d) => d.clave)).toEqual(["propuesta", "oferta", "experiencia", "adquisicion", "confianza"]);
    expect(Object.values(PESOS_DNA)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
    expect(s.dimensiones.every((d) => d.peso === 0.2)).toBe(true);
    expect(s.avisos).toEqual(["Resume indicadores públicos; no es una valoración financiera.", "Pesos provisionales, pendientes de validación."]);
    expect(AVISO_SCORE).toBe(s.avisos[0]);
  });
});

describe("calcularScore: cobertura", () => {
  it("1 de 4 indicadores evaluados: valor null y cobertura 0.25", () => {
    const raw = vacio({ pagespeed: pagespeed({ accesibilidad: null, buenasPracticas: null, seo: null, campo: null }) });
    const e = dim(score(raw), "experiencia");
    expect(e.indicadores).toHaveLength(4);
    expect(e.indicadores.filter((i) => i.evaluado)).toHaveLength(1);
    expect(e.cobertura).toBe(0.25);
    expect(e.valor).toBeNull();
  });

  it("sin datos: nada evaluado, nunca puntos 0 con evaluado true, y sin global", () => {
    const s = score(vacio());
    for (const d of s.dimensiones) {
      for (const i of d.indicadores) {
        expect(i.evaluado).toBe(false);
        expect(i.puntos).toBe(0);
        expect(i.motivo.length).toBeGreaterThan(0);
      }
      expect(d.cobertura).toBe(0);
      expect(d.valor).toBeNull();
    }
    expect(s.coberturaGlobal).toBe(0);
    expect(s.global).toBeNull();
  });

  it("con la mitad de cobertura la dimensión puntúa: round(100·Σpuntos/Σmáximo) sobre lo evaluado", () => {
    // móvil 80 -> 28/35 y accesibilidad 50 -> 12.5 redondea a 13/25; buenas prácticas y CrUX sin dato.
    const raw = vacio({ pagespeed: pagespeed({ accesibilidad: 50, buenasPracticas: null, seo: null, campo: null }) });
    const e = dim(score(raw), "experiencia");
    expect(e.cobertura).toBe(0.5);
    expect(e.valor).toBe(Math.round((100 * (28 + 13)) / 60)); // 68
  });

  it("error de PageSpeed: experiencia null y sus indicadores no evaluados", () => {
    const raw = makeRaw({ pagespeed: { ...ps(80, 90), accesibilidad: 90, error: "timeout" } });
    const e = dim(score(raw), "experiencia");
    expect(e.indicadores.every((i) => !i.evaluado)).toBe(true);
    expect(e.cobertura).toBe(0);
    expect(e.valor).toBeNull();
  });
});

describe("calcularScore: global", () => {
  it("cobertura global ~0.5 con 3 dimensiones puntuables: global null", () => {
    // experiencia 4/4, confianza 6/7 (sin web no hay testimonios), adquisición 4/6 -> (1 + 6/7 + 4/6) / 5 ≈ 0.50
    const raw = vacio({
      pagespeed: pagespeed(),
      legal: legalCompleto(),
      rdap: { registeredAt: "2015-03-02" },
      dns,
      tranco: { rank: 5000, trend: null },
      sitemap: sitemap(),
    });
    const s = score(raw);
    for (const c of ["experiencia", "confianza", "adquisicion"] as const) expect(dim(s, c).valor).not.toBeNull();
    expect(s.coberturaGlobal).toBeCloseTo(0.505, 2);
    expect(s.global).toBeNull();
  });

  it("cobertura global baja (solo experiencia y legal): global null", () => {
    const raw = vacio({ pagespeed: pagespeed(), legal: legalCompleto() });
    const s = score(raw);
    expect(s.coberturaGlobal).toBeLessThan(0.6);
    expect(s.global).toBeNull();
  });

  it("menos de 3 dimensiones puntuables: global null aunque la cobertura sea alta", () => {
    const s = score(completo(), { adn: adnCompleto(), rev: revCompleta() });
    expect(s.global).not.toBeNull();
    const parcial = score(vacio({ pagespeed: pagespeed(), legal: legalCompleto(), rdap: { registeredAt: "2015-03-02" }, dns }));
    expect(parcial.dimensiones.filter((d) => d.valor !== null).length).toBeLessThan(3);
    expect(parcial.global).toBeNull();
  });

  it("pesos renormalizados cuando una dimensión es null", () => {
    // PageSpeed caído: experiencia null y a adquisición le falta SEO técnico; el global promedia las otras 4.
    const raw = completo({ pagespeed: { ...ps(null, null), error: "timeout" } });
    const s = score(raw, { adn: adnCompleto(), rev: revCompleta() });
    expect(dim(s, "experiencia").valor).toBeNull();
    expect(dim(s, "propuesta").valor).toBe(100);
    expect(dim(s, "oferta").valor).toBe(85);
    expect(dim(s, "adquisicion").valor).toBe(86); // (11 + 15 + 15 + 8 + 20) / 80 = 86.25
    expect(dim(s, "confianza").valor).toBe(100);
    // Cada peso pasa de 0.2 a 0.25: (100 + 85 + 86 + 100) / 4 = 92.75
    expect(s.global).toBe(93);
    expect(s.coberturaGlobal).toBeCloseTo((1 + 1 + 0 + 5 / 6 + 1) / 5, 5);
  });
});

describe("calcularScore: indicadores", () => {
  it("popularidad: fuera del ranking puntúa bajo solo si Tranco respondió ok; si falló no se evalúa", () => {
    const fuera = vacio({ tranco: { rank: null, trend: null }, fuentes: { ...FUENTES, tranco: "ok", radar: "fallo" } });
    const i = ind(score(fuera), "adquisicion", "popularidad");
    expect(i.evaluado).toBe(true);
    expect(i.puntos).toBe(3);
    expect(ind(score(vacio()), "adquisicion", "popularidad").evaluado).toBe(false);
  });

  it("popularidad: tramos de ranking", () => {
    const con = (rank: number) => ind(score(vacio({ tranco: { rank, trend: null } })), "adquisicion", "popularidad").puntos;
    expect(con(5000)).toBe(20);
    expect(con(50_000)).toBe(15);
    expect(con(500_000)).toBe(10);
    expect(con(5_000_000)).toBe(5);
  });

  it("confianza: sin raw.legal no se evalúan los 4 indicadores legales; con legal vacío valen 0 evaluados", () => {
    const sin = score(vacio());
    const claves = ["aviso_legal", "privacidad", "identidad_legal", "contacto"];
    for (const c of claves) expect(ind(sin, "confianza", c).evaluado).toBe(false);
    const vacioLegal = score(vacio({ legal: legalCompleto({ avisoLegal: null, privacidad: null, cif: null, razonSocial: null, email: null, telefono: null }) }));
    for (const c of claves) {
      expect(ind(vacioLegal, "confianza", c).evaluado).toBe(true);
      expect(ind(vacioLegal, "confianza", c).puntos).toBe(0);
    }
  });

  it("confianza: adjunta las evidencias dato:* correspondientes", () => {
    const s = score(vacio({ legal: legalCompleto({ privacidad: null, razonSocial: null, email: null, telefono: null }) }));
    expect(ind(s, "confianza", "aviso_legal").evidencias.map((e) => e.id)).toEqual(["dato:aviso_legal"]);
    expect(ind(s, "confianza", "identidad_legal").puntos).toBe(8);
    expect(ind(s, "confianza", "identidad_legal").evidencias.map((e) => e.id)).toEqual(["dato:cif"]);
  });

  it("dominio antiguo: usa collectedAt como referencia", () => {
    expect(ind(score(vacio({ rdap: { registeredAt: "2015-03-02" } })), "confianza", "dominio_antiguo").puntos).toBe(15);
    expect(ind(score(vacio({ rdap: { registeredAt: "2024-01-01" } })), "confianza", "dominio_antiguo").puntos).toBe(8);
    const reciente = ind(score(vacio({ rdap: { registeredAt: "2026-01-01" } })), "confianza", "dominio_antiguo");
    expect(reciente.evaluado).toBe(true);
    expect(reciente.puntos).toBe(0);
  });

  it("propuesta: el modelo de negocio puntúa según el estado calculado en código", () => {
    const sin = score(makeRaw(), { adn: mkAdn() });
    expect(ind(sin, "propuesta", "modelo_negocio").puntos).toBe(0);
    // comoSeContrata con página pero sin estado confirmado: no cuenta como confirmado.
    const soloTexto = mkAdn({ lineas: [lineaAdn({ comoSeContrata: "Suscripción", evidencias: [pagina("p1-e1")] })] });
    expect(ind(score(makeRaw(), { adn: soloTexto }), "propuesta", "modelo_negocio").puntos).toBe(0);
    const probable = score(makeRaw(), { adn: mkAdn({ modeloEstado: "probable" }) });
    expect(ind(probable, "propuesta", "modelo_negocio").puntos).toBe(10);
    const con = score(makeRaw(), { adn: adnCompleto() });
    expect(ind(con, "propuesta", "modelo_negocio").puntos).toBe(20);
    expect(ind(con, "propuesta", "modelo_negocio").evidencias).toHaveLength(1);
  });

  it("oferta: el canal de conversión exige un canal con evidencia, no basta un CTA", () => {
    const raw = makeRaw();
    expect(ind(score(raw, { adn: mkAdn() }), "oferta", "canal_conversion").puntos).toBe(0);
    const con = ind(score(raw, { adn: adnCompleto() }), "oferta", "canal_conversion");
    expect(con.puntos).toBe(20);
    expect(con.evidencias).toHaveLength(1);
  });

  it("propuesta: la claridad agrega propuestaClara y diceAQuien de la revisión", () => {
    const rev = mkRev([{ ...checks("no_aplica"), propuestaClara: "si", diceAQuien: "no" }]);
    const i = ind(score(makeRaw(), { rev }), "propuesta", "claridad_web");
    expect(i.evaluado).toBe(true);
    expect(i.puntos).toBe(15); // 1 de 2 sobre 30
    expect(ind(score(makeRaw(), { rev: null }), "propuesta", "claridad_web").evaluado).toBe(false);
  });

  it("oferta: una web con poco texto no prueba que falten precios, plan gratuito ni pagos", () => {
    const raw = makeRaw({ site: makeSite({ pricesFound: [], hasPricingPage: false, hasFreePlanOrTrial: false, ctas: [], textLength: 200 }) });
    const s = score(raw);
    for (const c of ["precios_publicados", "plan_gratuito", "pagos", "canal_conversion"]) expect(ind(s, "oferta", c).evaluado).toBe(false);
  });
});

describe("calcularScore: indicadores que no aplican al tipo de negocio", () => {
  const datoContacto: Evidence = { id: "dato:contacto", tipo: "dato", texto: "Contacto publicado: correo teb@teb.example", fuente: "legal" };
  const tebRaw = () => makeRaw({ site: makeSite({ pricesFound: [], hasPricingPage: false, hasFreePlanOrTrial: false, technologies: [], ctas: [], textLength: 4000 }) });
  const tebAdn = (tipo: Adn["tipoNegocio"]) => mkAdn({ tipoNegocio: tipo, canales: [{ tipo: "contacto", evidencias: [pagina("p2-e1")] }] });
  const NO_APLICAN = ["plan_gratuito", "pagos", "pagina_precios"];

  it("organización social (caso TEB): plan gratuito, pagos y página de precios no aplican ni puntúan", () => {
    const s = score(tebRaw(), { adn: tebAdn("organizacion_social") });
    for (const c of NO_APLICAN) {
      const i = ind(s, "oferta", c);
      expect(i.aplica, c).toBe(false);
      expect(i.evaluado, c).toBe(false);
      expect(i.puntos, c).toBe(0);
      expect(i.motivo, c).toBe("No aplica a este tipo de negocio");
    }
    // Precios publicados y canal de conversión siempre aplican.
    expect(ind(s, "oferta", "precios_publicados").aplica).toBe(true);
    expect(ind(s, "oferta", "canal_conversion").aplica).toBe(true);
  });

  it("la cobertura y el valor se calculan solo sobre los indicadores aplicables (no se penaliza por no ser SaaS)", () => {
    const o = dim(score(tebRaw(), { adn: tebAdn("organizacion_social") }), "oferta");
    expect(o.cobertura).toBe(1); // 2 evaluados / 2 aplicables, no 2/5
    expect(o.valor).toBe(Math.round((100 * 20) / 45)); // canal 20 de (precios 25 + canal 20)
  });

  it("el mismo negocio como SaaS sí puntúa 0 en plan gratuito, pagos y página de precios", () => {
    const s = score(tebRaw(), { adn: tebAdn("saas") });
    for (const c of NO_APLICAN) expect(ind(s, "oferta", c).aplica, c).toBe(true);
    expect(ind(s, "oferta", "plan_gratuito").evaluado).toBe(true);
    expect(ind(s, "oferta", "pagos").evaluado).toBe(true);
    expect(dim(s, "oferta").valor).toBeLessThan(50);
  });

  it.each([
    ["saas", [true, true, true]],
    ["app", [true, true, true]],
    ["ecommerce", [false, true, true]],
    ["marketplace", [false, true, true]],
    ["servicios", [false, false, false]],
    ["contenido_ads", [false, false, false]],
    ["negocio_local", [false, false, false]],
    ["otro", [false, false, false]],
  ] as const)("tipo %s: aplica plan_gratuito, pagos, pagina_precios = %j", (tipo, [plan, pagos, precios]) => {
    const s = score(tebRaw(), { adn: tebAdn(tipo) });
    expect(ind(s, "oferta", "plan_gratuito").aplica).toBe(plan);
    expect(ind(s, "oferta", "pagos").aplica).toBe(pagos);
    expect(ind(s, "oferta", "pagina_precios").aplica).toBe(precios);
  });

  it("todos los demás indicadores aplican siempre", () => {
    const s = score(completo(), { adn: tebAdn("organizacion_social"), rev: revCompleta() });
    const noAplican = s.dimensiones.flatMap((d) => d.indicadores).filter((i) => !i.aplica).map((i) => i.clave);
    expect(noAplican.sort()).toEqual([...NO_APLICAN].sort());
  });

  it("canal de contacto de respaldo (evidencia dato:contacto) cuenta en el indicador de conversión", () => {
    const adn = mkAdn({ tipoNegocio: "organizacion_social", canales: [{ tipo: "contacto", evidencias: [datoContacto] }] });
    const i = ind(score(tebRaw(), { adn }), "oferta", "canal_conversion");
    expect(i.evaluado).toBe(true);
    expect(i.puntos).toBe(20);
    expect(i.evidencias.map((e) => e.id)).toEqual(["dato:contacto"]);
  });
});

describe("calcularScore: fixture completo con global calculado a mano", () => {
  it("global = media de las 5 dimensiones", () => {
    const s = score(completo(), { adn: adnCompleto(), rev: revCompleta() });

    // propuesta: qué es 25 + propuesta de valor 25 + claridad 30 + modelo 20 = 100/100
    expect(dim(s, "propuesta").valor).toBe(100);
    // oferta: precios 25 + página 15 + canal 20 + plan gratuito 0 + pagos 25 = 85/100
    expect(dim(s, "oferta").valor).toBe(85);
    // experiencia: móvil 80% de 35 = 28 + accesibilidad 25 + buenas prácticas 50% de 20 = 10 + CrUX FAST 20 = 83/100
    expect(dim(s, "experiencia").valor).toBe(83);
    // adquisición: SEO 18 + títulos (2+1)/4 de 15 = 11.25 -> 11 + sitemap 60 págs 15 + blog 15 + redes (2) 8 + popularidad top 10k 20 = 87/100
    expect(dim(s, "adquisicion").valor).toBe(87);
    // confianza: aviso 15 + privacidad 15 + identidad 15 + contacto 15 + testimonios 10 + dominio 15 + correo 15 = 100/100
    expect(dim(s, "confianza").valor).toBe(100);

    expect(s.dimensiones.every((d) => d.cobertura === 1)).toBe(true);
    expect(s.coberturaGlobal).toBe(1);
    expect(s.global).toBe(91); // (100 + 85 + 83 + 87 + 100) / 5 = 91
  });
});
