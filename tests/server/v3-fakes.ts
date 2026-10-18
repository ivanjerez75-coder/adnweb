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

type Fail = Partial<Record<"adn" | "saber" | "competidores" | "revision" | "aprender" | "cierre", boolean>>;

const cands = [{ nombre: "Alfa", web: "https://alfa.com", ofrece: "Facturas", terminos: ["facturacion", "presupuestos"] }];

/** Modelo falso que responde según el prompt y puede fallar por sección. */
export function fakeV3Model(fail: Fail = {}): JsonModel {
  return {
    name: "fake-v3",
    generate: async (p) => {
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
    },
  };
}

export const v3GetPage: PageGetter = async () => ({ url: "", status: 200, headers: {}, text: "facturacion presupuestos" });
export const v3RunOpts = { sleep: async () => {}, attemptsPerModel: 1 };
