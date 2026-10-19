import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const { Secciones } = await import("../../app/analisis/[id]/secciones");

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
