import type { RawData } from "../types";
import type { EstadoSeccion, SeccionClaveV4 } from "./report";

/** Qué se pudo estudiar y qué no. Un informe puede quedar con cobertura parcial. */
export type ComponenteCobertura = "identidad" | "modelo" | "auditoria" | "rendimiento" | "competencia" | "diagnostico" | "oportunidades" | "plan";
export interface EstadoComponente {
  estado: "valido" | "parcial" | "fallido";
  motivo: string;
}

type EstadoSec = EstadoSeccion;

export interface EntradaCobertura {
  raw: RawData;
  secciones: Partial<Record<SeccionClaveV4, unknown>>;
  estados: Partial<Record<SeccionClaveV4, EstadoSec>>;
}

const MIN_PAGINAS_AUDITORIA = 3;
const MIN_COMPETIDORES_VERIFICADOS = 2;

const ok = (motivo: string): EstadoComponente => ({ estado: "valido", motivo });
const parcial = (motivo: string): EstadoComponente => ({ estado: "parcial", motivo });
const fallo = (motivo: string): EstadoComponente => ({ estado: "fallido", motivo });

/** Hay contenido si es una lista con elementos, o un objeto con alguna lista con elementos. */
function tieneContenido(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.values(v).some((x) => Array.isArray(x) && x.length > 0);
  return false;
}

/** Sección generada por IA que debe tener contenido: lista y con elementos = válido. */
function seccionConLista(estado: EstadoSec | undefined, valor: unknown, nombre: string, lista: unknown): EstadoComponente {
  if (estado === "error") return fallo(`No se pudo generar ${nombre}.`);
  if (estado !== "lista" || valor == null) return fallo(`${nombre[0].toUpperCase()}${nombre.slice(1)} no se llegó a generar.`);
  return tieneContenido(lista) ? ok(`${nombre[0].toUpperCase()}${nombre.slice(1)} generado.`) : parcial(`${nombre[0].toUpperCase()}${nombre.slice(1)} se generó pero sin elementos.`);
}

function elementos(v: unknown, campo: string): unknown {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return (v as Record<string, unknown>)[campo];
  return undefined;
}

export function evaluarCobertura(input: EntradaCobertura): Record<ComponenteCobertura, EstadoComponente> {
  const { raw, secciones, estados } = input;
  const ps = raw.pagespeed;

  // Identidad: se pudo leer la web y hay rastro de quién es (razón social, CIF o nombre en la propia web).
  const identidad = !raw.site
    ? fallo("No se pudo leer la web, así que no se puede confirmar la identidad.")
    : raw.legal?.razonSocial || raw.legal?.cif || raw.companyNameFromPage
      ? ok("Se leyó la web y se identificó a la empresa.")
      : parcial("Se leyó la web pero no se encontró razón social, CIF ni nombre de empresa claro.");

  const modelo =
    estados.anatomia === "lista" && secciones.anatomia != null
      ? ok("Se analizó cómo funciona el negocio.")
      : estados.anatomia === "error"
        ? fallo("No se pudo analizar el modelo de negocio.")
        : fallo("El modelo de negocio no se llegó a analizar.");

  const tieneScores = !!ps && !ps.error && (ps.mobile != null || ps.desktop != null);
  const paginas = raw.paginas?.length ?? raw.site?.pages.length ?? 0;
  const suficientesPaginas = paginas >= MIN_PAGINAS_AUDITORIA;
  const auditoria =
    tieneScores && suficientesPaginas
      ? ok(`PageSpeed disponible y ${paginas} páginas leídas.`)
      : tieneScores
        ? parcial(`Hay PageSpeed pero solo se leyeron ${paginas} páginas (mínimo ${MIN_PAGINAS_AUDITORIA}).`)
        : suficientesPaginas
          ? parcial(`Se leyeron ${paginas} páginas pero PageSpeed no devolvió datos.`)
          : fallo(`PageSpeed sin datos y solo ${paginas} páginas leídas.`);

  const rendimiento = !tieneScores
    ? fallo("PageSpeed no devolvió puntuaciones.")
    : ps!.mobile != null && ps!.desktop != null
      ? ok("Puntuaciones de PageSpeed en móvil y escritorio.")
      : parcial(`Solo hay puntuación de PageSpeed en ${ps!.mobile != null ? "móvil" : "escritorio"}.`);

  const comp = elementos(secciones.competencia, "competidores");
  const verificados = Array.isArray(comp) ? comp.filter((c) => !!c && typeof c === "object" && (c as { verificado?: unknown }).verificado === true).length : 0;
  const competencia =
    verificados >= MIN_COMPETIDORES_VERIFICADOS
      ? ok(`${verificados} competidores verificados.`)
      : verificados === 1
        ? parcial("Solo se verificó 1 competidor.")
        : fallo(estados.competencia === "error" ? "No se pudo analizar la competencia." : "No se verificó ningún competidor.");

  const diagnostico = seccionConLista(estados.diagnostico, secciones.diagnostico, "el diagnóstico", secciones.diagnostico);
  const oportunidades = seccionConLista(estados.oportunidades, secciones.oportunidades, "las oportunidades", secciones.oportunidades);
  const plan = seccionConLista(estados.plan, secciones.plan, "el plan de acción", secciones.plan);

  return { identidad, modelo, auditoria, rendimiento, competencia, diagnostico, oportunidades, plan };
}
