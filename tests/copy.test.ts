import { describe, expect, it } from "vitest";
import { explainConfig } from "@/lib/engine/copy";
import { buildFootProfile } from "@/lib/engine/recommendation";
import type { TestAnswers } from "@/lib/engine/types";

describe("explainConfig", () => {
  it("returns non-empty paragraphs that reference the stated needs", () => {
    const answers: TestAnswers = {
      footShape: "wide",
      features: ["bunion"],
      discomfort: ["forefoot"],
      priority: "comfort",
      usage: "walking",
    };
    const profile = buildFootProfile(answers);
    const text = explainConfig(profile, answers).join(" ");

    expect(text.length).toBeGreaterThan(40);
    expect(text).toMatch(/anchos/i);
    expect(text).toMatch(/juanete|delantera/i);
  });

  it("still explains something for a plain profile", () => {
    const answers: TestAnswers = {
      footShape: "normal",
      features: ["none"],
      discomfort: [],
      priority: "stability",
      usage: "outings",
    };
    const profile = buildFootProfile(answers);
    const paragraphs = explainConfig(profile, answers);
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.every((p) => p.trim().length > 0)).toBe(true);
  });

  it("does not repeat identical paragraphs", () => {
    const answers: TestAnswers = {
      footShape: "extra-wide",
      features: ["swollen-feet", "swollen-ankles"],
      discomfort: ["ankle", "sides"],
      priority: "easy-on",
      usage: "all-day",
    };
    const profile = buildFootProfile(answers);
    const paragraphs = explainConfig(profile, answers);
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
  });
});
