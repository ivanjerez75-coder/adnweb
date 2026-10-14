import type { Confidence, Range, RawData } from "./types";

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

export interface Anchors {
  visitasMes: Range | null;
  confianzaTrafico: Confidence;
  antiguedadAnios: number | null;
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
  };
}
