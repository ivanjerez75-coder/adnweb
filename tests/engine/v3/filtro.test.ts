import { describe, it, expect } from "vitest";
import { contieneCifraNoRespaldada, limpiarAfirmacionesNoRespaldadas } from "../../../lib/engine/v3/filtro";

describe("contieneCifraNoRespaldada", () => {
  it.each([
    "Facturan ≈2 M€ al año",
    "Unos 500 € al mes",
    "Cobran $20 por usuario",
    "Ingresos de 3 millones EUR",
    "Más de 100 USD",
    "Mejora un 20 % la conversión",
    "Crece un 15% al año",
    "Recibe 10.000 visitas al mes",
    "Tiene 300 visitantes",
    "Más de 5000 usuarios",
    "Atiende a 120 clientes",
    "Reduce las ventas perdidas",
    "Sube la tasa de conversión",
    "Menos abandono del carrito",
    "Baja el churn",
    "Aumentará las ventas",
    "Impulsará las ventas online",
    "Atraerá más clientes",
    "Atraerá mayor volumen de pedidos",
    "Con más de 60 años de trayectoria",
  ])("detecta: %s", (t) => expect(contieneCifraNoRespaldada(t)).toBe(true));

  it.each(["Suscripción mensual", "Venta de cursos de formación profesional", "Mostrar los planes en la portada", "Añadir casos de éxito de clientes"])(
    "no detecta: %s",
    (t) => expect(contieneCifraNoRespaldada(t)).toBe(false),
  );
});

describe("limpiarAfirmacionesNoRespaldadas", () => {
  it("quita solo la frase con la afirmación", () => {
    expect(limpiarAfirmacionesNoRespaldadas("Añadir un botón de compra en la portada. Esto impulsará las ventas online.")).toBe("Añadir un botón de compra en la portada.");
  });
  it("si no queda nada devuelve vacío", () => {
    expect(limpiarAfirmacionesNoRespaldadas("≈2 M€ al año")).toBe("");
    expect(limpiarAfirmacionesNoRespaldadas("")).toBe("");
  });
  it("quita las frases de años de experiencia", () => {
    const t = limpiarAfirmacionesNoRespaldadas("Cooperativa de inserción laboral en Barcelona. Cuenta con más de 60 años de trayectoria.");
    expect(t).toBe("Cooperativa de inserción laboral en Barcelona.");
    expect(t).not.toMatch(/60 años/);
  });
  it("deja intacto un texto sin cifras", () => {
    expect(limpiarAfirmacionesNoRespaldadas("Software de facturación para autónomos. Se contrata en línea.")).toBe("Software de facturación para autónomos. Se contrata en línea.");
  });
});

describe("filtro sin sobrefiltrar", () => {
  it("en texto descriptivo deja pasar precios y porcentajes, pero no promesas ni años", async () => {
    const { limpiarAfirmacionesNoRespaldadas: f } = await import("../../../lib/engine/v3/filtro");
    expect(f("Productos 100% ecológicos.", { descriptivo: true })).toBe("Productos 100% ecológicos.");
    expect(f("Packs desde 29 €/mes.", { descriptivo: true })).toBe("Packs desde 29 €/mes.");
    expect(f("Tienda online. Impulsará las ventas.", { descriptivo: true })).toBe("Tienda online.");
    expect(f("Entidad con más de 60 años de trayectoria.", { descriptivo: true })).toBe("");
    expect(f("Factura 2 M€ al año.")).toBe("");
  });
  it("'abandono' solo cuenta como métrica de conversión", async () => {
    const { contieneCifraNoRespaldada: c } = await import("../../../lib/engine/v3/filtro");
    expect(c("Luchamos contra el abandono escolar.")).toBe(false);
    expect(c("Reducirá la tasa de abandono.")).toBe(true);
    expect(c("Menos abandono del carrito.")).toBe(true);
  });
});
