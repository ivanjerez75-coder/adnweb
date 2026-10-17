import { safeNext } from "./redirect";

export function validarCredenciales(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Introduce un email válido.";
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  return null;
}

/** Destino tras login/registro: `next` seguro, o /dashboard con la url de la landing. */
export function destinoTrasLogin(next: string | null | undefined, url: string | null | undefined): string {
  const hasNext = typeof next === "string" && next.length > 0;
  if (!hasNext && url) return `/dashboard?url=${encodeURIComponent(url)}`;
  return safeNext(next);
}
