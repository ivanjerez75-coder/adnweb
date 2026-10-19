import { describe, expect, it } from "vitest";
import { decidirSondeo, siguienteSondeo } from "@/lib/shared/polling";

describe("siguienteSondeo", () => {
  it("2000 ms en los primeros 30 intentos", () => {
    expect(siguienteSondeo(0)).toBe(2000);
    expect(siguienteSondeo(29)).toBe(2000);
  });
  it("5000 ms hasta el intento 119", () => {
    expect(siguienteSondeo(30)).toBe(5000);
    expect(siguienteSondeo(119)).toBe(5000);
  });
  it("null a partir del intento 120", () => {
    expect(siguienteSondeo(120)).toBeNull();
  });
});



describe("decidirSondeo", () => {
  it("401 y 404 refrescan", () => {
    expect(decidirSondeo(401, 3, 0)).toEqual({ accion: "refrescar" });
    expect(decidirSondeo(404, 3, 2)).toEqual({ accion: "refrescar" });
  });
  it("200 sigue con la espera siguiente", () => {
    expect(decidirSondeo(200, 0, 0)).toEqual({ accion: "seguir", espera: 2000 });
    expect(decidirSondeo(200, 29, 0)).toEqual({ accion: "seguir", espera: 5000 });
  });
  it("200 en el último intento para con aviso de lentitud", () => {
    expect(decidirSondeo(200, 119, 0)).toEqual({
      accion: "parar",
      mensaje: "Esto está tardando más de lo normal; recarga la página.",
    });
  });
  it("5xx y red reintentan con mensaje", () => {
    expect(decidirSondeo(500, 1, 0)).toEqual({
      accion: "seguir",
      espera: 2000,
      mensaje: "No hemos podido consultar el estado del análisis.",
    });
    expect(decidirSondeo(0, 1, 3).accion).toBe("seguir");
  });
  it("para tras 5 fallos seguidos", () => {
    expect(decidirSondeo(500, 1, 4)).toEqual({
      accion: "parar",
      mensaje: "No hemos podido consultar el estado del análisis. Recarga la página.",
    });
    expect(decidirSondeo(0, 1, 4).accion).toBe("parar");
  });
});
