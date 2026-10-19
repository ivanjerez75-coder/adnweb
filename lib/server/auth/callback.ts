import { safeNext } from "./redirect";

export type DecisionCallback =
  | { tipo: "intercambiar"; code: string; destino: string }
  | { tipo: "error"; destino: string };

/** Decisión pura del retorno de Google: intercambiar el código o volver a /login con error. */
export function decidirCallback(input: {
  code?: string | null;
  error?: string | null;
  next?: string | null;
}): DecisionCallback {
  if (input.error || !input.code) return { tipo: "error", destino: "/login?error=google" };
  return { tipo: "intercambiar", code: input.code, destino: safeNext(input.next) };
}
