import { describe, expect, it } from "vitest";
import { buildShoe, getBuildSteps } from "@/lib/engine/shoeBuilder";
import { buildFootProfile } from "@/lib/engine/recommendation";
import type { ShoeConfig, TestAnswers } from "@/lib/engine/types";

const answers: TestAnswers = {
  footShape: "extra-wide",
  features: ["bunion", "high-instep"],
  discomfort: ["forefoot"],
  priority: "cushioning",
  usage: "all-day",
};

const config: ShoeConfig = { color: "black", closure: "velcro", insole: "comfort" };

describe("getBuildSteps", () => {
  it("returns the eight creation steps", () => {
    const steps = getBuildSteps();
    expect(steps).toHaveLength(8);
    expect(steps[0].label).toBe("Analizando la forma de tus pies");
    expect(steps[7].label).toBe("Creando tu diseño");
  });
});

describe("buildShoe", () => {
  const profile = buildFootProfile(answers);

  it("keeps every geometry knob within 0..1", () => {
    const spec = buildShoe(profile, null, config);
    for (const key of [
      "widthScale",
      "toeBoxSpace",
      "instepVolume",
      "midsoleThickness",
      "heelCounterStiffness",
    ] as const) {
      expect(spec[key]).toBeGreaterThanOrEqual(0);
      expect(spec[key]).toBeLessThanOrEqual(1);
    }
  });

  it("maps high profile levels to large knobs", () => {
    const spec = buildShoe(profile, null, config);
    expect(spec.widthScale).toBeGreaterThan(0.7);
    expect(spec.toeBoxSpace).toBeGreaterThan(0.7);
    expect(spec.midsoleThickness).toBeGreaterThan(0.7);
  });

  it("thickens the midsole for the extra-cushion insole", () => {
    const comfort = buildShoe(profile, null, config);
    const cushioned = buildShoe(profile, null, { ...config, insole: "extra-cushion" });
    expect(cushioned.midsoleThickness).toBeGreaterThan(comfort.midsoleThickness);
  });

  it("passes the config and profile through untouched", () => {
    const spec = buildShoe(profile, null, config);
    expect(spec.config).toEqual(config);
    expect(spec.profile).toBe(profile);
  });
});
