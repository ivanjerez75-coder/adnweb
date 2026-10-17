import { collect, type CollectDeps } from "@/lib/engine/collect";
import { buildReport, type Report } from "@/lib/engine/report";
import type { JsonModel } from "@/lib/engine/ai/providers";
import type { RawData } from "@/lib/engine/types";
import type { NormalizedUrl } from "@/lib/engine/url";
import type { WorkerRepo } from "@/lib/server/analyses/repo";
import { describirFallo } from "@/lib/server/analyses/errors";

const DIA_MS = 24 * 3_600_000;

export interface RunDeps {
  worker: WorkerRepo;
  engine: CollectDeps & { models: JsonModel[] };
  now: () => Date;
}

/** Ejecuta el análisis en segundo plano. Nunca lanza: los fallos se guardan y se devuelve el crédito. */
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
    let cached: RawData | null = null;
    try {
      cached = await worker.buscarCache(normalized.domain, new Date(now().getTime() - DIA_MS));
    } catch (e) {
      console.error("runAnalysis: fallo al buscar en caché, se recoge de nuevo", e);
    }

    let raw: RawData | null = null;
    let informe: Report | null = null;
    if (cached) {
      try {
        await onStep("Analizando tráfico y presencia…");
        informe = await buildReport(cached, { models: engine.models, now }, onStep);
        raw = cached;
      } catch (e) {
        console.error("runAnalysis: datos en caché inservibles, se recoge de nuevo", e);
      }
    }
    if (!raw || !informe) {
      raw = await collect(normalized, engine, onStep);
      informe = await buildReport(raw, { models: engine.models, now }, onStep);
    }
    await worker.completar(id, raw, informe);
  } catch (e) {
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
