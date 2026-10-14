import { describe, it, expect } from "vitest";
import { parsePageSpeedScore, fetchPageSpeed } from "../../lib/engine/sources/pagespeed";
import { parseRdap, fetchRdap } from "../../lib/engine/sources/rdap";
import { parseWayback, fetchWayback } from "../../lib/engine/sources/wayback";

describe("PageSpeed", () => {
  it("convierte la puntuación a 0-100", () => {
    expect(parsePageSpeedScore({ lighthouseResult: { categories: { performance: { score: 0.34 } } } })).toBe(34);
    expect(parsePageSpeedScore({})).toBeNull();
  });

  it("pide móvil y escritorio y tolera que falle uno", async () => {
    const urls: string[] = [];
    const data = await fetchPageSpeed("https://x.example/", async (url) => {
      urls.push(url);
      if (url.includes("strategy=desktop")) return new Response("", { status: 500 });
      return Response.json({ lighthouseResult: { categories: { performance: { score: 0.5 } } } });
    }, "KEY");
    expect(data).toEqual({ mobile: 50, desktop: null });
    expect(urls.every((u) => u.includes("key=KEY"))).toBe(true);
  });

  it("lanza error si fallan ambos", async () => {
    await expect(fetchPageSpeed("https://x.example/", async () => new Response("", { status: 500 }))).rejects.toThrow();
  });
});

describe("RDAP", () => {
  it("extrae la fecha de registro", () => {
    const json = { events: [{ eventAction: "last changed", eventDate: "2024-01-01T00:00:00Z" }, { eventAction: "registration", eventDate: "2015-03-02T10:00:00Z" }] };
    expect(parseRdap(json)).toEqual({ registeredAt: "2015-03-02" });
    expect(parseRdap({})).toEqual({ registeredAt: null });
  });

  it("trata 404 como desconocido", async () => {
    expect(await fetchRdap("x.example", async () => new Response("", { status: 404 }))).toEqual({ registeredAt: null });
  });
});

describe("Wayback Machine", () => {
  it("calcula primera captura, último cambio y número de cambios", () => {
    const first = [["timestamp"], ["20150401000000"]];
    const changes = [["timestamp", "digest"], ["20251101000000", "A"], ["20260301000000", "B"], ["20260801000000", "C"]];
    expect(parseWayback(first, changes)).toEqual({ firstCapture: "2015-04-01", lastChange: "2026-08-01", changesLastYear: 2 });
  });

  it("maneja respuestas vacías", () => {
    expect(parseWayback([], [])).toEqual({ firstCapture: null, lastChange: null, changesLastYear: 0 });
  });

  it("consulta desde hace un año y tolera cuerpos vacíos", async () => {
    const urls: string[] = [];
    const data = await fetchWayback("x.example", async (url) => {
      urls.push(url);
      return new Response(url.includes("limit=1&") || url.endsWith("limit=1") ? '[["timestamp"],["20200101000000"]]' : "");
    }, new Date("2026-10-14T00:00:00Z"));
    expect(urls[1]).toContain("from=20251014");
    expect(data).toEqual({ firstCapture: "2020-01-01", lastChange: null, changesLastYear: 0 });
  });
});
