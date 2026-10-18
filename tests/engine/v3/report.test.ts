import { describe, it, expect } from "vitest";
import { buildReportV3, type SeccionClave } from "../../../lib/engine/v3/report";
import type { JsonModel } from "../../../lib/engine/ai/providers";
import type { PageGetter } from "../../../lib/engine/safe-fetch";
import { makeRaw } from "../raw-fixture";

const raw = makeRaw({
  paginas: [
    {
      id: "p1",
      url: "https://facturo.example/",
      titulo: "Inicio",
      tieneDescripcion: true,
      extractos: [
        { id: "p1-e1", cita: "Facturas online" },
        { id: "p1-e2", cita: "Desde 9 euros" },
      ],
    },
  ],
});

const cands = [{ nombre: "Alfa", web: "https://alfa.com", ofrece: "Facturas", terminos: ["facturacion", "presupuestos"] }];

type Fail = Partial<Record<"adn" | "saber" | "competidores" | "revision" | "aprender" | "cierre", boolean>>;

/** Modelo falso que responde según el prompt, cuenta llamadas simultáneas y puede fallar por sección. */
function fakeModels(fail: Fail = {}, tracker = { cur: 0, max: 0 }): JsonModel {
  return {
    name: "fake",
    generate: async (p) => {
      tracker.cur++;
      tracker.max = Math.max(tracker.max, tracker.cur);
      try {
        await new Promise((r) => setTimeout(r, 5));
        const sec = p.includes("Explica qué es el negocio")
          ? "adn"
          : p.includes("qué NO se puede saber")
            ? "saber"
            : p.includes("Encuentra de 3 a 5")
              ? "competidores"
              : p.includes("Compara el negocio")
                ? "dif"
                : p.includes("revisa la web")
                  ? "revision"
                  : p.includes("puede aprender")
                    ? "aprender"
                    : "cierre";
        if (sec !== "dif" && fail[sec]) throw new Error("boom");
        const ev = ["p1-e1", "p1-e2"];
        switch (sec) {
          case "adn":
            return JSON.stringify({
              queEs: { texto: "Facturación", evidencias: ev },
              propuestaValor: { texto: "Fácil", evidencias: ev },
              tipoNegocio: "saas",
              lineas: [{ nombre: "Facturas", queOfrece: ["x"], publico: "pymes", comoSeContrata: "web", ingresos: "suscripción", evidencias: ev }],
              comoFunciona: { texto: "Online", evidencias: ev },
            });
          case "saber":
            return JSON.stringify({ items: ["Márgenes"] });
          case "competidores":
            return JSON.stringify({ competidores: cands });
          case "dif":
            return JSON.stringify({ diferencias: [] });
          case "revision":
            return JSON.stringify({ bien: [{ texto: "Claro", evidencias: ev }], lineas: [], problemas: [] });
          case "aprender":
            return JSON.stringify({ items: [{ texto: "Mostrar precio", evidencias: ev }] });
          default:
            return JSON.stringify({ motivos: {}, acciones: [] });
        }
      } finally {
        tracker.cur--;
      }
    },
  };
}
const getPage: PageGetter = async () => ({ url: "", status: 200, headers: {}, text: "facturacion presupuestos" });
const runOpts = { sleep: async () => {}, attemptsPerModel: 1 };
const now = () => new Date("2026-10-18T10:00:00.000Z");

function deps(m: JsonModel) {
  return { models: [m], searchModels: [m], getPage, now, runOpts };
}

describe("buildReportV3", () => {
  it("emite datos, adn, ... y cierre al final; version 3", async () => {
    const calls: [SeccionClave, string][] = [];
    const r = await buildReportV3(raw, deps(fakeModels()), async (c, _x, e) => {
      calls.push([c, e]);
    });
    expect(r.version).toBe(3);
    expect(r.dominio).toBe(raw.domain);
    expect(r.generadoEn).toBe("2026-10-18T10:00:00.000Z");
    expect(calls[0]).toEqual(["datos", "lista"]);
    expect(calls[1]).toEqual(["adn", "lista"]);
    expect(calls[calls.length - 1][0]).toBe("cierre");
    expect(calls.filter(([c]) => c === "datos")).toHaveLength(1);
    expect(Object.values(r.estados).every((e) => e === "lista")).toBe(true);
    expect(r.secciones.competidores).toBeInstanceOf(Array);
  });

  it("datos se emite una sola vez, con métricas etiquetadas y sin visitas inventadas", async () => {
    const datos: unknown[] = [];
    await buildReportV3(raw, deps(fakeModels()), async (c, x) => {
      if (c === "datos") datos.push(x);
    });
    expect(datos).toHaveLength(1);
    const d = datos[0] as { metricas: { clave: string; valor: unknown; estado: string }[]; precios: unknown[]; escenario: unknown };
    expect(d.metricas.find((m) => m.clave === "visitas_mensuales")).toMatchObject({ valor: null, estado: "insuficiente" });
    expect(d.metricas.find((m) => m.clave === "valoracion")?.estado).toBe("no_aplica");
    expect(Array.isArray(d.precios)).toBe(true);
  });

  it("un competidores que falla da error y el resto sigue lista", async () => {
    const r = await buildReportV3(raw, deps(fakeModels({ competidores: true })), async () => {});
    expect(r.estados.competidores).toBe("error");
    expect(r.secciones.competidores).toBeUndefined();
    for (const k of ["datos", "adn", "saber", "revision", "aprender", "score", "cierre"] as const) {
      expect(r.estados[k]).toBe("lista");
    }
  });

  it("revision fallida: score se calcula igualmente", async () => {
    const r = await buildReportV3(raw, deps(fakeModels({ revision: true })), async () => {});
    expect(r.estados.revision).toBe("error");
    expect(r.estados.score).toBe("lista");
  });

  it("cierre fallido -> error", async () => {
    const r = await buildReportV3(raw, deps(fakeModels({ cierre: true })), async () => {});
    expect(r.estados.cierre).toBe("error");
  });

  it("adn fallido rechaza", async () => {
    await expect(buildReportV3(raw, deps(fakeModels({ adn: true })), async () => {})).rejects.toThrow();
  });

  it("si onSection rechaza en adn, se propaga; en otras secciones se ignora", async () => {
    await expect(
      buildReportV3(raw, deps(fakeModels()), async (c) => {
        if (c === "adn") throw new Error("db");
      }),
    ).rejects.toThrow("db");
    const r = await buildReportV3(raw, deps(fakeModels()), async (c) => {
      if (c === "saber") throw new Error("db");
    });
    expect(r.estados.saber).toBe("lista");
  });

  it("nunca más de 3 llamadas de IA a la vez", async () => {
    const t = { cur: 0, max: 0 };
    await buildReportV3(raw, deps(fakeModels({}, t)), async () => {});
    expect(t.max).toBeGreaterThan(1);
    expect(t.max).toBeLessThanOrEqual(3);
  });
});
