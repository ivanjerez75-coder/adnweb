import type { RawData, Signal } from "../types";
import type { Facts } from "../facts";
import { allTechnologies } from "../signals";
import { radarRank, validRank } from "../anchors";
import type { Evidence } from "./evidence";
import type { Adn } from "./sections/adn";
import type { Revision } from "./sections/revision";
import { contienePalabra, normalizarTexto } from "./sections/competidores";

export const AVISO_SCORE = "Resume indicadores públicos; no es una valoración financiera." as const;

export type ClaveCriterio = "claridad" | "visibilidad" | "monetizacion" | "confianza" | "presencia" | "novedad";

export interface CriterioScore {
  clave: ClaveCriterio;
  nombre: string;
  /** 0-100, o null = "No puntuable" (faltan datos). */
  valor: number | null;
  motivos: string[];
  evidencias: Evidence[];
}
export interface DnaScore {
  criterios: CriterioScore[];
  global: number | null;
  aviso: typeof AVISO_SCORE;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

type Parcial = Omit<CriterioScore, "clave" | "nombre">;
const NULO: Parcial = { valor: null, motivos: [], evidencias: [] };

function ev(reg: Map<string, Evidence>, ids: (string | null | undefined | false)[]): Evidence[] {
  const out: Evidence[] = [];
  for (const id of ids) {
    const e = id ? reg.get(id) : undefined;
    if (e && !out.some((o) => o.id === e.id)) out.push(e);
  }
  return out;
}

function claridad(revision: Revision | null): Parcial {
  if (!revision) return NULO;
  let si = 0;
  let validos = 0;
  for (const l of revision.lineas) {
    for (const v of Object.values(l.checks)) {
      if (v === "no_aplica") continue;
      validos++;
      if (v === "si") si++;
    }
  }
  if (validos < 3) return NULO;
  const evidencias: Evidence[] = [];
  for (const l of revision.lineas) for (const e of l.evidenciasChecks) if (!evidencias.some((o) => o.id === e.id)) evidencias.push(e);
  return { valor: clamp((si / validos) * 100), motivos: [`${si} de ${validos} comprobaciones de claridad cumplidas`], evidencias };
}

function visibilidad(raw: RawData, ids: Set<string>, reg: Map<string, Evidence>): Parcial {
  if (!raw.tranco && !raw.radar) return NULO;
  const rank = validRank(raw.tranco?.rank) ?? radarRank(raw.radar);
  let base: number;
  let tramo: string;
  if (rank !== null && rank <= 10_000) [base, tramo] = [85, "top 10.000"];
  else if (rank !== null && rank <= 100_000) [base, tramo] = [65, "top 100.000"];
  else if (rank !== null && rank <= 1_000_000) [base, tramo] = [45, "top 1 millón"];
  else [base, tramo] = [25, "fuera del top 1 millón"];
  const motivos = [`${base}: tráfico ${tramo}`];
  let v = base;
  if (ids.has("blog_activo")) {
    v += 10;
    motivos.push("+10: blog activo");
  }
  if (ids.has("pagespeed_movil_bajo")) {
    v -= 10;
    motivos.push("-10: rendimiento móvil bajo");
  }
  return {
    valor: clamp(v),
    motivos,
    evidencias: ev(reg, ["dato:trafico", ids.has("blog_activo") && "blog_activo", ids.has("pagespeed_movil_bajo") && "pagespeed_movil_bajo"]),
  };
}

function monetizacion(raw: RawData, facts: Facts, adn: Adn): Parcial {
  if (!raw.site) return NULO;
  let v = 30;
  const motivos = ["30: base"];
  const evidencias: Evidence[] = [];
  if (raw.site.pricesFound.length > 0 || facts.paginaPrecios === "si") {
    v += 30;
    motivos.push("+30: precios detectados");
  }
  const lineasContratacion = adn.lineas.filter((l) => l.comoSeContrata.trim() !== "" && l.evidencias.some((e) => e.tipo === "pagina"));
  if (lineasContratacion.length > 0) {
    v += 20;
    motivos.push("+20: se explica cómo se contrata");
    for (const l of lineasContratacion) for (const e of l.evidencias) if (!evidencias.some((o) => o.id === e.id)) evidencias.push(e);
  }
  if (allTechnologies(raw).some((t) => t.category === "pagos")) {
    v += 20;
    motivos.push("+20: tecnología de pagos detectada");
  }
  return { valor: clamp(v), motivos, evidencias };
}

function confianza(raw: RawData, ids: Set<string>, revision: Revision | null, reg: Map<string, Evidence>): Parcial {
  let v = 0;
  let inputs = 0;
  const motivos: string[] = [];
  const evId: (string | false)[] = [];

  if (raw.rdap) {
    inputs++;
    if (ids.has("empresa_consolidada")) {
      v += 25;
      motivos.push("+25: empresa consolidada");
      evId.push("empresa_consolidada");
    }
  }
  const casosSi = revision?.lineas.some((l) => l.checks.muestraCasos === "si") ?? false;
  const casosConocidos = revision?.lineas.some((l) => l.checks.muestraCasos !== "no_aplica") ?? false;
  if (raw.site || casosConocidos) {
    inputs++;
    if (raw.site?.hasTestimonials || casosSi) {
      v += 25;
      motivos.push("+25: testimonios o casos de éxito");
    }
  }
  if (raw.fuentes.wikidata === "ok") {
    inputs++;
    if (raw.wikidata) {
      v += 25;
      motivos.push("+25: datos públicos en Wikidata");
      evId.push("dato:fundacion", "dato:empleados", "dato:ingresos", "dato:sede");
    }
  }
  if (raw.dns) {
    inputs++;
    if (raw.dns.emailProvider !== "Ninguno") {
      v += 25;
      motivos.push("+25: correo corporativo");
      evId.push("dato:email");
    }
  }
  if (raw.rdap) {
    inputs++;
    if (ids.has("dominio_reciente")) {
      v -= 25;
      motivos.push("-25: dominio reciente");
      evId.push("dominio_reciente");
    }
  }
  if (inputs < 2) return NULO;
  return { valor: clamp(v), motivos, evidencias: ev(reg, evId) };
}

function presencia(raw: RawData, facts: Facts, reg: Map<string, Evidence>): Parcial {
  if (!raw.site) return NULO;
  let v = 0;
  const motivos: string[] = [];
  const n = facts.redes.length;
  if (n >= 3) {
    v += 30;
    motivos.push(`+30: ${n} redes sociales`);
  } else if (n >= 1) {
    v += 15;
    motivos.push(`+15: ${n} red(es) social(es)`);
  }
  if (facts.blog === "si") {
    v += 20;
    motivos.push("+20: tiene blog");
  }
  if (facts.app === "si") {
    v += 20;
    motivos.push("+20: tiene app");
  }
  const lm = raw.sitemap?.lastModified ? Date.parse(raw.sitemap.lastModified) : NaN;
  const ref = Date.parse(raw.collectedAt);
  if (Number.isFinite(lm) && Number.isFinite(ref) && ref - lm >= 0 && ref - lm <= 90 * DAY_MS) {
    v += 30;
    motivos.push("+30: actividad reciente (últimos 90 días)");
  }
  return { valor: clamp(v), motivos, evidencias: ev(reg, [facts.app === "si" && raw.appstore && "dato:app"]) };
}

function novedad(adn: Adn, textosCompetidores: string[]): Parcial {
  if (textosCompetidores.length < 2) return NULO;
  const textos = textosCompetidores.map(normalizarTexto);
  const items = [...new Set(adn.lineas.flatMap((l) => l.queOfrece).map(normalizarTexto).filter((t) => t.length > 0))];
  if (items.length === 0) return NULO;
  const nuevos = items.filter((i) => !textos.some((t) => contienePalabra(t, i)));
  return {
    valor: clamp(50 + 10 * nuevos.length),
    motivos: nuevos.length > 0 ? ["50: base", `+${10 * nuevos.length}: ${nuevos.length} oferta(s) que no aparecen en ${textos.length} competidores verificados`] : ["50: base"],
    evidencias: [],
  };
}

/** DNA Score: reglas transparentes calculadas por código. Un criterio sin datos suficientes es null. */
export function calcularScore(
  raw: RawData,
  facts: Facts,
  signals: Signal[],
  adn: Adn,
  revision: Revision | null,
  textosCompetidores: string[],
  reg: Map<string, Evidence> = new Map(),
): DnaScore {
  const ids = new Set(signals.map((s) => s.id));
  const criterios: CriterioScore[] = [
    { clave: "claridad", nombre: "Claridad", ...claridad(revision) },
    { clave: "visibilidad", nombre: "Visibilidad", ...visibilidad(raw, ids, reg) },
    { clave: "monetizacion", nombre: "Monetización", ...monetizacion(raw, facts, adn) },
    { clave: "confianza", nombre: "Confianza y madurez", ...confianza(raw, ids, revision, reg) },
    { clave: "presencia", nombre: "Presencia digital", ...presencia(raw, facts, reg) },
    { clave: "novedad", nombre: "Novedad", ...novedad(adn, textosCompetidores) },
  ];
  const valores = criterios.map((c) => c.valor).filter((v): v is number => v !== null);
  const global = valores.length >= 3 ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : null;
  return { criterios, global, aviso: AVISO_SCORE };
}

