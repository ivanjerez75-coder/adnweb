import { collect, type CollectDeps } from "@/lib/engine/collect";
import type { JsonModel } from "@/lib/engine/ai/providers";
import type { RunSectionOpts } from "@/lib/engine/v3/llm";
import { buildReportV4, type SeccionClaveV4 } from "@/lib/engine/v3/report";
import type { RawData } from "@/lib/engine/types";
import type { NormalizedUrl } from "@/lib/engine/url";
import type { WorkerRepo } from "@/lib/server/analyses/repo";
import { describirFallo } from "@/lib/server/analyses/errors";

const DIA_MS = 24 * 3_600_000;

/**
 * Unos datos en caché solo se reutilizan si son v3 (las filas v2 llegan sin version), tienen el campo
 * legal (v3.1) y se recogieron hace menos de 24 h. La fila puede ser reciente aunque los datos no:
 * la caché encadena, así que manda raw.collectedAt.
 */
export function cacheFresca(raw: RawData | null | undefined, ahora: Date): raw is RawData {
  if (!raw || raw.version !== 3 || !("legal" in raw)) return false;
  const t = Date.parse(raw.collectedAt);
  return Number.isFinite(t) && t >= ahora.getTime() - DIA_MS;
}

/** La fila ya está en su estado final (p. ej. marcada como colgada): se aborta sin fallar ni devolver otra vez. */
class FilaFinalError extends Error {}

export interface RunDeps {
  worker: WorkerRepo;
  engine: CollectDeps & { models: JsonModel[]; searchModels: JsonModel[]; runOpts?: RunSectionOpts };
  now: () => Date;
}

/**
 * Ejecuta el análisis en segundo plano (informe v4). Cada sección se guarda en cuanto está lista y
 * el análisis pasa a `listo` al guardar el bloque 1 (anatomia). Nunca lanza: los fallos se guardan y se
 * devuelve el crédito.
 */
export async function runAnalysis(id: string, normalized: NormalizedUrl, deps: RunDeps): Promise<void> {
  const { worker, now } = deps;
  // Un solo reloj: deps.now para la ventana de caché y para el motor.
  const engine = { ...deps.engine, now };
  // Un fallo al guardar el progreso no debe romper el análisis.
  const onStep = async (texto: string) => {
    try {
      await worker.paso(id, texto);
    } catch (e) {
      console.error("runAnalysis: no se pudo guardar el paso", e);
    }
  };

  try {
    let raw: RawData | null = null;
    try {
      const cached = await worker.buscarCache(normalized.domain, new Date(now().getTime() - DIA_MS));
      if (cacheFresca(cached, now())) raw = cached;
    } catch (e) {
      console.error("runAnalysis: fallo al buscar en caché, se recoge de nuevo", e);
    }

    if (!raw) raw = await collect(normalized, engine, onStep);
    // Antes de generar nada y en ambas ramas: así la caché de 24 h encadena y sirve aunque fallen las secciones.
    await worker.guardarDatosBrutos(id, raw);

    await onStep("Analizando el negocio…");
    // buildReportV4 ignora los fallos de onSection salvo en anatomia: este indicador evita seguir guardando.
    let abortado = false;
    await buildReportV4(
      raw,
      {
        models: engine.models,
        searchModels: engine.searchModels,
        getPage: engine.getPage,
        now,
        runOpts: engine.runOpts,
      },
      async (clave: SeccionClaveV4, contenido, estado) => {
        // buildReportV4 solo propaga el fallo de guardar anatomia (y las demás se ignoran).
        if (abortado) throw new FilaFinalError();
        const guardada = await worker.guardarSeccion(id, clave, contenido, estado);
        if (!guardada) {
          abortado = true;
          throw new FilaFinalError();
        }
        if (clave === "anatomia" && estado === "lista") await worker.marcarListo(id);
      },
    );
  } catch (e) {
    if (e instanceof FilaFinalError) return;
    const { mensaje, kind } = describirFallo(e);
    try {
      await worker.fallar(id, mensaje, kind);
    } catch (e2) {
      console.error("runAnalysis: no se pudo marcar el fallo", e2);
    }
    try {
      await worker.devolverCredito(id);
    } catch (e3) {
      console.error("runAnalysis: no se pudo devolver el crédito", e3);
    }
  }
}
