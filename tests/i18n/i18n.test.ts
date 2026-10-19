import { describe, it, expect } from "vitest";
import { t, es, IDIOMA_POR_DEFECTO, IDIOMAS, sinMarcas, trozosDestacados } from "@/lib/i18n";

describe("i18n", () => {
  it("devuelve el titular exacto de la landing", () => {
    expect(t("landing.titular1")).toBe("DESCUBRE CUÁNTO FACTURA");
    expect(t("landing.titular2")).toBe("CUALQUIER WEB");
  });

  it("reemplaza los marcadores {var}", () => {
    expect(t("panel.creditos", { n: 3 })).toContain("3");
    expect(t("panel.creditos", { n: 3 })).not.toContain("{n}");
  });

  it("una clave desconocida es un error de tipos", () => {
    // @ts-expect-error clave inexistente
    const valor = t("no.existe");
    expect(typeof valor).toBe("string");
  });

  it("idioma por defecto es es", () => {
    expect(IDIOMA_POR_DEFECTO).toBe("es");
    expect(IDIOMAS).toEqual(["es"]);
    expect(es.marca.nombre).toBe("ADNweb");
  });
});

describe("textos destacados de la landing", () => {
  it("el subtítulo se lee exacto y destaca LANZAR y ANALIZA", () => {
    const texto = t("landing.subtitulo");
    expect(sinMarcas(texto)).toBe(
      "ANTES DE LANZAR TU WEB, ANALIZA LAS QUE YA GANAN DINERO",
    );
    expect(
      trozosDestacados(texto).filter((p) => p.destacado).map((p) => p.texto),
    ).toEqual(["LANZAR", "ANALIZA"]);
  });

  it("los titulares de sección destacan su palabra clave", () => {
    const destacadas = (s: string) =>
      trozosDestacados(s).filter((p) => p.destacado).map((p) => p.texto);
    expect(destacadas(t("landing.oportunidadesTitulo"))).toEqual(["OPORTUNIDADES"]);
    expect(destacadas(t("landing.cierreTitulo"))).toEqual(["INVESTIGACIÓN"]);
    expect(sinMarcas(t("landing.cierreTitulo"))).toBe(
      "TODO GRAN NEGOCIO EMPEZÓ CON UNA INVESTIGACIÓN.",
    );
  });

  it("la explicación no promete estimaciones", () => {
    expect(t("landing.explicacion")).not.toMatch(/estima/i);
  });

  it("un texto sin marcas queda como un único trozo normal", () => {
    expect(trozosDestacados("HOLA")).toEqual([{ texto: "HOLA", destacado: false }]);
  });
});
