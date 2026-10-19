/** Agrupa y filtra la lista de análisis recientes de la barra lateral. Puro: sirve en servidor y cliente. */

export interface Grupos<T> {
  hoy: T[];
  ultimos7: T[];
  anteriores: T[];
}

/**
 * Reparte la lista en "Hoy" (desde la medianoche local de hoy), "Últimos 7 días"
 * (desde la medianoche local de hace 7 días) y "Anteriores". Conserva el orden.
 */
export function agruparRecientes<T extends { createdAt: string }>(lista: T[], ahora: Date): Grupos<T> {
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  // Con el constructor de fechas (no restando milisegundos) el límite sigue siendo medianoche aunque haya cambio de hora.
  const inicio7 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 7).getTime();
  const grupos: Grupos<T> = { hoy: [], ultimos7: [], anteriores: [] };
  for (const a of lista) {
    const t = Date.parse(a.createdAt);
    if (Number.isNaN(t)) grupos.anteriores.push(a);
    else if (t >= inicioHoy) grupos.hoy.push(a);
    else if (t >= inicio7) grupos.ultimos7.push(a);
    else grupos.anteriores.push(a);
  }
  return grupos;
}

/** Filtra por dominio, sin distinguir mayúsculas. Un texto vacío no filtra. */
export function filtrarRecientes<T extends { dominio: string }>(lista: T[], texto: string): T[] {
  const q = texto.trim().toLowerCase();
  if (!q) return lista;
  return lista.filter((a) => a.dominio.toLowerCase().includes(q));
}
