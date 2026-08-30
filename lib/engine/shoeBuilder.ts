/**
 * The shoe configurator.
 *
 * `getBuildSteps` drives the "Estamos creando tu zapatilla" animation.
 * `buildShoe` is a pure function mapping the foot profile + scan measurements +
 * aesthetic config into normalized geometry knobs for <ShoeVisual/>.
 *
 * Later this becomes a real parametric / CAD configurator; the ShoeSpec envelope
 * stays the same so the visual and the rest of the flow don't change.
 */

import { BUILD_STEP_MS } from "./config";
import type {
  BuildStep,
  FootProfile,
  Level,
  ScanResult,
  ShoeConfig,
  ShoeSpec,
} from "./types";

const LEVEL_VALUE: Record<Level, number> = {
  low: 0.28,
  medium: 0.55,
  high: 0.85,
};

const WIDTH_VALUE: Record<FootProfile["width"], number> = {
  narrow: 0.2,
  normal: 0.42,
  wide: 0.68,
  "extra-wide": 0.9,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function getBuildSteps(): BuildStep[] {
  return [
    { key: "shape", label: "Analizando la forma de tus pies", durationMs: BUILD_STEP_MS },
    { key: "width", label: "Ajustando la anchura", durationMs: BUILD_STEP_MS },
    { key: "toe", label: "Adaptando el espacio para los dedos", durationMs: BUILD_STEP_MS },
    { key: "instep", label: "Ajustando el volumen del empeine", durationMs: BUILD_STEP_MS },
    { key: "stability", label: "Calculando la estabilidad", durationMs: BUILD_STEP_MS },
    { key: "cushion", label: "Seleccionando la amortiguación", durationMs: BUILD_STEP_MS },
    { key: "closure", label: "Configurando el cierre", durationMs: BUILD_STEP_MS },
    { key: "design", label: "Creando tu diseño", durationMs: BUILD_STEP_MS },
  ];
}

export function buildShoe(
  profile: FootProfile,
  scan: ScanResult | null,
  config: ShoeConfig,
): ShoeSpec {
  // Base geometry from the recommendation profile.
  let widthScale = WIDTH_VALUE[profile.width];
  let toeBoxSpace = LEVEL_VALUE[profile.toeBox];
  let instepVolume = LEVEL_VALUE[profile.instep];
  const midsoleThickness = LEVEL_VALUE[profile.cushioning];
  const heelCounterStiffness = LEVEL_VALUE[profile.stability];

  // Nudge with real-ish scan data when we have it, so the shoe "agrees" with
  // what was measured rather than only what was answered.
  if (scan) {
    const avgWidth = (scan.left.widthMm + scan.right.widthMm) / 2;
    // 90mm ~ narrow, 120mm ~ extra wide.
    widthScale = clamp01((widthScale + (avgWidth - 90) / 30) / 2 + 0.001);

    const avgInstep = (scan.left.instepHeightMm + scan.right.instepHeightMm) / 2;
    instepVolume = clamp01((instepVolume + (avgInstep - 55) / 30) / 2 + 0.001);

    const forefootPressure =
      scan.left.pressureZones.find((z) => z.zone === "forefoot")?.level ??
      "medium";
    if (forefootPressure === "high") {
      toeBoxSpace = clamp01(toeBoxSpace + 0.12);
    }
  }

  // Extra-cushion insole visibly thickens the stack a touch.
  const insoleBump = config.insole === "extra-cushion" ? 0.08 : 0;

  return {
    widthScale: clamp01(widthScale),
    toeBoxSpace: clamp01(toeBoxSpace),
    instepVolume: clamp01(instepVolume),
    midsoleThickness: clamp01(midsoleThickness + insoleBump),
    heelCounterStiffness: clamp01(heelCounterStiffness),
    config,
    profile,
  };
}
