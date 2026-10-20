import type { SeccionClaveV4 } from "@/lib/engine/v3/report";
import { t, type Clave } from "@/lib/i18n";

/** Misma clave que el motor: un solo contrato. */
export type ClaveSeccion = SeccionClaveV4;
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
  ["resumen", "Resumen ejecutivo"],
  ["datos", "Datos y métricas"],
  ["anatomia", "Anatomía del negocio"],
  ["rendimiento", "Rendimiento y presencia digital"],
  ["competencia", "Competencia y posicionamiento"],
  ["diagnostico", "Diagnóstico estratégico"],
  ["oportunidades", "Oportunidades de negocio"],
  ["plan", "Plan de acción"],
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

// ---------- Informe v4: los 5 bloques de la página ----------

/** Los 5 bloques visibles, en orden. Cada uno reúne varias secciones del motor. */
export const BLOQUES = ["negocio", "datos", "competencia", "hallazgos", "oportunidades"] as const;
export type ClaveBloque = (typeof BLOQUES)[number];

/** La sección del motor que decide el estado de cada bloque. */
const PRINCIPAL: Record<ClaveBloque, ClaveSeccion> = {
  negocio: "anatomia",
  datos: "datos",
  competencia: "competencia",
  hallazgos: "diagnostico",
  oportunidades: "oportunidades",
};

const TITULOS_BLOQUE: Record<ClaveBloque, [Clave, Clave]> = {
  negocio: ["informe.bloques.negocio", "informe.bloques.negocioPregunta"],
  datos: ["informe.bloques.datos", "informe.bloques.datosPregunta"],
  competencia: ["informe.bloques.competencia", "informe.bloques.competenciaPregunta"],
  hallazgos: ["informe.bloques.hallazgos", "informe.bloques.hallazgosPregunta"],
  oportunidades: ["informe.bloques.oportunidades", "informe.bloques.oportunidadesPregunta"],
};

export interface BloqueInforme {
  clave: ClaveBloque;
  /** "01"… "05". */
  numero: string;
  /** id del elemento en la página, para la navegación. */
  ancla: string;
  titulo: string;
  pregunta: string;
  estado: EstadoSeccionVista;
}

export interface InformeVista {
  bloques: BloqueInforme[];
  /** Todas las secciones del motor (incluidas resumen, plan y cobertura), con su estado y contenido. */
  porClave: Record<ClaveSeccion, SeccionVista>;
}

const CLAVES_MOTOR: ClaveSeccion[] = [...ORDEN.map(([c]) => c), "cobertura"];

/** Los 5 bloques del informe v4, con el estado de su sección principal (ver `ordenSecciones`). */
export function ordenSeccionesV4(
  secciones: Record<string, { estado: string; contenido: unknown } | undefined>,
  createdAt: string,
  ahora: Date,
): InformeVista {
  const creado = Date.parse(createdAt);
  const vencido = Number.isFinite(creado) && ahora.getTime() - creado > TIEMPO_MAX_SECCION_MS;
  const porClave = {} as Record<ClaveSeccion, SeccionVista>;
  for (const clave of CLAVES_MOTOR) {
    const s = secciones && Object.prototype.hasOwnProperty.call(secciones, clave) ? secciones[clave] : undefined;
    let estado: EstadoSeccionVista = s && ESTADOS.includes(s.estado) ? (s.estado as EstadoSeccionVista) : "pendiente";
    if (estado === "pendiente" && vencido) estado = "error";
    const contenido = s?.contenido ?? null;
    // Una sección "lista" sin contenido no se puede pintar: cuenta como fallida.
    if (estado === "lista" && contenido === null) estado = "error";
    porClave[clave] = { clave, titulo: clave, estado, contenido };
  }
  const bloques = BLOQUES.map((clave, i) => ({
    clave,
    numero: String(i + 1).padStart(2, "0"),
    ancla: `bloque-${clave}`,
    titulo: t(TITULOS_BLOQUE[clave][0]),
    pregunta: t(TITULOS_BLOQUE[clave][1]),
    estado: porClave[PRINCIPAL[clave]].estado,
  }));
  return { bloques, porClave };
}

export type EstadoInforme = "generando" | "parcial" | "completo";

/** Estado global de la cabecera: generando mientras algo siga pendiente; parcial si algo falló. */
export function estadoInforme(v: InformeVista, procesando: boolean): EstadoInforme {
  const todas = Object.values(v.porClave);
  if (procesando || todas.some((s) => s.estado === "pendiente")) return "generando";
  if (todas.some((s) => s.estado === "error")) return "parcial";
  const cob = v.porClave.cobertura?.contenido;
  if (cob && typeof cob === "object" && Object.values(cob).some((c) => (c as { estado?: string } | null)?.estado === "fallido")) return "parcial";
  return "completo";
}
