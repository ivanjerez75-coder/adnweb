/**
 * The 8-step test, as data. Each step maps to one key of `TestAnswers`.
 * `kind: "single"` stores the chosen value; `kind: "multi"` stores an array.
 */

import type { TestAnswers } from "@/lib/engine/types";

export interface QuestionOption {
  value: string;
  label: string;
  /** Simple inline SVG-free glyph shown large on the option card. */
  icon: string;
}

export interface Question {
  id: keyof TestAnswers;
  kind: "single" | "multi";
  title: string;
  help?: string;
  options: QuestionOption[];
}

export const QUESTIONS: Question[] = [
  {
    id: "footShape",
    kind: "single",
    title: "¿Cómo describirías tus pies?",
    options: [
      { value: "narrow", label: "Estrechos", icon: "▏" },
      { value: "normal", label: "Normales", icon: "▎" },
      { value: "wide", label: "Anchos", icon: "▍" },
      { value: "extra-wide", label: "Muy anchos", icon: "▊" },
    ],
  },
  {
    id: "features",
    kind: "multi",
    title: "¿Tienes alguna de estas características?",
    help: "Puedes elegir varias.",
    options: [
      { value: "bunion", label: "Juanete", icon: "◑" },
      { value: "hammer-toes", label: "Dedos en martillo", icon: "︿" },
      { value: "swollen-feet", label: "Pies hinchados", icon: "◯" },
      { value: "swollen-ankles", label: "Tobillos hinchados", icon: "◍" },
      { value: "high-instep", label: "Empeine alto", icon: "◠" },
      { value: "none", label: "Ninguna", icon: "–" },
    ],
  },
  {
    id: "discomfort",
    kind: "multi",
    title: "¿Dónde notas más molestias?",
    help: "Puedes elegir varias.",
    options: [
      { value: "toes", label: "Dedos", icon: "•••" },
      { value: "forefoot", label: "Parte delantera", icon: "◗" },
      { value: "heel", label: "Talón", icon: "◔" },
      { value: "sides", label: "Laterales", icon: "‹ ›" },
      { value: "ankle", label: "Tobillo", icon: "◡" },
      { value: "whole-sole", label: "Toda la planta", icon: "▭" },
    ],
  },
  {
    id: "priority",
    kind: "single",
    title: "¿Qué es lo más importante para ti?",
    options: [
      { value: "comfort", label: "Máxima comodidad", icon: "❀" },
      { value: "stability", label: "Estabilidad", icon: "⟂" },
      { value: "cushioning", label: "Amortiguación", icon: "◠◡" },
      { value: "easy-on", label: "Fácil de poner", icon: "↧" },
      { value: "lightweight", label: "Ligereza", icon: "✦" },
    ],
  },
  {
    id: "usage",
    kind: "single",
    title: "¿Cuándo la usarás principalmente?",
    options: [
      { value: "home", label: "En casa", icon: "⌂" },
      { value: "walking", label: "Para caminar", icon: "→" },
      { value: "outings", label: "Para salir", icon: "☀" },
      { value: "all-day", label: "Todo el día", icon: "◷" },
    ],
  },
  {
    id: "bendDifficulty",
    kind: "single",
    title: "¿Te cuesta agacharte para atarte los zapatos?",
    options: [
      { value: "yes", label: "Sí, bastante", icon: "↧" },
      { value: "some", label: "Un poco", icon: "↦" },
      { value: "no", label: "No", icon: "↥" },
    ],
  },
  {
    id: "usesOrthotics",
    kind: "single",
    title: "¿Usas plantillas ortopédicas?",
    options: [
      { value: "yes", label: "Sí", icon: "▤" },
      { value: "no", label: "No", icon: "▢" },
    ],
  },
  {
    id: "fitPreference",
    kind: "single",
    title: "¿Cómo prefieres el ajuste?",
    options: [
      { value: "roomy", label: "Holgado", icon: "◇" },
      { value: "standard", label: "Normal", icon: "◈" },
      { value: "snug", label: "Ajustado", icon: "◆" },
    ],
  },
];

/** The wizard shows "Pregunta N de TOTAL_QUESTIONS". */
export const TOTAL_QUESTIONS = QUESTIONS.length;

export function isStepComplete(
  question: Question,
  value: unknown,
): boolean {
  if (question.kind === "multi") return Array.isArray(value) && value.length > 0;
  return typeof value === "string" && value.length > 0;
}
