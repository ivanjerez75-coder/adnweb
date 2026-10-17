import { describe, expect, it } from "vitest";
import { describirFallo } from "@/lib/server/analyses/errors";
import { InsufficientDataError } from "@/lib/engine/collect";
import { AiUnavailableError } from "@/lib/engine/ai/providers";
import { BlockedUrlError } from "@/lib/engine/safe-fetch";

const INESPERADO = "Ha ocurrido un error inesperado. Te hemos devuelto el crédito.";
const SATURADA = "Alta demanda, inténtalo en unos minutos.";

describe("describirFallo", () => {
  it("datos insuficientes", () => {
    expect(describirFallo(new InsufficientDataError())).toEqual({
      mensaje: "No hemos podido reunir datos suficientes sobre esta web.",
      kind: "datos_insuficientes",
    });
  });

  it("IA quota y unavailable -> ia_saturada", () => {
    expect(describirFallo(new AiUnavailableError("x", "quota"))).toEqual({ mensaje: SATURADA, kind: "ia_saturada" });
    expect(describirFallo(new AiUnavailableError("x", "unavailable"))).toEqual({ mensaje: SATURADA, kind: "ia_saturada" });
  });

  it("IA invalid -> ia_invalida", () => {
    expect(describirFallo(new AiUnavailableError("x", "invalid"))).toEqual({
      mensaje: "No hemos podido generar el informe. Reinténtalo.",
      kind: "ia_invalida",
    });
  });

  it("IA unconfigured -> inesperado", () => {
    expect(describirFallo(new AiUnavailableError("x", "unconfigured"))).toEqual({ mensaje: INESPERADO, kind: "inesperado" });
  });

  it("URL bloqueada", () => {
    expect(describirFallo(new BlockedUrlError("privada"))).toEqual({ mensaje: "La URL no es válida.", kind: "bloqueada" });
  });

  it("cualquier otro error o string -> inesperado", () => {
    expect(describirFallo(new Error("x"))).toEqual({ mensaje: INESPERADO, kind: "inesperado" });
    expect(describirFallo("boom")).toEqual({ mensaje: INESPERADO, kind: "inesperado" });
  });
});
