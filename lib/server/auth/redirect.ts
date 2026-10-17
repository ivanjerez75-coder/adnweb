const PROTECTED = ["/dashboard", "/analisis", "/historial", "/cuenta", "/api/analisis"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Solo permite rutas internas; evita redirecciones abiertas. */
export function safeNext(next: string | null | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    /[\u0000-\u001f]/.test(next)
  ) {
    return "/dashboard";
  }
  return next;
}
