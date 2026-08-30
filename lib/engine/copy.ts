/**
 * Dynamic explanation text: "¿Por qué hemos elegido esta configuración?".
 *
 * Pure function. Builds natural Spanish paragraphs from the profile rationale
 * plus the raw answers. Later a language model could generate this; the contract
 * (answers in, string[] out) stays the same.
 */

import type { FootProfile, TestAnswers } from "./types";

export function explainConfig(
  profile: FootProfile,
  answers: TestAnswers,
): string[] {
  const paragraphs: string[] = [];

  // Lead with a personalised opener referencing what the user actually said.
  const said: string[] = [];
  if (profile.width === "wide" || profile.width === "extra-wide") {
    said.push("que tienes los pies anchos");
  }
  if (answers.features.includes("bunion")) said.push("un juanete");
  if (answers.features.includes("hammer-toes")) said.push("dedos en martillo");
  if (answers.features.includes("swollen-feet")) said.push("hinchazón en los pies");
  if (answers.features.includes("swollen-ankles")) said.push("hinchazón en los tobillos");
  if (answers.features.includes("high-instep")) said.push("el empeine alto");

  const discomfortText = discomfortToText(answers.discomfort);

  if (said.length || discomfortText) {
    const parts: string[] = [];
    if (said.length) parts.push(`Nos has contado ${joinEs(said)}`);
    if (discomfortText) {
      parts.push(
        `${said.length ? "y que notas" : "Nos has contado que notas"} molestias ${discomfortText}`,
      );
    }
    paragraphs.push(
      `${parts.join(" ")}. Por eso hemos partido de una configuración pensada para dar sitio donde lo necesitas y quitar presión donde molesta.`,
    );
  } else {
    paragraphs.push(
      "Hemos partido de una configuración de confort equilibrada a partir de tus respuestas.",
    );
  }

  // Then the concrete decisions, taken straight from the engine rationale.
  paragraphs.push(...profile.rationale);

  // Close with the priority.
  paragraphs.push(priorityClosing(answers));

  return dedupe(paragraphs).filter(Boolean);
}

function discomfortToText(zones: TestAnswers["discomfort"]): string {
  const map: Record<TestAnswers["discomfort"][number], string> = {
    toes: "en los dedos",
    forefoot: "en la parte delantera",
    heel: "en el talón",
    sides: "en los laterales",
    ankle: "en el tobillo",
    "whole-sole": "en toda la planta",
  };
  const parts = zones.map((z) => map[z]).filter(Boolean);
  return joinEs(parts);
}

function priorityClosing(answers: TestAnswers): string {
  switch (answers.priority) {
    case "comfort":
      return "Como lo más importante para ti es la comodidad, cada decisión se ha tomado buscando el mayor confort posible.";
    case "stability":
      return "Como priorizas la estabilidad, la zapatilla tiene una base más amplia y un talón bien sujeto.";
    case "cushioning":
      return "Como priorizas la amortiguación, la mediasuela absorbe más el impacto en cada paso.";
    case "easy-on":
      return "Como quieres que sea fácil de poner, el cierre se abre por completo y no hay que agacharse.";
    case "lightweight":
      return "Como prefieres una zapatilla ligera, hemos elegido materiales que reducen el peso manteniendo el confort.";
    default:
      return "";
  }
}

function joinEs(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((s) => s.trim())));
}
