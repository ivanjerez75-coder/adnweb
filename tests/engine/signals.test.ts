import { describe, it, expect } from "vitest";
import { extractSignals } from "../../lib/engine/signals";
import { makeRaw, makeSite } from "./raw-fixture";
import { NOW } from "./fake-network";

const ids = (raw: Parameters<typeof extractSignals>[0]) => extractSignals(raw, NOW).map((s) => s.id);

describe("extractSignals", () => {
  it("no produce señales para un negocio sin huecos", () => {
    expect(ids(makeRaw())).toEqual([]);
  });

  it("detecta huecos de producto, contenido, alcance y confianza en la web", () => {
    const site = makeSite({
      pricesFound: [],
      ctas: ["Pide una demo"],
      hasFreePlanOrTrial: false,
      hasBlog: false,
      textLength: 800,
      languages: ["es"],
      hasAppLinks: false,
      socialLinks: {},
      hasTestimonials: false,
      technologies: [],
    });
    expect(ids(makeRaw({ site }))).toEqual([
      "sin_precios_publicos",
      "solo_demo",
      "sin_plan_gratuito",
      "sin_blog",
      "contenido_escaso",
      "un_solo_idioma",
      "sin_app_movil",
      "pocas_redes",
      "sin_testimonios",
      "sin_analitica",
      "sin_chat_soporte",
      "sin_captacion_email",
    ]);
  });

  it("asigna familia y fuente a cada señal", () => {
    const signals = extractSignals(makeRaw({ site: makeSite({ technologies: [{ name: "Intercom", category: "chat" }, { name: "Mailchimp", category: "email" }] }) }), NOW);
    expect(signals).toEqual([
      { id: "sin_analitica", family: "tecnica", source: "tecnologias", label: "No se detecta ninguna herramienta de analítica" },
    ]);
  });

  it("detecta señales de rendimiento, tracción y antigüedad", () => {
    const raw = makeRaw({
      pagespeed: { mobile: 34, desktop: 45 },
      tranco: { rank: null, trend: null },
      radar: { bucket: null, rank: null },
      wayback: { firstCapture: "2025-01-01", lastChange: "2025-06-01", changesLastYear: 0 },
      rdap: { registeredAt: "2025-01-01" },
    });
    expect(ids(raw)).toEqual([
      "pagespeed_movil_bajo",
      "pagespeed_escritorio_bajo",
      "fuera_top_1m",
      "popularidad_baja",
      "web_sin_cambios_12m",
      "dominio_reciente",
    ]);
  });

  it("popularidad_baja solo si Radar respondió sin rango ni franja válida", () => {
    const has = (radar: { bucket: number | null; rank: number | null } | null) =>
      ids(makeRaw({ radar })).includes("popularidad_baja");
    expect(has({ bucket: null, rank: null })).toBe(true);
    expect(has({ bucket: 500_000, rank: null })).toBe(true);
    expect(has({ bucket: 0, rank: null })).toBe(true);
    expect(has({ bucket: null, rank: 1234 })).toBe(false);
    expect(has({ bucket: 500_000, rank: 1234 })).toBe(false);
    expect(has({ bucket: 200_000, rank: null })).toBe(false);
    expect(has({ bucket: 1000, rank: null })).toBe(false);
    expect(has(null)).toBe(false);
  });

  it("detecta tráfico en caída", () => {
    expect(ids(makeRaw({ tranco: { rank: 60000, trend: "baja" } }))).toEqual(["trafico_en_caida"]);
  });

  it("no inventa señales de fuentes no disponibles", () => {
    expect(ids(makeRaw({ site: null, pagespeed: null, tranco: null, radar: null, wayback: null, rdap: null }))).toEqual([]);
  });
});
