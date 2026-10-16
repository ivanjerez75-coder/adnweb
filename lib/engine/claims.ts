import type { Signal, SignalPolarity } from "./types";

export interface Claim {
  texto: string;
  evidencias: Signal[];
}

export function validateClaims(
  claims: { texto: string; senales: string[] }[],
  signals: Signal[],
  polarity: SignalPolarity,
  max = 3,
): Claim[] {
  const byId = new Map(signals.filter((s) => s.polarity === polarity).map((s) => [s.id, s]));
  return claims
    .map((c) => ({
      texto: c.texto,
      evidencias: Array.from(new Set(c.senales))
        .map((id) => byId.get(id))
        .filter((s): s is Signal => s !== undefined),
    }))
    .filter((c) => c.evidencias.length > 0)
    .slice(0, max);
}
