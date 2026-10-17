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

export interface AnalisisDetalle extends AnalisisResumen {
  pasoActual: string | null;
  informe: Report | null;
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
  completar(id: string, raw: RawData, informe: Report): Promise<void>;
  fallar(id: string, mensaje: string, kind: string): Promise<void>;
  devolverCredito(id: string): Promise<boolean>;
  buscarCache(dominio: string, desde: Date): Promise<RawData | null>;
  marcarColgados(userId: string): Promise<number>;
}
