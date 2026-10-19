import type { SupabaseClient } from "@supabase/supabase-js";
import type { Report } from "@/lib/engine/report";
import type { RawData } from "@/lib/engine/types";
import type {
  AnalisisDetalle,
  AnalisisResumen,
  EstadoAnalisis,
  Perfil,
  SeccionesGuardadas,
  UserRepo,
  WorkerRepo,
} from "./repo";

const COLS_RESUMEN = "id,url,dominio,estado,created_at";
const COLS_DETALLE = `${COLS_RESUMEN},paso_actual,informe,version,secciones,error`;

interface FilaResumen {
  id: string;
  url: string;
  dominio: string;
  estado: EstadoAnalisis;
  created_at: string;
}
interface FilaDetalle extends FilaResumen {
  paso_actual: string | null;
  informe: Report | null;
  version: number;
  secciones: SeccionesGuardadas | null;
  error: string | null;
}

function aResumen(f: FilaResumen): AnalisisResumen {
  return {
    id: f.id,
    url: f.url,
    dominio: f.dominio,
    estado: f.estado,
    createdAt: f.created_at,
  };
}

function lanzarSiError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function createUserRepo(client: SupabaseClient): UserRepo {
  return {
    async obtenerPerfil(): Promise<Perfil> {
      const { data, error } = await client.rpc("obtener_perfil");
      lanzarSiError(error);
      const fila = Array.isArray(data) ? data[0] : data;
      if (!fila || fila.id == null) throw new Error("perfil_no_encontrado");
      return {
        id: fila.id,
        nombre: fila.nombre ?? null,
        creditosRestantes: fila.creditos_restantes,
        creditosMensuales: fila.creditos_mensuales,
        renovacion: fila.renovacion,
      };
    },

    async iniciar(url, dominio) {
      const { data, error } = await client.rpc("iniciar_analisis", {
        p_url: url,
        p_dominio: dominio,
      });
      if (error) {
        if (error.message.includes("sin_creditos")) return { ok: false, motivo: "sin_creditos" };
        if (error.message.includes("analisis_en_curso")) return { ok: false, motivo: "en_curso" };
        throw new Error(error.message);
      }
      return { ok: true, id: data as string };
    },

    async obtener(id): Promise<AnalisisDetalle | null> {
      const { data, error } = await client
        .from("analyses")
        .select(COLS_DETALLE)
        .eq("id", id)
        .maybeSingle();
      lanzarSiError(error);
      if (!data) return null;
      const f = data as unknown as FilaDetalle;
      return {
        ...aResumen(f),
        pasoActual: f.paso_actual,
        informe: f.informe,
        version: f.version ?? 2,
        secciones: f.secciones ?? {},
        error: f.error,
      };
    },

    async listar(opts) {
      let q = client.from("analyses").select(COLS_RESUMEN);
      if (opts?.buscar) {
        const escapado = opts.buscar.replace(/[\\%_]/g, (c) => `\\${c}`);
        q = q.ilike("dominio", `%${escapado}%`);
      }
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(opts?.limite ?? 50);
      lanzarSiError(error);
      return ((data ?? []) as unknown as FilaResumen[]).map(aResumen);
    },
  };
}

export function createWorkerRepo(admin: SupabaseClient): WorkerRepo {
  // Solo se tocan filas 'procesando': un worker tardío nunca pisa un análisis
  // ya marcado como colgado (y con el crédito devuelto).
  async function actualizar(id: string, cambios: Record<string, unknown>) {
    const { error } = await admin
      .from("analyses")
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("estado", "procesando");
    lanzarSiError(error);
  }

  return {
    async paso(id, texto) {
      await actualizar(id, { paso_actual: texto });
    },

    async guardarDatosBrutos(id, raw: RawData) {
      await actualizar(id, { datos_brutos: raw });
    },

    async guardarSeccion(id, clave, contenido, estado) {
      const { data, error } = await admin.rpc("guardar_seccion", {
        p_id: id,
        p_clave: clave,
        p_contenido: contenido,
        p_estado: estado,
      });
      lanzarSiError(error);
      return data === true;
    },

    async marcarListo(id) {
      await actualizar(id, { estado: "listo", version: 4, paso_actual: null });
    },

    async completar(id, raw: RawData, informe: Report) {
      await actualizar(id, {
        estado: "listo",
        paso_actual: null,
        datos_brutos: raw,
        informe,
      });
    },

    async fallar(id, mensaje, kind) {
      await actualizar(id, {
        estado: "error",
        paso_actual: null,
        error: mensaje,
        error_kind: kind,
      });
    },

    async devolverCredito(id) {
      const { data, error } = await admin.rpc("devolver_credito", { p_id: id });
      lanzarSiError(error);
      return data === true;
    },

    async buscarCache(dominio, desde) {
      const { data, error } = await admin
        .from("analyses")
        .select("datos_brutos")
        .eq("estado", "listo")
        .not("datos_brutos", "is", null)
        .eq("dominio", dominio)
        .gte("created_at", desde.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lanzarSiError(error);
      return ((data as { datos_brutos: RawData | null } | null)?.datos_brutos ?? null) as RawData | null;
    },

    async marcarColgados(userId) {
      const { data, error } = await admin.rpc("marcar_colgados", { p_user: userId });
      lanzarSiError(error);
      return (data as number | null) ?? 0;
    },
  };
}
