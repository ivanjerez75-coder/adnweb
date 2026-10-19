import type { JsonModel } from "@/lib/engine/ai/providers";
import type { PageGetter } from "@/lib/engine/safe-fetch";
import { makeRaw } from "../engine/raw-fixture";

/** Datos brutos v3 con páginas citables (ids p1-e1, p1-e2). */
export const rawV3 = makeRaw({
  domain: "facturo.example",
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

type Fail = Partial<Record<"anatomia" | "rendimiento" | "competidores" | "diagnostico" | "oportunidades" | "plan", boolean>>;

const cands = [{ nombre: "Alfa", web: "https://alfa.com", ofrece: "Facturas", terminos: ["facturacion", "presupuestos"] }];

/** Modelo falso que responde según el prompt y puede fallar por sección. */
export function fakeV3Model(fail: Fail = {}): JsonModel {
  return {
    name: "fake-v3",
    generate: async (p) => {
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
          return JSON.stringify({ fortalezas: [{ texto: "Claro", frenteA: "Alfa", paraQuien: "pymes", evidencias: ev }], debilidades: [{ texto: "Sin casos", porQueImporta: "Confianza", evidencias: ev }], integrado: "Prioridad: casos." });
        case "oportunidades":
          return JSON.stringify({ oportunidades: [{ tipologia: "mejorar", titulo: "Mostrar casos", origen: ["d1"], ficha: { evidencia: { texto: "No hay casos", evidencias: ev }, problema: "Falta confianza", solucion: "Publicar casos", porQuePodria: "Da confianza", faltaComprobar: [] }, estado: "por_validar", criterios: {} }] });
        default:
          return JSON.stringify({ comprobar: [{ origen: "o1", tarea: "Preguntar a clientes", porQue: "Valida la idea", recursos: [], indicador: "Respuestas", criterio: { continuar: "Si interesa", modificar: "Si dudan", descartar: "Si no" } }], experimentar: [], medir: [] });
      }
    },
  };
}

export const v3GetPage: PageGetter = async () => ({ url: "", status: 200, headers: {}, text: "facturacion presupuestos" });
export const v3RunOpts = { sleep: async () => {}, attemptsPerModel: 1 };
