import type { Confidence, Range, RawData, WikidataData } from "./types";

// Tabla orientativa ranking → visitas/mes. Documentada en docs/decisiones/0003-anclas-de-trafico.md.
const RANK_TABLE: [maxRank: number, min: number, max: number][] = [
  [100, 500_000_000, 5_000_000_000],
  [1_000, 50_000_000, 500_000_000],
  [10_000, 5_000_000, 50_000_000],
  [100_000, 500_000, 5_000_000],
  [1_000_000, 50_000, 500_000],
];

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function visitsFromRank(rank: number): Range {
  for (const [maxRank, min, max] of RANK_TABLE) {
    if (rank <= maxRank) return { min, max };
  }
  return { min: 0, max: 50_000 };
}

/** Un ranking solo es utilizable si es un número finito y positivo. */
export function validRank(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null;
}

/** Ranking de Radar utilizable: el rango exacto si existe, si no la franja. */
export function radarRank(radar: RawData["radar"]): number | null {
  return validRank(radar?.rank) ?? validRank(radar?.bucket);
}

export type TipoNegocio = "saas" | "ecommerce" | "marketplace" | "contenido_ads" | "servicios" | "app" | "otro";

export interface RevenueAnchor {
  range: Range;
  confianza: Confidence;
  base: string;
}

export const FX_TO_EUR: Record<string, number> = { EUR: 1, USD: 0.92, GBP: 1.17 };

export const REVENUE_PER_EMPLOYEE_EUR: Record<TipoNegocio, number> = {
  saas: 150_000,
  ecommerce: 250_000,
  marketplace: 200_000,
  contenido_ads: 120_000,
  servicios: 100_000,
  app: 150_000,
  otro: 120_000,
};

export function publicRevenueAnchor(w: WikidataData | null): RevenueAnchor | null {
  const r = w?.revenue;
  if (!r) return null;
  const fx = FX_TO_EUR[r.currency];
  if (!fx || !(r.amount > 0)) return null;
  const eur = r.amount * fx;
  return {
    range: { min: Math.round(eur * 0.9), max: Math.round(eur * 1.1) },
    confianza: "alta",
    base: `Ingresos públicos (Wikidata${r.year ? `, ${r.year}` : ""}): ${Math.round(eur)} €`,
  };
}

export function employeeRevenueAnchor(employees: number | null, tipo: TipoNegocio): RevenueAnchor | null {
  if (employees === null || !(employees > 0)) return null;
  const perEmployee = REVENUE_PER_EMPLOYEE_EUR[tipo];
  const mid = employees * perEmployee;
  return {
    range: { min: Math.round(mid * 0.5), max: Math.round(mid * 1.5) },
    confianza: "media",
    base: `${employees} empleados × ${perEmployee} € por empleado (${tipo})`,
  };
}

export interface Anchors {
  visitasMes: Range | null;
  confianzaTrafico: Confidence;
  antiguedadAnios: number | null;
  ingresosPublicos: RevenueAnchor | null;
  empleados: number | null;
}

export function computeAnchors(raw: RawData, now: Date): Anchors {
  const trancoRank = validRank(raw.tranco?.rank);
  const radarValue = radarRank(raw.radar);
  const rank = trancoRank ?? radarValue;

  let visitasMes: Range | null = null;
  if (rank !== null) visitasMes = visitsFromRank(rank);
  else if (raw.tranco || raw.radar) visitasMes = { min: 0, max: 50_000 }; // consultado, pero fuera de los rankings

  const born = raw.rdap?.registeredAt ?? raw.wayback?.firstCapture ?? null;

  return {
    visitasMes,
    confianzaTrafico: trancoRank !== null && radarValue !== null ? "media" : "baja",
    antiguedadAnios: born ? Math.floor((now.getTime() - Date.parse(born)) / YEAR_MS) : null,
    ingresosPublicos: publicRevenueAnchor(raw.wikidata),
    empleados: raw.wikidata?.employees ?? null,
  };
}
