import type { Confidence, Signal } from "./types";

export interface ProposedOpportunity {
  titulo: string;
  paraQuien: "competir" | "mejorar";
  senales: string[];
}

export interface Opportunity {
  titulo: string;
  paraQuien: "competir" | "mejorar";
  evidencias: Signal[];
  confianza: Confidence;
}

const MAX_SHOWN = 5;
const CONFIDENCE_ORDER: Record<Confidence, number> = { alta: 3, media: 2, baja: 1 };

const sourceCount = (evidence: Signal[]) => new Set(evidence.map((e) => e.source)).size;

export function confidenceFor(evidence: Signal[]): Confidence {
  if (evidence.length >= 4 && sourceCount(evidence) >= 3) return "alta";
  if (evidence.length >= 3) return "media";
  return "baja";
}

export function validateOpportunities(
  proposed: ProposedOpportunity[],
  signals: Signal[],
): { oportunidades: Opportunity[]; pistas: Opportunity[] } {
  const byId = new Map(signals.map((s) => [s.id, s]));
  const oportunidades: Opportunity[] = [];
  const pistas: Opportunity[] = [];

  for (const p of proposed) {
    const evidencias = Array.from(new Set(p.senales))
      .map((id) => byId.get(id))
      .filter((s): s is Signal => s !== undefined);

    if (evidencias.length >= 2 && sourceCount(evidencias) >= 2) {
      oportunidades.push({ titulo: p.titulo, paraQuien: p.paraQuien, evidencias, confianza: confidenceFor(evidencias) });
    } else if (evidencias.length >= 1) {
      pistas.push({ titulo: p.titulo, paraQuien: p.paraQuien, evidencias, confianza: "baja" });
    }
  }

  oportunidades.sort(
    (a, b) =>
      CONFIDENCE_ORDER[b.confianza] - CONFIDENCE_ORDER[a.confianza] || b.evidencias.length - a.evidencias.length,
  );

  return { oportunidades: oportunidades.slice(0, MAX_SHOWN), pistas: pistas.slice(0, MAX_SHOWN) };
}
