import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const { Secciones, claveContenido } = await import("../../app/(app)/analisis/[id]/secciones");

const render = (secciones: Record<string, { estado: string; contenido: unknown }>) =>
  renderToStaticMarkup(createElement(Secciones, { id: "x", createdAt: new Date().toISOString(), inicial: { estado: "lista", pasoActual: null, secciones } }));
const veces = (html: string, t: string) => html.split(t).length - 1;

const ev = { id: "p1-e1", tipo: "pagina", texto: "Cita literal", url: "https://x.example/", fuente: "https://x.example/" };
const oportunidad = (confianza: string) => ({
  hallazgo: "H",
  evidencias: [ev],
  impacto: "Más solicitudes",
  impactoNivel: "alto",
  esfuerzo: "bajo",
  riesgo: "bajo",
  prioridad: "alta",
  accion: "A",
  validacion: "V",
  confianza,
  supuestos: [],
});

describe("Secciones (render)", () => {
  it("el impacto se etiqueta siempre como hipótesis, también en una oportunidad comprobada", () => {
    const html = render({ cierre: { estado: "lista", contenido: { oportunidades: [oportunidad("comprobado"), oportunidad("hipotesis")] } } });
    expect(veces(html, "Impacto esperado (hipótesis): Más solicitudes")).toBe(2);
    expect(html).toContain("Comprobado");
  });

  it("la línea del adn muestra 'Fuente de ingresos'", () => {
    const adn = { queEs: null, propuestaValor: null, tipoNegocio: "saas", modeloEstado: "probable", canales: [], afirmaciones: [], comoFunciona: null, lineas: [{ nombre: "L", queOfrece: ["x"], publico: "p", comoSeContrata: "c", ingresos: "Cuota mensual", evidencias: [ev] }] };
    const html = render({ adn: { estado: "lista", contenido: adn } });
    expect(html).toContain("Fuente de ingresos: Cuota mensual");
    expect(html).not.toMatch(/>Ingresos:/);
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
    const html = render({ score: { estado: "lista", contenido: scoreContenido }, cierre: { estado: "lista", contenido: { oportunidades: [], motivos: { propuesta: ["Texto de la IA"] } } } });
    expect(veces(html, "Resume indicadores públicos")).toBe(1);
    expect(html).toContain("Puntos fuertes: Se explica qué es el negocio (25/25).");
    expect(html).not.toContain("Texto de la IA");
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
    const a = claveContenido({ clave: "adn", titulo: "", estado: "lista", contenido: { x: 1 } });
    expect(claveContenido({ clave: "adn", titulo: "", estado: "lista", contenido: { x: 1 } })).toBe(a);
    expect(claveContenido({ clave: "adn", titulo: "", estado: "lista", contenido: { x: 2 } })).not.toBe(a);
    expect(claveContenido({ clave: "adn", titulo: "", estado: "error", contenido: { x: 1 } })).not.toBe(a);
  });
});
