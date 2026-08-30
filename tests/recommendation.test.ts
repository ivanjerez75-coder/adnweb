import { describe, expect, it } from "vitest";
import { buildFootProfile } from "@/lib/engine/recommendation";
import type { TestAnswers } from "@/lib/engine/types";

const base: TestAnswers = {
  footShape: "normal",
  features: ["none"],
  discomfort: [],
  priority: "comfort",
  usage: "walking",
};

describe("buildFootProfile", () => {
  it("keeps a normal foot at a normal width", () => {
    expect(buildFootProfile(base).width).toBe("normal");
  });

  it("widens the last one step when feet swell", () => {
    const p = buildFootProfile({ ...base, footShape: "wide", features: ["swollen-feet"] });
    expect(p.width).toBe("extra-wide");
  });

  it("opens the toe box for bunions or forefoot discomfort", () => {
    expect(buildFootProfile({ ...base, features: ["bunion"] }).toeBox).toBe("high");
    expect(buildFootProfile({ ...base, discomfort: ["forefoot"] }).toeBox).toBe("high");
  });

  it("raises instep volume for a high instep or swollen ankles", () => {
    expect(buildFootProfile({ ...base, features: ["high-instep"] }).instep).toBe("high");
    expect(buildFootProfile({ ...base, features: ["swollen-ankles"] }).instep).toBe("high");
  });

  it("recommends velcro when ease of putting on matters", () => {
    expect(buildFootProfile({ ...base, priority: "easy-on" }).closure).toBe("velcro");
    expect(buildFootProfile({ ...base, features: ["swollen-ankles"] }).closure).toBe("velcro");
  });

  it("defaults to laces otherwise", () => {
    expect(buildFootProfile(base).closure).toBe("laces");
  });

  it("raises stability for all-day use", () => {
    expect(buildFootProfile({ ...base, usage: "all-day" }).stability).toBe("high");
  });

  it("raises cushioning when comfort or cushioning is the priority", () => {
    expect(buildFootProfile({ ...base, priority: "cushioning" }).cushioning).toBe("high");
  });

  it("carries detected features through as flags without 'none'", () => {
    const p = buildFootProfile({ ...base, features: ["bunion", "none"] });
    expect(p.flags).toEqual(["bunion"]);
  });

  it("always produces at least one rationale line", () => {
    expect(buildFootProfile(base).rationale.length).toBeGreaterThan(0);
  });
});
