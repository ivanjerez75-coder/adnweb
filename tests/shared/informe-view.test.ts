import { describe, expect, it } from "vitest";
import type { Competencia } from "@/lib/engine/v3/sections/competencia";
import type { Diagnostico } from "@/lib/engine/v3/sections/diagnostico";
import {
  accionesDeOportunidad,
  datosClave,
  esHttp,
  esNegocioHibrido,
  etiquetaClase,
  filtrarHallazgos,
  filtroDesdeHash,
  hashDeFiltro,
  hechosNegocio,
  ordenarOportunidades,
  primeraFrase,
  resolverOrigen,
  sinDatosFiables,
  tarjetasHallazgos,
  trozosFrase,
  valorMetrica,
} from "@/lib/shared/informe-view";

const pag = (id: string, texto = "cita literal") => ({ id, tipo: "pagina" as const, texto, url: "https://teb.org/", fuente: "https://teb.org/" });

const diagnostico = {
  fortalezas: [{ id: "f1", texto: "Gran capacidad industrial. Con salas limpias.", frenteA: "c1", paraQuien: "empresas", evidencias: [pag("p1-e1")], clase: "observado" as const }],
  debilidades: [{ id: "d1", texto: "Dispersión informativa", porQueImporta: "Confunde al cliente", evidencias: [pag("p2-e1")], clase: "inferencia" as const }],
  riesgos: [{ id: "r1", texto: "Dependencia de subvenciones", evidencias: [], clase: "hipotesis" as const }],
  fricciones: [{ id: "x1", tipo: "precio" as const, texto: "No hay precios", evidencias: [], potencial: true as const }],
  integrado: { texto: "Conclusión." },
  comprobaciones: [],
} as unknown as Diagnostico;

const competencia: Partial<Competencia> = {
  competidores: [],
  matriz: { dimensiones: ["cliente", "precio"], filas: [] },
  ganaPierde: [{ dimension: "funcionalidades", destaca: "analizada", evidencia: [], porQueImporta: "", aprender: "", diferenciarse: "" }],
};

const accion = (id: string, origen: string, tarea = `tarea ${id}`) => ({
  id,
  origen,
  tarea,
  porQue: "",
  recursos: [],
  indicador: "ind",
  criterio: { continuar: "c", modificar: "m", descartar: "d" },
});
const plan = {
  comprobar: [accion("a1", "o1"), accion("a2", "d1", "Revisar la navegación")],
  experimentar: [accion("a3", "o1")],
  medir: [accion("a4", "o1"), accion("a5", "x1", "Contar consultas")],
};

describe("etiquetaClase", () => {
  it("mapea las cuatro clases a su texto y tono", () => {
    expect(etiquetaClase("observado")).toEqual({ clave: "comun.etObservado", tono: "observado" });
    expect(etiquetaClase("fuente_externa")).toEqual({ clave: "comun.etExterna", tono: "externa" });
    expect(etiquetaClase("inferencia")?.tono).toBe("inferencia");
    expect(etiquetaClase("hipotesis")?.clave).toBe("comun.etHipotesis");
  });
  it("devuelve null para valores desconocidos", () => {
    expect(etiquetaClase("estimado")).toBeNull();
    expect(etiquetaClase(undefined)).toBeNull();
    expect(etiquetaClase("toString")).toBeNull();
  });
});

describe("filtros en el hash", () => {
  it("ida y vuelta", () => {
    expect(hashDeFiltro("riesgos")).toBe("#filtro=riesgos");
    expect(filtroDesdeHash("#filtro=riesgos")).toBe("riesgos");
    expect(hashDeFiltro("todo")).toBe("");
  });
  it("cualquier otra cosa es todo", () => {
    expect(filtroDesdeHash("")).toBe("todo");
    expect(filtroDesdeHash("#bloque-datos")).toBe("todo");
    expect(filtroDesdeHash("#filtro=nada")).toBe("todo");
    expect(filtroDesdeHash("#filtro=%E0%A4%A")).toBe("todo");
  });
});

describe("filtrarHallazgos", () => {
  it("todo muestra los cuatro bloques", () => {
    const v = filtrarHallazgos(diagnostico, "todo");
    expect([v.fortalezas.length, v.debilidades.length, v.riesgos.length, v.fricciones.length]).toEqual([1, 1, 1, 1]);
  });
  it("un filtro deja solo su bloque, sin tocar los textos", () => {
    const v = filtrarHallazgos(diagnostico, "debilidades");
    expect(v.debilidades).toEqual(diagnostico.debilidades);
    expect(v.fortalezas).toEqual([]);
    expect(v.riesgos).toEqual([]);
  });
  it("aguanta un diagnóstico nulo o mal formado", () => {
    expect(filtrarHallazgos(null, "todo").fortalezas).toEqual([]);
    expect(filtrarHallazgos({ fortalezas: "x" as never }, "fortalezas").fortalezas).toEqual([]);
  });
});

