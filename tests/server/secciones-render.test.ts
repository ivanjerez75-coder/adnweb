import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const { Secciones, claveContenido } = await import("../../app/(app)/analisis/[id]/secciones");

const render = (secciones: Record<string, { estado: string; contenido: unknown }>) =>
  renderToStaticMarkup(createElement(Secciones, { id: "x", createdAt: new Date().toISOString(), inicial: { estado: "lista", pasoActual: null, secciones } }));
const veces = (html: string, t: string) => html.split(t).length - 1;

const ev = { id: "p1-e1", tipo: "pagina", texto: "Cita literal", url: "https://x.example/", fuente: "https://x.example/" };
const oportunidad = (id: string, estado: string) => ({
  id,
  tipologia: "mejorar",
  titulo: `Mostrar casos ${id}`,
  origen: ["d1"],
  ficha: { evidencia: { texto: "No hay casos", evidencias: [ev] }, problema: "Falta confianza", solucion: "Publicar casos", porQuePodria: "Da confianza", faltaComprobar: ["Si hay clientes dispuestos"] },
  estado,
  criterios: { impacto: "alto", evidencia: "medio", viabilidad: "medio", diferenciacion: "bajo", facilidadValidacion: "alto" },
  prioridad: "media",
  clase: "hipotesis",
});

describe("Secciones (render)", () => {
  it("una oportunidad se etiqueta siempre como hipótesis y muestra su ficha y su origen", () => {
    const html = render({ oportunidades: { estado: "lista", contenido: [oportunidad("o1", "detectada"), oportunidad("o2", "por_validar")] } });
    expect(veces(html, "Hipótesis")).toBe(2);
    expect(html).toContain("Detectada");
    expect(html).toContain("Por validar");
    expect(html).toContain("Sale de: d1");
    expect(html).toContain("Qué falta comprobar:");
  });

  it("el plan agrupa las acciones y muestra su origen; un plan incompleto no rompe la vista", () => {
    const a = { id: "a1", origen: "o1", tarea: "Preguntar a clientes", porQue: "Valida", recursos: [], indicador: "Respuestas", criterio: { continuar: "Si interesa", modificar: "", descartar: "Si no" } };
    const html = render({ plan: { estado: "lista", contenido: { comprobar: [a], experimentar: [], medir: [] } } });
    expect(html).toContain("Comprobar");
    expect(html).not.toContain("Experimentar");
    expect(html).toContain("(sale de o1)");
    expect(html).toContain("Descartar si: Si no");
    expect(() => render({ plan: { estado: "lista", contenido: { medir: "x" } } })).not.toThrow();
  });

  it("la anatomía separa lo que la empresa declara de lo que ADNweb interpreta", () => {
    const anatomia = {
      nombre: "Facturo",
      fraseResumen: { texto: "Facturas online", evidencias: [ev] },
      identidad: { producto: { declara: { texto: "Software de facturas", evidencias: [ev] }, interpretamos: { texto: "Orientado a pymes", evidencias: [ev], clase: "inferencia" } } },
      tipologias: [{ tipo: "saas", certeza: "media", explicacion: "Cuota", evidencias: [ev] }],
      lineas: [{ nombre: "L", queOfrece: ["x"], publico: "p", comoSeContrata: "c", evidencias: [ev] }],
      monetizacion: [{ fuente: "Cuota mensual", nivel: "inferido", evidencias: [ev] }],
      cliente: { explicito: null, necesidades: [], sectores: [], mensaje: null, segmentosAlternativos: [{ texto: "Gestorías", clase: "hipotesis" }] },
      canales: [],
      afirmaciones: [],
      modeloEstado: "probable",
    };
    const html = render({ anatomia: { estado: "lista", contenido: anatomia } });
    expect(html).toContain("La empresa declara: Software de facturas");
    expect(html).toContain("ADNweb interpreta: Orientado a pymes");
    expect(html).toContain("Inferencia");
    expect(html).toContain("Cuota mensual (Inferido)");
    expect(html).toContain("(hipótesis)");
  });

  it("una anatomía incompleta no rompe la vista", () => {
    expect(() => render({ anatomia: { estado: "lista", contenido: { nombre: "X" } } })).not.toThrow();
  });
});

describe("Secciones (render): sin duplicados", () => {
  const scoreContenido = {
    metodologia: "dna-score-1.0",
    global: null,
    coberturaGlobal: 0.4,
    avisos: ["Resume indicadores públicos; no es una valoración financiera.", "Pesos provisionales, pendientes de validación."],
    dimensiones: [{ clave: "propuesta", nombre: "Propuesta de valor", peso: 0.2, valor: 80, cobertura: 1, indicadores: [], resumen: "Puntos fuertes: Se explica qué es el negocio (25/25)." }],
  };

  it("el aviso del score aparece una vez y se muestra el resumen calculado en código", () => {
    const html = render({ rendimiento: { estado: "lista", contenido: { dimensiones: [], score: scoreContenido, noSePuedeSaber: [] } } });
    expect(veces(html, "Resume indicadores públicos")).toBe(1);
    expect(html).toContain("Puntos fuertes: Se explica qué es el negocio (25/25).");
  });

  it("las cifras del escenario se muestran una sola vez", () => {
    const escenarioMetrica = {
      clave: "escenario_ingresos",
      etiqueta: "Escenario de ingresos",
      valor: { min: 4584, max: 45840 },
      unidad: "€/mes",
      tipo: "hipotesis",
      metodologia: "Clientes × precio",
      fuente: "Precios publicados",
      obtenidoEn: "2026-10-19",
      confianza: "baja",
      motivoConfianza: "Es una ilustración.",
      limitaciones: ["Escenario ilustrativo: no son los ingresos de la empresa", "Un precio anunciado no es un ingreso medio."],
      supuestos: [],
      estado: "disponible",
    };
    const datos = { metricas: [escenarioMetrica], precios: [], escenario: [{ clientes: 100, ingresosMes: 4584 }, { clientes: 1000, ingresosMes: 45840 }] };
    const html = render({ datos: { estado: "lista", contenido: datos } });
    expect(veces(html, "45.840")).toBe(1);
    expect(veces(html, "Escenario ilustrativo: no son los ingresos de la empresa")).toBe(1);
    expect(html).toContain("Un precio anunciado no es un ingreso medio.");
  });

  it("la clave del ErrorBoundary cambia cuando cambia el contenido o el estado", () => {
    const a = claveContenido({ clave: "anatomia", titulo: "", estado: "lista", contenido: { x: 1 } });
    expect(claveContenido({ clave: "anatomia", titulo: "", estado: "lista", contenido: { x: 1 } })).toBe(a);
    expect(claveContenido({ clave: "anatomia", titulo: "", estado: "lista", contenido: { x: 2 } })).not.toBe(a);
    expect(claveContenido({ clave: "anatomia", titulo: "", estado: "error", contenido: { x: 1 } })).not.toBe(a);
  });
});
