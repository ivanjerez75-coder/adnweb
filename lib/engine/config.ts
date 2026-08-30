/**
 * Central configuration for the NONNA MVP. Everything a future integration would
 * pull from a pricing service, CMS, or feature flags lives here for now.
 */

import type { ClosureType, InsoleType, ShoeColor } from "./types";

/** Base price of a made-to-measure pair, in whole euros. */
export const BASE_PRICE_EUR = 129;

/** Price deltas applied on top of the base, in whole euros. */
export const PRICE_DELTAS = {
  insole: {
    comfort: 0,
    "extra-cushion": 10,
  } satisfies Record<InsoleType, number>,
  closure: {
    velcro: 0,
    laces: 0,
    "slip-on": 6,
  } satisfies Record<ClosureType, number>,
};

/** Timing of the simulated scan (7 stages). Tune to taste. */
export const SCAN_STAGE_MS = 850;

/** Timing of the "creating your shoe" sequence (8 steps). */
export const BUILD_STEP_MS = 720;

export const COLOR_OPTIONS: Array<{
  value: ShoeColor;
  label: string;
  swatch: string;
}> = [
  { value: "black", label: "Negro", swatch: "#26262b" },
  { value: "beige", label: "Beige", swatch: "#d8c9b0" },
  { value: "navy", label: "Azul oscuro", swatch: "#2b3a5b" },
  { value: "gray", label: "Gris", swatch: "#9aa0a3" },
];

export const CLOSURE_OPTIONS: Array<{
  value: ClosureType;
  label: string;
  hint: string;
}> = [
  { value: "velcro", label: "Velcro", hint: "Apertura fácil, sin agacharse" },
  { value: "laces", label: "Cordones", hint: "Ajuste clásico y firme" },
  { value: "slip-on", label: "Slip-on", hint: "Se calza de un paso" },
];

export const INSOLE_OPTIONS: Array<{
  value: InsoleType;
  label: string;
  hint: string;
}> = [
  { value: "comfort", label: "Confort", hint: "Amortiguación equilibrada" },
  {
    value: "extra-cushion",
    label: "Extra acolchada",
    hint: "Máxima absorción de impactos",
  },
];
