/**
 * Shared domain types for the NONNA engine layer.
 *
 * Every simulated module in `lib/engine/*` speaks in these types. UI code only
 * ever imports from here and from the engine modules — never inline simulation
 * logic in components. When real technology replaces a simulation (3D scan SDK,
 * ML recommendation model, parametric configurator, Stripe, order backend), the
 * new implementation keeps the same signature and these types stay put.
 */

export type FootWidth = "narrow" | "normal" | "wide" | "extra-wide";

export type Level = "low" | "medium" | "high";

export type ClosureType = "velcro" | "laces" | "slip-on";

export type InsoleType = "comfort" | "extra-cushion";

export type ShoeColor = "black" | "beige" | "navy" | "gray";

export type FootFeature =
  | "bunion"
  | "hammer-toes"
  | "swollen-feet"
  | "swollen-ankles"
  | "high-instep"
  | "none";

export type DiscomfortZone =
  | "toes"
  | "forefoot"
  | "heel"
  | "sides"
  | "ankle"
  | "whole-sole";

export type Priority =
  | "comfort"
  | "stability"
  | "cushioning"
  | "easy-on"
  | "lightweight";

export type Usage = "home" | "walking" | "outings" | "all-day";

export type BendDifficulty = "yes" | "some" | "no";

export type FitPreference = "roomy" | "standard" | "snug";

export interface TestAnswers {
  footShape: FootWidth;
  features: FootFeature[];
  discomfort: DiscomfortZone[];
  priority: Priority;
  usage: Usage;
  /** "¿Te cuesta agacharte para atarte los zapatos?" — optional, set by the wizard. */
  bendDifficulty?: BendDifficulty;
  /** "¿Usas plantillas ortopédicas?" — optional, set by the wizard. */
  usesOrthotics?: "yes" | "no";
  /** "¿Cómo prefieres el ajuste?" — optional, set by the wizard. */
  fitPreference?: FitPreference;
}

export interface FootProfile {
  /** Recommended last width. */
  width: FootWidth;
  /** Space in the forefoot / toe area. */
  toeBox: Level;
  /** Instep (empeine) volume. */
  instep: Level;
  stability: Level;
  cushioning: Level;
  /** Recommended closure system. `velcro` is labelled "Apertura fácil". */
  closure: ClosureType;
  /** Detected features carried through from the test. */
  flags: FootFeature[];
  /** Short human-readable reasons for each decision, seeds for `copy.ts`. */
  rationale: string[];
}

export interface FootMeasurements {
  lengthMm: number;
  widthMm: number;
  instepHeightMm: number;
  heelWidthMm: number;
  /** 0..1, lower = flatter arch. */
  archIndex: number;
  pressureZones: Array<{ zone: string; level: Level }>;
}

export interface ScanResult {
  left: FootMeasurements;
  right: FootMeasurements;
}

export interface ShoeConfig {
  color: ShoeColor;
  closure: ClosureType;
  insole: InsoleType;
}

/**
 * Normalized geometry knobs consumed by <ShoeVisual/>. All values are 0..1
 * unless noted. A real parametric configurator would produce the same envelope.
 */
export interface ShoeSpec {
  widthScale: number;
  toeBoxSpace: number;
  instepVolume: number;
  midsoleThickness: number;
  heelCounterStiffness: number;
  config: ShoeConfig;
  profile: FootProfile;
}

export type OrderStatus =
  | "designing"
  | "manufacturing"
  | "shipped"
  | "delivered";

export interface Order {
  id: string;
  createdAt: string;
  priceEur: number;
  shoe: ShoeSpec;
  status: OrderStatus;
}

/** One step of the simulated scan, surfaced to the UI via `onStage`. */
export interface ScanStage {
  key: string;
  label: string;
  /** 0..1 overall progress once this stage completes. */
  progress: number;
}

/** One step of the "creating your shoe" sequence. */
export interface BuildStep {
  key: string;
  label: string;
  durationMs: number;
}
