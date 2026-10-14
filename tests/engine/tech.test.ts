import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectTech } from "../../lib/engine/sources/tech";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const names = (html: string, headers: Record<string, string> = {}) =>
  detectTech(html, headers).map((t) => t.name);

describe("detectTech", () => {
  it("detecta analítica, pagos y chat en el SaaS", () => {
    expect(names(fixture("saas-home.html"))).toEqual(
      expect.arrayContaining(["Google Analytics", "Stripe", "Intercom"]),
    );
  });

  it("detecta Shopify en la tienda", () => {
    expect(detectTech(fixture("shop-home.html"), {})).toContainEqual({ name: "Shopify", category: "ecommerce" });
  });

  it("detecta tecnologías en las cabeceras", () => {
    expect(names("", { "x-powered-by": "Next.js" })).toContain("Next.js");
  });

  it("no repite tecnologías ni inventa ninguna en una web vacía", () => {
    expect(names("<html></html>")).toEqual([]);
  });
});
