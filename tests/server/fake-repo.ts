import type { Report } from "@/lib/engine/report";
import type { RawData } from "@/lib/engine/types";
import type {
  AnalisisDetalle,
  EstadoAnalisis,
  UserRepo,
  WorkerRepo,
} from "@/lib/server/analyses/repo";

const TRES_MIN = 3 * 60_000;

export interface FakeAnalisis {
  id: string;
  userId: string;
  url: string;
  dominio: string;
  estado: EstadoAnalisis;
  createdAt: Date;
  updatedAt: Date;
  pasoActual: string | null;
  datosBrutos: RawData | null;
  informe: Report | null;
  error: string | null;
  errorKind: string | null;
  creditoDevuelto: boolean;
}

export interface FakeState {
  /** Créditos restantes del usuario `userId`. */
  creditos: number;
  analisis: FakeAnalisis[];
  now(): Date;
  /** Avanza el reloj simulado (solo si no se pasó `now` en las opciones). */
  avanzar(ms: number): void;
  /** Inserta un análisis directamente (p. ej. de otro usuario). */
  insertarAnalisis(parcial: Partial<FakeAnalisis> & { userId: string }): FakeAnalisis;
}

/** Imita la semántica de las funciones SQL de 0001_cuentas.sql. */
export function createFakeRepos(opts?: {
  creditos?: number;
  userId?: string;
  now?: () => Date;
}): { user: UserRepo; worker: WorkerRepo; state: FakeState } {
  const userId = opts?.userId ?? "u1";
  let reloj = new Date("2026-01-01T00:00:00Z").getTime();
  let seq = 0;

  const state: FakeState = {
    creditos: opts?.creditos ?? 5,
    analisis: [],
    now: () => (opts?.now ? opts.now() : new Date(reloj)),
    avanzar: (ms) => {
      reloj += ms;
    },
    insertarAnalisis: (p) => {
      const ahora = state.now();
      const a: FakeAnalisis = {
        id: `a${++seq}`,
        url: `https://${p.dominio ?? "x.com"}`,
        dominio: "x.com",
        estado: "procesando",
        createdAt: ahora,
        updatedAt: ahora,
        pasoActual: null,
        datosBrutos: null,
        informe: null,
        error: null,
        errorKind: null,
        creditoDevuelto: false,
        ...p,
      };
      state.analisis.push(a);
      return a;
    },
  };

  const procesando = (id: string) =>
    state.analisis.find((a) => a.id === id && a.estado === "procesando");

  const user: UserRepo = {
    async obtenerPerfil() {
      return {
        id: userId,
        nombre: null,
        creditosRestantes: state.creditos,
        creditosMensuales: 5,
        renovacion: new Date(state.now().getTime() + 30 * 86_400_000).toISOString(),
      };
    },

    async iniciar(url, dominio) {
      if (state.creditos <= 0) return { ok: false, motivo: "sin_creditos" };
      const enCurso = state.analisis.some(
        (a) => a.userId === userId && a.estado === "procesando",
      );
      if (enCurso) return { ok: false, motivo: "en_curso" };
      state.creditos -= 1;
      const a = state.insertarAnalisis({ userId, url, dominio });
      return { ok: true, id: a.id };
    },

    async obtener(id) {
      const a = state.analisis.find((x) => x.id === id && x.userId === userId);
      if (!a) return null;
      const d: AnalisisDetalle = {
        id: a.id,
        url: a.url,
        dominio: a.dominio,
        estado: a.estado,
        createdAt: a.createdAt.toISOString(),
        pasoActual: a.pasoActual,
        informe: a.informe,
        error: a.error,
      };
      return d;
    },

    async listar(o) {
      const q = o?.buscar?.toLowerCase();
      return state.analisis
        .filter((a) => a.userId === userId)
        .filter((a) => !q || a.dominio.toLowerCase().includes(q))
        .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
        .slice(0, o?.limite ?? 50)
        .map((a) => ({
          id: a.id,
          url: a.url,
          dominio: a.dominio,
          estado: a.estado,
          createdAt: a.createdAt.toISOString(),
        }));
    },
  };

  const devolver = (a: FakeAnalisis): boolean => {
    if (a.creditoDevuelto) return false;
    a.creditoDevuelto = true;
    a.updatedAt = state.now();
    if (a.userId === userId) state.creditos += 1;
    return true;
  };

  const worker: WorkerRepo = {
    async paso(id, texto) {
      const a = procesando(id);
      if (!a) return;
      a.pasoActual = texto;
      a.updatedAt = state.now();
    },

    async completar(id, raw, informe) {
      const a = procesando(id);
      if (!a) return;
      a.estado = "listo";
      a.pasoActual = null;
      a.datosBrutos = raw;
      a.informe = informe;
      a.updatedAt = state.now();
    },

    async fallar(id, mensaje, kind) {
      const a = procesando(id);
      if (!a) return;
      a.estado = "error";
      a.pasoActual = null;
      a.error = mensaje;
      a.errorKind = kind;
      a.updatedAt = state.now();
    },

    async devolverCredito(id) {
      const a = state.analisis.find((x) => x.id === id);
      return a ? devolver(a) : false;
    },

    async buscarCache(dominio, desde) {
      const hit = state.analisis
        .filter(
          (a) =>
            a.estado === "listo" &&
            a.dominio === dominio &&
            a.createdAt.getTime() >= desde.getTime(),
        )
        .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())[0];
      return hit?.datosBrutos ?? null;
    },

    async marcarColgados(uid) {
      const limite = state.now().getTime() - TRES_MIN;
      let n = 0;
      for (const a of state.analisis) {
        if (a.userId !== uid || a.estado !== "procesando") continue;
        if (a.createdAt.getTime() >= limite) continue;
        a.estado = "error";
        a.error = "El análisis ha tardado demasiado. Te hemos devuelto el crédito.";
        a.errorKind = "timeout";
        a.updatedAt = state.now();
        devolver(a);
        n++;
      }
      return n;
    },
  };

  return { user, worker, state };
}
