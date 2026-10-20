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
  // Google devuelve error (p. ej. cancelado): error de Google. Sin código: el enlace no sirve.
  if (input.error) return { tipo: "error", destino: "/login?error=google" };
  if (!input.code) return { tipo: "error", destino: "/login?error=enlace" };
  return { tipo: "intercambiar", code: input.code, destino: safeNext(input.next) };
}
