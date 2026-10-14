import { describe, it, expect } from "vitest";
import { collect, InsufficientDataError } from "../../lib/engine/collect";
import { BlockedUrlError } from "../../lib/engine/safe-fetch";
import { fakeFetcher, fakeGetPage, NOW } from "./fake-network";

const input = { url: "https://facturo.example/", domain: "facturo.example" };
const baseDeps = { getPage: fakeGetPage, fetcher: fakeFetcher(), radarToken: "tok", now: () => NOW };

describe("collect", () => {
  it("reúne todas las fuentes", async () => {
    const raw = await collect(input, baseDeps);
    expect(raw.domain).toBe("facturo.example");
    expect(raw.collectedAt).toBe(NOW.toISOString());
    expect(raw.site?.pricesFound).toEqual(["9 €", "29 €"]);
    expect(raw.tranco).toEqual({ rank: 60000, trend: "baja" });
    expect(raw.radar).toEqual({ bucket: 100000, rank: null });
    expect(raw.pagespeed).toEqual({ mobile: 34, desktop: 34 });
    expect(raw.rdap).toEqual({ registeredAt: "2015-03-02" });
    expect(raw.wayback).toEqual({ firstCapture: "2015-04-01", lastChange: "2025-11-01", changesLastYear: 0 });
    expect(raw.unavailable).toEqual([]);
  });

  it("marca Radar como no disponible si no hay token", async () => {
    const raw = await collect(input, { ...baseDeps, radarToken: undefined });
    expect(raw.radar).toBeNull();
    expect(raw.unavailable).toEqual(["radar"]);
  });

  it("continúa si falla una fuente", async () => {
    const fetcher = fakeFetcher({ "tranco-list.eu": () => new Response("", { status: 500 }) });
    const raw = await collect(input, { ...baseDeps, fetcher });
    expect(raw.tranco).toBeNull();
    expect(raw.unavailable).toContain("tranco");
    expect(raw.site).not.toBeNull();
  });

  it("marca web y tecnologías como no disponibles si la web no responde", async () => {
    const raw = await collect(input, { ...baseDeps, getPage: async (url) => ({ url, status: 503, headers: {}, text: "" }) });
    expect(raw.site).toBeNull();
    expect(raw.unavailable).toEqual(expect.arrayContaining(["web", "tecnologias"]));
  });

  it("lanza InsufficientDataError si no hay web ni tráfico", async () => {
    const fetcher = fakeFetcher({
      "tranco-list.eu": () => Response.json({ ranks: [] }),
      "api.cloudflare.com": () => new Response("", { status: 404 }),
    });
    const getPage = async () => {
      throw new Error("bloqueado por antibots");
    };
    await expect(collect(input, { ...baseDeps, fetcher, getPage })).rejects.toBeInstanceOf(InsufficientDataError);
  });

  it.each([[{ bucket: null }], [{ bucket: "" }], [{ bucket: 0 }]])(
    "una franja de Radar no válida no cuenta como tráfico (%o)",
    async (details) => {
      const fetcher = fakeFetcher({
        "tranco-list.eu": () => Response.json({ ranks: [] }),
        "api.cloudflare.com": () => Response.json({ result: { details_0: details } }),
      });
      const getPage = async () => {
        throw new Error("bloqueado por antibots");
      };
      await expect(collect(input, { ...baseDeps, fetcher, getPage })).rejects.toBeInstanceOf(InsufficientDataError);
    },
  );

  it("un rango de Radar sin franja sí cuenta como tráfico", async () => {
    const fetcher = fakeFetcher({
      "tranco-list.eu": () => Response.json({ ranks: [] }),
      "api.cloudflare.com": () => Response.json({ result: { details_0: { rank: 321 } } }),
    });
    const getPage = async () => {
      throw new Error("bloqueado por antibots");
    };
    const raw = await collect(input, { ...baseDeps, fetcher, getPage });
    expect(raw.radar).toEqual({ bucket: null, rank: 321 });
  });

  it("propaga BlockedUrlError", async () => {
    const getPage = async () => {
      throw new BlockedUrlError("interna");
    };
    await expect(collect(input, { ...baseDeps, getPage })).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("informa de los pasos en orden", async () => {
    const steps: string[] = [];
    await collect(input, baseDeps, (s) => {
      steps.push(s);
    });
    expect(steps).toEqual(["Leyendo la web…", "Analizando tráfico y presencia…"]);
  });
});
