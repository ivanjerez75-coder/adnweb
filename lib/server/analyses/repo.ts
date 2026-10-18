import type { Report } from "@/lib/engine/report";
import type { RawData } from "@/lib/engine/types";

export type EstadoAnalisis = "procesando" | "listo" | "error";

export interface Perfil {
  id: string;
  nombre: string | null;
  creditosRestantes: number;
  creditosMensuales: number;
  renovacion: string;
}

export interface AnalisisResumen {
  id: string;
  url: string;
  dominio: string;
  estado: EstadoAnalisis;
  createdAt: string;
}

/** Estado de una sección del informe v3 guardada en la base de datos. */
export interface SeccionGuardada {
  estado: "pendiente" | "lista" | "error";
  contenido: unknown;
}
export type SeccionesGuardadas = Record<string, SeccionGuardada>;

export interface AnalisisDetalle extends AnalisisResumen {
  pasoActual: string | null;
  /** Informe antiguo (version 2). Null en v3: el contenido está en secciones. */
  informe: Report | null;
  /** 2 = informe antiguo, 3 = informe por secciones. */
  version: number;
  secciones: SeccionesGuardadas;
  error: string | null;
}

export type InicioResultado =
  | { ok: true; id: string }
  | { ok: false; motivo: "sin_creditos" | "en_curso" };

/** Repositorio con la sesión del usuario (RLS). */
export interface UserRepo {
  obtenerPerfil(): Promise<Perfil>;
  iniciar(url: string, dominio: string): Promise<InicioResultado>;
  /** null si no existe o no es tuyo. */
  obtener(id: string): Promise<AnalisisDetalle | null>;
  listar(opts?: { buscar?: string; limite?: number }): Promise<AnalisisResumen[]>;
}

/** Repositorio con service role. Solo servidor. */
export interface WorkerRepo {
  paso(id: string, texto: string): Promise<void>;
  /** Guarda los datos recogidos (alimenta la caché de 24 h aunque fallen las secciones). */
  guardarDatosBrutos(id: string, raw: RawData): Promise<void>;
  /** Guarda (o sobrescribe) una sección del informe v3. false si la fila ya no está procesando/listo. */
  guardarSeccion(id: string, clave: string, contenido: unknown | null, estado: SeccionGuardada["estado"]): Promise<boolean>;
  /** procesando -> listo, version 3. */
  marcarListo(id: string): Promise<void>;
  completar(id: string, raw: RawData, informe: Report): Promise<void>;
  fallar(id: string, mensaje: string, kind: string): Promise<void>;
  devolverCredito(id: string): Promise<boolean>;
  buscarCache(dominio: string, desde: Date): Promise<RawData | null>;
  marcarColgados(userId: string): Promise<number>;
}
