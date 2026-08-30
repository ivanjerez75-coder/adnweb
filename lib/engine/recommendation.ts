/**
 * The recommendation engine.
 *
 * `buildFootProfile` is a pure, deterministic function that turns the 8-question
 * test into a structured foot profile. Today it is a small rule set. Later it can
 * be swapped for an ML model or a rules service behind the exact same signature.
 */

import type {
  FootProfile,
  FootWidth,
  Level,
  TestAnswers,
} from "./types";

const WIDTH_ORDER: FootWidth[] = ["narrow", "normal", "wide", "extra-wide"];

function widenBy(width: FootWidth, steps: number): FootWidth {
  const idx = WIDTH_ORDER.indexOf(width);
  const next = Math.min(WIDTH_ORDER.length - 1, Math.max(0, idx + steps));
  return WIDTH_ORDER[next];
}

function highestLevel(...levels: Level[]): Level {
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  return "low";
}

export function buildFootProfile(answers: TestAnswers): FootProfile {
  const rationale: string[] = [];
  const has = (f: (typeof answers.features)[number]) =>
    answers.features.includes(f);
  const hurts = (z: (typeof answers.discomfort)[number]) =>
    answers.discomfort.includes(z);

  // --- Width -------------------------------------------------------------
  let width = answers.footShape;
  if (has("swollen-feet")) {
    width = widenBy(width, 1);
    rationale.push(
      "Has indicado que tus pies se hinchan, así que hemos ampliado la horma para dejar margen a lo largo del día.",
    );
  }
  if (width === "wide" || width === "extra-wide") {
    rationale.push(
      "Tus pies son anchos, por eso partimos de una horma más amplia en toda la zapatilla.",
    );
  }

  // --- Toe box ---------------------------------------------------------------
  let toeBox: Level = "medium";
  if (has("bunion") || has("hammer-toes") || hurts("toes") || hurts("forefoot")) {
    toeBox = "high";
    const reasons: string[] = [];
    if (has("bunion")) reasons.push("juanete");
    if (has("hammer-toes")) reasons.push("dedos en martillo");
    if (hurts("toes") || hurts("forefoot")) reasons.push("molestias en la zona delantera");
    rationale.push(
      `Por ${listToText(reasons)} hemos aumentado el espacio en la parte delantera y elegido una puntera más alta y flexible.`,
    );
  }

  // --- Instep --------------------------------------------------------------
  let instep: Level = "medium";
  if (has("high-instep")) {
    instep = "high";
    rationale.push(
      "Tienes el empeine alto, así que hemos dado más volumen a la parte superior para que no apriete.",
    );
  }
  if (has("swollen-ankles")) {
    instep = "high";
    rationale.push(
      "Como notas hinchazón en los tobillos, hemos abierto el volumen del cuello y facilitado la apertura.",
    );
  }

  // --- Stability ---------------------------------------------------------
  let stability: Level = "medium";
  if (
    answers.priority === "stability" ||
    answers.usage === "all-day" ||
    answers.usage === "walking" ||
    hurts("ankle")
  ) {
    stability = "high";
    rationale.push(
      "Buscas estabilidad y apoyo, por eso reforzamos el contrafuerte del talón y ampliamos la base.",
    );
  }

  // --- Cushioning ------------------------------------------------------
  let cushioning: Level = "medium";
  if (
    answers.priority === "cushioning" ||
    answers.priority === "comfort" ||
    hurts("heel") ||
    hurts("whole-sole")
  ) {
    cushioning = "high";
    rationale.push(
      "La comodidad y la amortiguación son tu prioridad, así que hemos seleccionado una mediasuela más gruesa y blanda.",
    );
  }
  if (answers.priority === "lightweight") {
    cushioning = highestLevel(cushioning, "medium");
    rationale.push(
      "Prefieres una zapatilla ligera, así que hemos ajustado los materiales para reducir el peso sin perder amortiguación.",
    );
  }

  // --- Fit preference ---------------------------------------------------
  if (answers.fitPreference === "roomy") {
    width = widenBy(width, 1);
    rationale.push(
      "Prefieres un ajuste holgado, así que hemos dejado algo más de margen en toda la horma.",
    );
  } else if (answers.fitPreference === "snug") {
    rationale.push(
      "Prefieres un ajuste firme, así que la zapatilla sujeta bien el pie sin apretar en las zonas sensibles.",
    );
  }

  // --- Orthotics --------------------------------------------------------
  if (answers.usesOrthotics === "yes") {
    cushioning = "high";
    instep = highestLevel(instep, "medium");
    rationale.push(
      "Usas plantillas ortopédicas, así que hemos dejado más profundidad interior y una plantilla extraíble.",
    );
  }

  // --- Closure --------------------------------------------------------------
  let closure: FootProfile["closure"] = "laces";
  if (
    answers.priority === "easy-on" ||
    has("swollen-ankles") ||
    has("swollen-feet") ||
    answers.bendDifficulty === "yes" ||
    answers.bendDifficulty === "some"
  ) {
    closure = "velcro";
    rationale.push(
      answers.bendDifficulty === "yes" || answers.bendDifficulty === "some"
        ? "Como te cuesta agacharte, el cierre recomendado es de velcro: se ajusta de un gesto y sin doblarte."
        : "Para que ponerte la zapatilla sea sencillo, el cierre recomendado es de velcro con apertura amplia.",
    );
  }

  // Usage note (context only, no geometry change).
  if (answers.usage === "home") {
    rationale.push(
      "La usarás sobre todo en casa, así que priorizamos una suela flexible y un peso muy contenido.",
    );
  } else if (answers.usage === "outings") {
    rationale.push(
      "La usarás para salir, así que cuidamos el acabado exterior manteniendo toda la comodidad.",
    );
  }

  return {
    width,
    toeBox,
    instep,
    stability,
    cushioning,
    closure,
    flags: answers.features.filter((f) => f !== "none"),
    rationale,
  };
}

function listToText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Human labels for the profile screen. */
export const WIDTH_LABEL: Record<FootWidth, string> = {
  narrow: "Estrecha",
  normal: "Normal",
  wide: "Ancha",
  "extra-wide": "Extra ancha",
};

export const LEVEL_LABEL: Record<Level, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export const LEVEL_LABEL_SPACE: Record<Level, string> = {
  low: "Ajustado",
  medium: "Estándar",
  high: "Amplio",
};
