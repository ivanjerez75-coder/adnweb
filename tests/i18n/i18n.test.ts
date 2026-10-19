import { describe, it, expect } from "vitest";
import { t, es, IDIOMA_POR_DEFECTO, IDIOMAS } from "@/lib/i18n";

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
