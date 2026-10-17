import { isProtectedPath } from "./redirect";

export type Access = "pass" | "login" | "unauthorized-json" | "unconfigured-json" | "unconfigured-text";

/** Decisión pura del proxy según ruta, configuración y sesión. */
export function decideAccess(input: {
  pathname: string;
  configured: boolean;
  userId: string | null;
}): Access {
  const { pathname, configured, userId } = input;
  if (!isProtectedPath(pathname)) return "pass";
  const isApi = pathname.startsWith("/api/");
  if (!configured) return isApi ? "unconfigured-json" : "unconfigured-text";
  if (userId !== null) return "pass";
  return isApi ? "unauthorized-json" : "login";
}
