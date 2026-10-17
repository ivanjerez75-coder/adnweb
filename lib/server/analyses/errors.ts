import { InsufficientDataError } from "@/lib/engine/collect";
import { AiUnavailableError } from "@/lib/engine/ai/providers";
import { BlockedUrlError } from "@/lib/engine/safe-fetch";

export type FalloKind = "datos_insuficientes" | "ia_saturada" | "ia_invalida" | "bloqueada" | "inesperado";

const INESPERADO = "Ha ocurrido un error inesperado. Te hemos devuelto el crédito.";

/** Traduce un fallo del motor al mensaje que ve el usuario. */
export function describirFallo(error: unknown): { mensaje: string; kind: FalloKind } {
  if (error instanceof InsufficientDataError) {
    return { mensaje: "No hemos podido reunir datos suficientes sobre esta web.", kind: "datos_insuficientes" };
  }
  if (error instanceof AiUnavailableError) {
    if (error.kind === "quota" || error.kind === "unavailable") {
      return { mensaje: "Alta demanda, inténtalo en unos minutos.", kind: "ia_saturada" };
    }
    if (error.kind === "invalid") {
      return { mensaje: "No hemos podido generar el informe. Reinténtalo.", kind: "ia_invalida" };
    }
    return { mensaje: INESPERADO, kind: "inesperado" };
  }
  if (error instanceof BlockedUrlError) {
    return { mensaje: "La URL no es válida.", kind: "bloqueada" };
  }
  return { mensaje: INESPERADO, kind: "inesperado" };
}