describe("tarjetasHallazgos", () => {
  const tarjetas = tarjetasHallazgos(filtrarHallazgos(diagnostico, "todo"), plan);
  const de = (id: string) => tarjetas.find((x) => x.id === id)!;

  it("usa los respaldos cuando faltan los campos nuevos", () => {
    expect(de("f1").titulo).toBe("Gran capacidad industrial.");
    expect(de("f1").estado).toBe("comprobado");
    expect(de("d1").estado).toBe("por_comprobar");
    expect(de("d1").porQueImporta).toBe("Confunde al cliente");
    expect(de("r1").porQueImporta).toBeNull();
  });
  it("qué hacer sale de las acciones del plan con ese origen", () => {
    expect(de("d1").queHacer).toEqual(["Revisar la navegación"]);
    expect(de("x1").queHacer).toEqual(["Contar consultas"]);
    expect(de("f1").queHacer).toEqual([]);
  });
  it("respeta los campos nuevos si vienen", () => {
    const d = { ...diagnostico, debilidades: [{ ...diagnostico.debilidades[0], titulo: "Web dispersa", queHacer: "Ordenar el menú", estado: "comprobado" as const }] };
    const [t] = tarjetasHallazgos(filtrarHallazgos(d, "debilidades"), plan);
    expect(t).toMatchObject({ titulo: "Web dispersa", queHacer: ["Ordenar el menú"], estado: "comprobado" });
  });
  it("conserva frente a qué y el tipo de fricción", () => {
    expect(de("f1")).toMatchObject({ frenteA: "c1", paraQuien: "empresas" });
    expect(de("x1").tipoFriccion).toBe("precio");
  });
});

describe("primeraFrase", () => {
  it("corta en el primer punto seguido de espacio", () => {
    expect(primeraFrase("Uno. Dos.")).toBe("Uno.");
    expect(primeraFrase("Sin punto")).toBe("Sin punto");
    expect(primeraFrase("Versión 2.0 estable")).toBe("Versión 2.0 estable");
  });
});

describe("resolverOrigen", () => {
  it("los ids del diagnóstico llevan a su tarjeta", () => {
    expect(resolverOrigen("d1", diagnostico, competencia)).toBe("hallazgo-d1");
    expect(resolverOrigen("x1", diagnostico, competencia)).toBe("hallazgo-x1");
  });
  it("gp:<dimensión> lleva a la fila de dónde gana y pierde, o a la matriz", () => {
    expect(resolverOrigen("gp:funcionalidades", diagnostico, competencia)).toBe("comparacion-funcionalidades");
    expect(resolverOrigen("gp:precio", diagnostico, competencia)).toBe("matriz-comparativa");
  });
  it("las oportunidades se resuelven si se pasan", () => {
    expect(resolverOrigen("o1", diagnostico, competencia, [{ id: "o1" }])).toBe("oportunidad-o1");
  });
  it("un id desconocido es null", () => {
    expect(resolverOrigen("d9", diagnostico, competencia)).toBeNull();
    expect(resolverOrigen("gp:otra", diagnostico, competencia)).toBeNull();
    expect(resolverOrigen("o1", diagnostico, competencia)).toBeNull();
    expect(resolverOrigen("zz", null, null)).toBeNull();
    expect(resolverOrigen("", diagnostico, competencia)).toBeNull();
  });
});

describe("oportunidades", () => {
  it("se ordenan por prioridad, estable a igualdad", () => {
    const os = [
      { id: "o1", prioridad: "media" },
      { id: "o2", prioridad: "alta" },
      { id: "o3", prioridad: "media" },
      { id: "o4", prioridad: "baja" },
    ];
    expect(ordenarOportunidades(os).map((o) => o.id)).toEqual(["o2", "o1", "o3", "o4"]);
    expect(ordenarOportunidades(null)).toEqual([]);
  });
  it("cómo validarlo agrupa las acciones en Comprobar → Experimentar → Medir", () => {
    const g = accionesDeOportunidad(plan, "o1");
    expect(g.map((x) => x.grupo)).toEqual(["comprobar", "experimentar", "medir"]);
    expect(g[0].acciones.map((a) => a.id)).toEqual(["a1"]);
    expect(accionesDeOportunidad(plan, "o9")).toEqual([]);
    expect(accionesDeOportunidad(null, "o1")).toEqual([]);
  });
});

