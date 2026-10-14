import { describe, it, expect } from "vitest";
import { parseTranco, fetchTranco } from "../../lib/engine/sources/tranco";
import { parseRadar, fetchRadar } from "../../lib/engine/sources/radar";

describe("Tranco", () => {
  it("toma el rango más reciente y calcula la tendencia", () => {
    const json = {
      domain: "facturo.example",
      ranks: [
        { date: "2026-10-01", rank: 60000 },
        { date: "2026-09-01", rank: 50000 },
      ],
    };
    expect(parseTranco(json)).toEqual({ rank: 60000, trend: "baja" });
  });

  it("detecta subida y estabilidad", () => {
    expect(parseTranco({ ranks: [{ date: "2026-09-01", rank: 1000 }, { date: "2026-10-01", rank: 800 }] }).trend).toBe("sube");
    expect(parseTranco({ ranks: [{ date: "2026-09-01", rank: 1000 }, { date: "2026-10-01", rank: 1050 }] }).trend).toBe("estable");
  });

  it("devuelve rank null si el dominio no está en la lista", () => {
    expect(parseTranco({ domain: "x.example", ranks: [] })).toEqual({ rank: null, trend: null });
  });

  it("llama a la API pública de Tranco", async () => {
    let called = "";
    const data = await fetchTranco("facturo.example", async (url) => {
      called = url;
      return Response.json({ ranks: [{ date: "2026-10-01", rank: 42 }] });
    });
    expect(called).toBe("https://tranco-list.eu/api/ranks/domain/facturo.example");
    expect(data.rank).toBe(42);
  });

  it("lanza error si la API falla", async () => {
    await expect(fetchTranco("x.example", async () => new Response("", { status: 500 }))).rejects.toThrow();
  });
});

describe("Cloudflare Radar", () => {
  it("lee la franja de popularidad", () => {
    expect(parseRadar({ success: true, result: { details_0: { bucket: "100000", categories: [] } } })).toEqual({ bucket: 100000, rank: null });
  });

  it("devuelve null si no hay franja numérica", () => {
    expect(parseRadar({ result: { details_0: { bucket: ">200000" } } })).toEqual({ bucket: null, rank: null });
    expect(parseRadar({})).toEqual({ bucket: null, rank: null });
  });

  it("envía el token y trata 404 como sin ranking", async () => {
    let auth = "";
    const data = await fetchRadar("x.example", async (_url, init) => {
      auth = new Headers(init?.headers).get("authorization") ?? "";
      return new Response("", { status: 404 });
    }, "tok");
    expect(auth).toBe("Bearer tok");
    expect(data).toEqual({ bucket: null, rank: null });
  });

  it.each([[null], [""], [0], [-5], ["abc"], [true]])("descarta una franja no válida (%o)", (bucket) => {
    expect(parseRadar({ result: { details_0: { bucket } } })).toEqual({ bucket: null, rank: null });
  });

  it("lee el rango exacto cuando viene, aunque no haya franja", () => {
    expect(parseRadar({ result: { details_0: { rank: 42 } } })).toEqual({ bucket: null, rank: 42 });
    expect(parseRadar({ result: { details_0: { rank: "1500", bucket: "2000" } } })).toEqual({ bucket: 2000, rank: 1500 });
    expect(parseRadar({ result: { details_0: { rank: null, bucket: "" } } })).toEqual({ bucket: null, rank: null });
  });

  it.each([401, 500])("lanza error si Radar responde %i", async (status) => {
    await expect(fetchRadar("x.example", async () => new Response("", { status }), "tok")).rejects.toThrow();
  });
});
