/**
 * Simulated 3D foot scan.
 *
 * `runScan` emits the 7 stage labels on a timer and resolves with realistic
 * per-foot measurements. Left and right differ slightly to demonstrate that each
 * foot is measured independently. Measurements are seeded from the foot profile
 * so the scan "agrees" with the test.
 *
 * The shape of this API — a staged `onStage` callback plus a Promise of
 * measurements, cancellable via `AbortSignal` — matches what a real camera /
 * LiDAR scanning SDK would expose. Swap the body, keep the signature.
 */

import { SCAN_STAGE_MS } from "./config";
import type {
  FootMeasurements,
  FootProfile,
  Level,
  ScanResult,
  ScanStage,
} from "./types";

export const SCAN_STAGES: ScanStage[] = [
  { key: "prepare", label: "Preparando escaneo…", progress: 0.1 },
  { key: "contour", label: "Detectando contorno del pie…", progress: 0.28 },
  { key: "length", label: "Analizando longitud…", progress: 0.44 },
  { key: "width", label: "Analizando anchura…", progress: 0.6 },
  { key: "instep", label: "Analizando empeine…", progress: 0.76 },
  { key: "pressure", label: "Analizando zonas de presión…", progress: 0.92 },
  { key: "done", label: "Escaneo completado", progress: 1 },
];

export const SCAN_TOTAL_MS = SCAN_STAGES.length * SCAN_STAGE_MS;

const WIDTH_BASE_MM: Record<FootProfile["width"], number> = {
  narrow: 88,
  normal: 98,
  wide: 108,
  "extra-wide": 118,
};

const LEVEL_MM: Record<Level, number> = { low: 46, medium: 56, high: 66 };

function measurementsFor(
  profile: FootProfile,
  side: "left" | "right",
): FootMeasurements {
  // Deterministic small asymmetry: right foot slightly larger, a common pattern.
  const bias = side === "right" ? 1 : -1;

  const widthMm = WIDTH_BASE_MM[profile.width] + bias * 1.5;
  const lengthMm = 262 + (profile.width === "extra-wide" ? 6 : 0) + bias * 2;
  const instepHeightMm = LEVEL_MM[profile.instep] + bias * 1;
  const heelWidthMm = Math.round((widthMm - 40) * 10) / 10;
  const archIndex =
    profile.stability === "high" ? 0.32 : profile.cushioning === "high" ? 0.24 : 0.28;

  const forefoot: Level =
    profile.toeBox === "high" ? "high" : profile.flags.includes("bunion") ? "high" : "medium";
  const heel: Level = profile.cushioning === "high" ? "high" : "medium";

  return {
    lengthMm: round1(lengthMm),
    widthMm: round1(widthMm),
    instepHeightMm: round1(instepHeightMm),
    heelWidthMm,
    archIndex,
    pressureZones: [
      { zone: "forefoot", level: forefoot },
      { zone: "midfoot", level: "low" },
      { zone: "heel", level: heel },
    ],
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface RunScanOptions {
  onStage?: (stage: ScanStage, index: number) => void;
  signal?: AbortSignal;
  /** Override per-stage duration (used by tests to run instantly). */
  stageMs?: number;
}

export function runScan(
  profile: FootProfile,
  options: RunScanOptions = {},
): Promise<ScanResult> {
  const stageMs = options.stageMs ?? SCAN_STAGE_MS;

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException("Scan aborted", "AbortError"));
      return;
    }

    let index = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const cleanup = () => {
      timers.forEach(clearTimeout);
      options.signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Scan aborted", "AbortError"));
    };
    options.signal?.addEventListener("abort", onAbort);

    const tick = () => {
      const stage = SCAN_STAGES[index];
      options.onStage?.(stage, index);
      index += 1;
      if (index < SCAN_STAGES.length) {
        timers.push(setTimeout(tick, stageMs));
      } else {
        cleanup();
        resolve({
          left: measurementsFor(profile, "left"),
          right: measurementsFor(profile, "right"),
        });
      }
    };

    tick();
  });
}