describe("bloque 1: el negocio", () => {
  it("negocio híbrido con dos tipologías de certeza alta o media", () => {
    expect(esNegocioHibrido([{ certeza: "alta" }, { certeza: "media" }])).toBe(true);
    expect(esNegocioHibrido([{ certeza: "alta" }, { certeza: "baja" }])).toBe(false);
    expect(esNegocioHibrido(undefined)).toBe(false);
  });
  it("hechos: primero la lectura de ADNweb, si no lo que declara la empresa; con las citas de lo declarado", () => {
    const h = hechosNegocio({
      identidad: {
        producto: { declara: { texto: "Solucions", evidencias: [pag("p1")] }, interpretamos: { texto: "Soluciones de empleo", evidencias: [pag("p2")], clase: "inferencia" } },
        paraQuien: { declara: null, interpretamos: { texto: "Empresas", evidencias: [], clase: "inferencia" } },
        beneficio: { declara: null, interpretamos: null },
        diferenciacion: { declara: { texto: "60 años", evidencias: [] }, interpretamos: null },
      } as never,
    });
    expect(h.map((x) => [x.clave, x.texto, x.clase])).toEqual([
      ["queOfrece", "Soluciones de empleo", "inferencia"],
      ["paraQuien", "Empresas", "inferencia"],
      ["propuesta", "60 años", "observado"],
    ]);
    expect(h[0].evidencias.map((e) => e.id)).toEqual(["p2", "p1"]);
    expect(hechosNegocio(null).every((x) => x.texto === null)).toBe(true);
  });
});

describe("bloque 2: datos clave", () => {
  const metrica = (clave: string, valor: unknown, estado = "disponible", tipo = "observado") => ({
    clave,
    etiqueta: `Etiqueta ${clave}`,
    valor,
    unidad: "/100",
    fuente: "PageSpeed",
    tipo,
    estado,
  });
  it("usa resumen.datosClave cuando viene bien formado", () => {
    const propio = { clave: "k", etiqueta: "Precio", valor: "9 €", clase: "observado" };
    expect(datosClave({ datosClave: [propio, { clave: 1 }] }, {})).toEqual([propio]);
  });
  it("si no, los indicadores disponibles y los precios publicados, sin hipótesis", () => {
    const r = {
      indicadores: [metrica("pagespeed_movil", 63), metrica("visitas", null, "insuficiente"), metrica("escenario", 5, "disponible", "hipotesis")],
    };
    const d = { precios: [{ texto: "Plan Pro 9 €/mes", plan: "Pro", url: "https://x.com/precios" }, { texto: "" }] };
    const out = datosClave(r, d);
    expect(out.map((x) => [x.clave, x.valor, x.clase])).toEqual([
      ["pagespeed_movil", "63/100", "observado"],
      ["precio-0", "Plan Pro 9 €/mes", "observado"],
    ]);
    expect(out[1].fuenteUrl).toBe("https://x.com/precios");
  });
  it("sin resumen usa las primeras métricas disponibles", () => {
    expect(datosClave(null, { metricas: [metrica("a", 1), metrica("b", 2)] }).map((x) => x.clave)).toEqual(["a", "b"]);
    expect(datosClave(null, null)).toEqual([]);
  });
  it("lo que no tiene datos fiables se lista por su etiqueta", () => {
    const d = { metricas: [metrica("visitas", null, "insuficiente", "inferencia"), metrica("a", 1), metrica("v", null, "no_aplica")] };
    expect(sinDatosFiables(d)).toEqual(["Etiqueta visitas"]);
  });
});

describe("utilidades", () => {
  it("valorMetrica: número, texto, rango y nulo", () => {
    expect(valorMetrica({ valor: 1727446, unidad: "puesto" })).toBe("1.727.446 puesto");
    expect(valorMetrica({ valor: 63, unidad: "/100" })).toBe("63/100");
    expect(valorMetrica({ valor: "LCP 2648 ms", unidad: "Core Web Vitals" })).toBe("LCP 2648 ms");
    expect(valorMetrica({ valor: { min: 1, max: 2 }, unidad: "€" })).toBe("1 – 2 €");
    expect(valorMetrica({ valor: null, unidad: "" })).toBeNull();
  });
  it("esHttp solo acepta http(s)", () => {
    expect(esHttp("https://a.com")).toBe(true);
    expect(esHttp("javascript:alert(1)")).toBe(false);
    expect(esHttp(null)).toBe(false);
  });
  it("trozosFrase destaca sin cambiar el texto", () => {
    const f = "TEB ofrece servicios de inserción laboral a empresas, financiándose mediante contratos y subvenciones.";
    const t = trozosFrase(f, "TEB");
    expect(t.map((x) => x.texto).join("")).toBe(f);
    expect(t.filter((x) => x.destacado).map((x) => x.texto)).toEqual(["TEB", "servicios de inserción laboral", "contratos y subvenciones"]);
    expect(trozosFrase("Una web sin patrón", null)).toEqual([{ texto: "Una web sin patrón", destacado: false }]);
  });
});
