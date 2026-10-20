import { safeNext } from "./redirect";

export function validarEmail(email: string): string | null {
  const v = email.trim();
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Introduce un email válido.";
  return null;
}

export function validarCodigo(codigo: string): string | null {
  return /^\d{6}$/.test(codigo.trim()) ? null : "Introduce el código de 6 dígitos.";
}

/** Origen (https://host) a partir de las cabeceras de la petición; null si no es fiable. */
export function origenDesdeCabeceras(host: string | null, proto: string | null): string | null {
  const h = (host ?? "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(h)) return null;
  const p = (proto ?? "").split(",")[0].trim().toLowerCase();
  const esLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h);
  const esquema = p === "http" || p === "https" ? p : esLocal ? "http" : "https";
  return `${esquema}://${h}`;
}

/**
 * Origen de la web para los retornos de login. Con NEXT_PUBLIC_SITE_URL (origen http/https válido)
 * se usa tal cual y las cabeceras se ignoran (se pueden falsificar). Sin ella, y solo para
 * desarrollo, se deduce de las cabeceras de la petición.
 */
export function origenDelSitio(h: { get(nombre: string): string | null }): string | null {
  const configurado = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (configurado) {
    try {
      const u = new URL(configurado);
      if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
    } catch {
      // valor inválido: se trata como si no estuviera
    }
  }
  return origenDesdeCabeceras(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
}

/** Destino tras login/registro: `next` seguro, o /dashboard con la url de la landing. */
export function destinoTrasLogin(next: string | null | undefined, url: string | null | undefined): string {
  const hasNext = typeof next === "string" && next.length > 0;
  if (!hasNext && url) return `/dashboard?url=${encodeURIComponent(url)}`;
  return safeNext(next);
}
