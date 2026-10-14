import { describe, it, expect } from "vitest";
import { normalizeUrl, InvalidUrlError } from "../../lib/engine/url";

describe("normalizeUrl", () => {
  it("normaliza un dominio sin protocolo y con ruta", () => {
    expect(normalizeUrl("Notion.so/precios")).toEqual({ url: "https://notion.so/", domain: "notion.so" });
  });

  it("conserva www en la url pero no en el dominio", () => {
    expect(normalizeUrl("http://www.zara.com/es/")).toEqual({ url: "https://www.zara.com/", domain: "zara.com" });
  });

  it("acepta espacios alrededor", () => {
    expect(normalizeUrl("  stripe.com  ").domain).toBe("stripe.com");
  });

  it.each([
    "",
    "   ",
    "localhost",
    "http://192.168.1.1",
    "http://[::1]/",
    "ftp://example.com",
    "https://user:pass@example.com",
    "example.com:8080",
    "sin-punto",
    "javascript:alert(1)",
  ])("rechaza %j", (input) => {
    expect(() => normalizeUrl(input)).toThrow(InvalidUrlError);
  });
});
