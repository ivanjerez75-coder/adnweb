export type ClaveSeccion = "datos" | "adn" | "saber" | "score" | "revision" | "competidores" | "aprender" | "cierre";
export type EstadoSeccionVista = "pendiente" | "lista" | "error";

export interface SeccionVista {
  clave: ClaveSeccion;
  titulo: string;
  estado: EstadoSeccionVista;
  contenido: unknown;
}

/** Una sección que sigue pendiente pasado este tiempo desde la creación se da por fallida. */
export const TIEMPO_MAX_SECCION_MS = 3 * 60 * 1000;

const ORDEN: [ClaveSeccion, string][] = [
  ["datos", "Datos y métricas"],
  ["adn", "ADN del negocio"],
  ["saber", "Qué sabemos y qué no"],
  ["score", "DNA Score"],
  ["revision", "Qué hace bien y problemas"],
  ["competidores", "Competidores"],
  ["aprender", "Qué aprender"],
  ["cierre", "Oportunidades"],
];

const ESTADOS = ["pendiente", "lista", "error"];

/** Orden de visualización y títulos. Ignora claves desconocidas; las ausentes cuentan como pendientes. */
export function ordenSecciones(
  secciones: Record<string, { estado: string; contenido: unknown } | undefined>,
  createdAt: string,
  ahora: Date,
): SeccionVista[] {
  const creado = Date.parse(createdAt);
  const vencido = Number.isFinite(creado) && ahora.getTime() - creado > TIEMPO_MAX_SECCION_MS;
  return ORDEN.map(([clave, titulo]) => {
    const s = Object.prototype.hasOwnProperty.call(secciones, clave) ? secciones[clave] : undefined;
    let estado: EstadoSeccionVista = s && ESTADOS.includes(s.estado) ? (s.estado as EstadoSeccionVista) : "pendiente";
    if (estado === "pendiente" && vencido) estado = "error";
    return { clave, titulo, estado, contenido: s?.contenido ?? null };
  });
}

export const hayPendientes = (vistas: SeccionVista[]): boolean => vistas.some((s) => s.estado === "pendiente");
