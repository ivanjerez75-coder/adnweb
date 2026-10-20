import { describe, it, expect } from "vitest";
import { buildReportV4, SECCIONES_V4, type SeccionClaveV4 } from "../../../lib/engine/v3/report";
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

type Fail = Partial<Record<"anatomia" | "rendimiento" | "competidores" | "diagnostico" | "oportunidades" | "plan", boolean>>;

/** Modelo falso que responde según el prompt, cuenta llamadas simultáneas y puede fallar por sección. */
function fakeModels(fail: Fail = {}, tracker = { cur: 0, max: 0 }): JsonModel {
  return {
    name: "fake",
    generate: async (p) => {
      tracker.cur++;
      tracker.max = Math.max(tracker.max, tracker.cur);
      try {
        await new Promise((r) => setTimeout(r, 5));
        const sec = p.includes("anatomía del negocio")
          ? "anatomia"
          : p.includes("Pule las interpretaciones")
            ? "rendimiento"
            : p.includes("Encuentra de 3 a 5")
              ? "competidores"
              : p.includes("Compara el negocio")
                ? "dif"
                : p.includes("diagnóstico estratégico")
                  ? "diagnostico"
                  : p.includes("Convierte el diagnóstico en oportunidades")
                    ? "oportunidades"
                    : "plan";
        if (sec !== "dif" && fail[sec]) throw new Error("boom");
        const ev = ["p1-e1", "p1-e2"];
        switch (sec) {
          case "anatomia":
            return JSON.stringify({
              nombre: "Facturo",
              fraseResumen: { texto: "Facturación online para pymes", evidencias: ev },
              identidad: { producto: { declara: { texto: "Facturación", evidencias: ev }, interpretamos: null } },
              tipologias: [{ tipo: "saas", certeza: "alta", explicacion: "Online", evidencias: ev }],
              lineas: [{ nombre: "Facturas", queOfrece: ["x"], publico: "pymes", comoSeContrata: "web", evidencias: ev }],
            });
          case "rendimiento":
            return JSON.stringify({ interpretaciones: {}, noSePuedeSaber: ["Márgenes"] });
          case "competidores":
            return JSON.stringify({ competidores: cands });
          case "dif":
            return JSON.stringify({ diferencias: [] });
          case "diagnostico":
            return JSON.stringify({ fortalezas: [{ texto: "Claro", frenteA: "Alfa", paraQuien: "pymes", evidencias: ev, relevancia: "medio", fiabilidad: "medio", utilidad: "medio" }], debilidades: [{ texto: "Sin casos", porQueImporta: "Confianza", evidencias: ev, relevancia: "alto", fiabilidad: "medio", utilidad: "medio" }], integrado: "Prioridad: casos." });
          case "oportunidades":
            return JSON.stringify({ oportunidades: [{ tipologia: "mejorar", titulo: "Mostrar casos", origen: ["d1"], ficha: { evidencia: { texto: "No hay casos", evidencias: ev }, problema: "Falta confianza", solucion: "Publicar casos", porQuePodria: "Da confianza", faltaComprobar: [] }, estado: "por_validar", criterios: {} }] });
          default:
            return JSON.stringify({ comprobar: [{ origen: "o1", tarea: "Preguntar a clientes", porQue: "Valida la idea", recursos: [], indicador: "Respuestas", criterio: { continuar: "Si interesa", modificar: "Si dudan", descartar: "Si no" } }], experimentar: [], medir: [] });
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

describe("buildReportV4", () => {
  it("emite las 9 secciones: datos, anatomia, ..., resumen y cobertura al final; version 4", async () => {
    const calls: [SeccionClaveV4, string][] = [];
    const r = await buildReportV4(raw, deps(fakeModels()), async (c, _x, e) => {
      calls.push([c, e]);
    });
    expect(r.version).toBe(4);
    expect(r.dominio).toBe(raw.domain);
    expect(r.generadoEn).toBe("2026-10-18T10:00:00.000Z");
    expect(calls[0]).toEqual(["datos", "lista"]);
    expect(calls[1]).toEqual(["anatomia", "lista"]);
    expect(calls.slice(-3).map(([c]) => c)).toEqual(["plan", "resumen", "cobertura"]);
    expect(new Set(calls.map(([c]) => c))).toEqual(new Set(SECCIONES_V4));
    expect(calls).toHaveLength(9);
    const resumen = r.secciones.resumen as { frase: { texto: string }; hallazgos: { tipo: string }[]; oportunidad: { id: string } | null };
    expect(resumen.frase.texto).toBe("Facturación online para pymes");
    expect(resumen.hallazgos.map((h) => h.tipo)).toEqual(["debilidad", "fortaleza"]);
    expect(resumen.oportunidad?.id).toBe("o1");
    expect(calls.filter(([c]) => c === "datos")).toHaveLength(1);
    expect(Object.values(r.estados).every((e) => e === "lista")).toBe(true);
    expect((r.secciones.competencia as { competidores: unknown }).competidores).toBeInstanceOf(Array);
  });

  it("datos se emite una sola vez, con métricas etiquetadas y sin visitas inventadas", async () => {
    const datos: unknown[] = [];
    await buildReportV4(raw, deps(fakeModels()), async (c, x) => {
      if (c === "datos") datos.push(x);
    });
    expect(datos).toHaveLength(1);
    const d = datos[0] as { metricas: { clave: string; valor: unknown; estado: string }[]; precios: unknown[]; escenario: unknown };
    expect(d.metricas.find((m) => m.clave === "visitas_mensuales")).toMatchObject({ valor: null, estado: "insuficiente" });
    expect(d.metricas.find((m) => m.clave === "valoracion")?.estado).toBe("no_aplica");
    expect(Array.isArray(d.precios)).toBe(true);
  });

  it("datos se emite antes que anatomia, con el escenario", async () => {
    const orden: string[] = [];
    let escenarioPresente = false;
    await buildReportV4(raw, deps(fakeModels()), async (c, x) => {
      orden.push(c);
      if (c === "datos") escenarioPresente = "escenario" in (x as object);
    });
    expect(orden.indexOf("datos")).toBeLessThan(orden.indexOf("anatomia"));
    expect(orden.filter((c) => c === "datos")).toHaveLength(1);
    expect(escenarioPresente).toBe(true);
  });

  it("una competencia que falla da error y el resto sigue lista", async () => {
    const r = await buildReportV4(raw, deps(fakeModels({ competidores: true })), async () => {});
    expect(r.estados.competencia).toBe("error");
    expect(r.secciones.competencia).toBeUndefined();
    for (const k of ["datos", "anatomia", "rendimiento", "diagnostico", "oportunidades", "plan", "resumen", "cobertura"] as const) {
      expect(r.estados[k]).toBe("lista");
    }
    const cob = r.secciones.cobertura as Record<string, { estado: string }>;
    expect(cob.competencia.estado).toBe("fallido");
    expect((r.secciones.resumen as { cobertura: Record<string, { estado: string }> }).cobertura.competencia.estado).toBe("fallido");
  });

  it("el diagnóstico no espera a la comparación de competencia (arranca con los verificados)", async () => {
    const orden: string[] = [];
    const base = fakeModels();
    const m: JsonModel = {
      name: "orden",
      generate: (p, o) => {
        orden.push(p.includes("Compara el negocio") ? "comparacion" : p.includes("diagnóstico estratégico") ? "diagnostico" : "otra");
        return base.generate(p, o);
      },
    };
    await buildReportV4(raw, deps(m), async () => {});
    expect(orden.indexOf("diagnostico")).toBeGreaterThan(-1);
    expect(orden.indexOf("diagnostico")).toBeLessThan(orden.indexOf("comparacion"));
  });

  it("diagnostico fallido: el score (dentro de rendimiento) se calcula igualmente", async () => {
    const r = await buildReportV4(raw, deps(fakeModels({ diagnostico: true })), async () => {});
    expect(r.estados.diagnostico).toBe("error");
    expect(r.estados.rendimiento).toBe("lista");
    expect((r.secciones.rendimiento as { score: { metodologia: string } }).score.metodologia).toBe("dna-score-1.0");
  });

  it("rendimiento con la IA caída usa el texto de código y sigue lista", async () => {
    const r = await buildReportV4(raw, deps(fakeModels({ rendimiento: true })), async () => {});
    expect(r.estados.rendimiento).toBe("lista");
    const rend = r.secciones.rendimiento as { dimensiones: unknown[]; noSePuedeSaber: string[] };
    expect(rend.dimensiones).toHaveLength(5);
    expect(rend.noSePuedeSaber.length).toBeGreaterThan(1);
    expect(r.estados.oportunidades).toBe("lista");
  });

  it("diagnostico cita a los competidores verificados, y oportunidades (tras ambos) enlaza sus hallazgos", async () => {
    const orden: string[] = [];
    const prompts: string[] = [];
    const base = fakeModels();
    const m: JsonModel = { name: "spy", generate: (p, o) => (prompts.push(p), base.generate(p, o)) };
    const r = await buildReportV4(raw, deps(m), async (c) => {
      orden.push(c);
    });
    expect(orden.indexOf("competencia")).toBeLessThan(orden.indexOf("oportunidades"));
    expect(orden.indexOf("diagnostico")).toBeLessThan(orden.indexOf("oportunidades"));
    expect(prompts.find((p) => p.includes("diagnóstico estratégico"))).toContain("[c1] Alfa");
    expect(prompts.find((p) => p.includes("Convierte el diagnóstico en oportunidades"))).toContain("d1: Sin casos");
    const d = r.secciones.diagnostico as { fortalezas: { id: string }[]; debilidades: { id: string }[] };
    expect(d.fortalezas[0].id).toBe("f1");
    expect(d.debilidades[0].id).toBe("d1");
  });

  it("oportunidades fallida -> error", async () => {
    const r = await buildReportV4(raw, deps(fakeModels({ oportunidades: true })), async () => {});
    expect(r.estados.oportunidades).toBe("error");
    // El plan se apoya entonces en las debilidades del diagnóstico: su acción de o1 se descarta.
    expect(r.estados.plan).toBe("error");
  });

  it("plan va tras oportunidades y enlaza sus ids", async () => {
    const orden: string[] = [];
    const prompts: string[] = [];
    const base = fakeModels();
    const m: JsonModel = { name: "spy", generate: (p, o) => (prompts.push(p), base.generate(p, o)) };
    const r = await buildReportV4(raw, deps(m), async (c) => {
      orden.push(c);
    });
    expect(orden.indexOf("oportunidades")).toBeLessThan(orden.indexOf("plan"));
    expect(prompts.find((p) => p.includes("plan de acción"))).toContain("o1: Mostrar casos");
    expect((r.secciones.plan as { comprobar: { origen: string }[] }).comprobar[0].origen).toBe("o1");
  });

  it("plan fallido -> error; el resto sigue lista", async () => {
    const r = await buildReportV4(raw, deps(fakeModels({ plan: true })), async () => {});
    expect(r.estados.plan).toBe("error");
    expect(r.estados.oportunidades).toBe("lista");
  });

  it("anatomia fallida rechaza", async () => {
    await expect(buildReportV4(raw, deps(fakeModels({ anatomia: true })), async () => {})).rejects.toThrow();
  });

  it("si onSection rechaza en anatomia, se propaga; en otras secciones se ignora", async () => {
    await expect(
      buildReportV4(raw, deps(fakeModels()), async (c) => {
        if (c === "anatomia") throw new Error("db");
      }),
    ).rejects.toThrow("db");
    const r = await buildReportV4(raw, deps(fakeModels()), async (c) => {
      if (c === "rendimiento") throw new Error("db");
    });
    expect(r.estados.rendimiento).toBe("lista");
  });

  it("nunca más de 3 llamadas de IA a la vez", async () => {
    const t = { cur: 0, max: 0 };
    await buildReportV4(raw, deps(fakeModels({}, t)), async () => {});
    expect(t.max).toBeGreaterThan(1);
    expect(t.max).toBeLessThanOrEqual(3);
  });
});

describe("limpiarTextos", () => {
  it("quita ids sueltos de los textos pero no toca las evidencias", async () => {
    const { limpiarTextos } = await import("../../../lib/engine/v3/report");
    const ev = { id: "p8-e7", tipo: "pagina", texto: "Cita literal [p1-e1]", fuente: "https://x.example" };
    expect(limpiarTextos({ ofrece: "Formularios [p8-e7].", lista: ["Algo (p3, p4)"], evidencias: [ev] })).toEqual({
      ofrece: "Formularios.",
      lista: ["Algo"],
      evidencias: [ev],
    });
  });
});

describe("web ilegible", () => {
  it("sin páginas leídas falla al instante con InsufficientDataError y sin llamar a la IA", async () => {
    const { buildReportV4, WEB_NO_LEGIBLE } = await import("../../../lib/engine/v3/report");
    const { makeRaw } = await import("../raw-fixture");
    let llamadas = 0;
    const modelo = { name: "f", generate: async () => { llamadas++; return "{}"; } };
    const raw = makeRaw({ site: null, paginas: null });
    const emitidos: string[] = [];
    await expect(
      buildReportV4(raw, { models: [modelo], searchModels: [], getPage: async () => { throw new Error("x"); }, now: () => new Date() }, async (c, _x, e) => { emitidos.push(`${c}:${e}`); }),
    ).rejects.toThrow(WEB_NO_LEGIBLE);
    expect(llamadas).toBe(0);
    expect(emitidos).toContain("anatomia:error");
  });
});
