import { describe, expect, it } from "vitest";
import { formatEur, getPrice } from "@/lib/engine/pricing";
import { BASE_PRICE_EUR } from "@/lib/engine/config";
import type { ShoeSpec } from "@/lib/engine/types";

const spec = (over: Partial<ShoeSpec["config"]> = {}): ShoeSpec => ({
  widthScale: 0.5,
  toeBoxSpace: 0.5,
  instepVolume: 0.5,
  midsoleThickness: 0.5,
  heelCounterStiffness: 0.5,
  config: { color: "black", closure: "laces", insole: "comfort", ...over },
  profile: {
    width: "normal",
    toeBox: "medium",
    instep: "medium",
    stability: "medium",
    cushioning: "medium",
    closure: "laces",
    flags: [],
    rationale: [],
  },
});

describe("getPrice", () => {
  it("is the base price for the default configuration", () => {
    expect(getPrice(spec())).toBe(BASE_PRICE_EUR);
  });

  it("adds the extra-cushion insole delta", () => {
    expect(getPrice(spec({ insole: "extra-cushion" }))).toBe(BASE_PRICE_EUR + 10);
  });

  it("adds the slip-on closure delta", () => {
    expect(getPrice(spec({ closure: "slip-on" }))).toBe(BASE_PRICE_EUR + 6);
  });
});

describe("formatEur", () => {
  it("formats with a trailing euro sign", () => {
    expect(formatEur(129)).toBe("129 €");
  });
});
