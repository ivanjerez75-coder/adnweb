import { collect, type CollectDeps } from "@/lib/engine/collect";
import type { JsonModel } from "@/lib/engine/ai/providers";
import type { RunSectionOpts } from "@/lib/engine/v3/llm";
import { buildReportV3, type SeccionClave } from "@/lib/engine/v3/report";
import type { RawData } from "@/lib/engine/types";
import type { NormalizedUrl } from "@/lib/engine/url";
import type { WorkerRepo } from "@/lib/server/analyses/repo";
import { describirFallo } from "@/lib/server/analyses/errors";

const DIA_MS = 24 * 3_600_000;

export interface RunDeps {
  worker: WorkerRepo;
  engine: CollectDeps & { models: JsonModel[]; searchModels: JsonModel[]; runOpts?: RunSectionOpts };
  now: () => Date;
}

/**
 * Ejecuta el análisis en segundo plano (informe v3). Cada sección se guarda en cuanto está lista y
 * el análisis pasa a `listo` al guardar el bloque 1 (adn). Nunca lanza: los fallos se guardan y se
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
      // Los datos de análisis antiguos (v2) no sirven para el informe v3.
      if (cached && cached.version === 3) raw = cached;
    } catch (e) {
      console.error("runAnalysis: fallo al buscar en caché, se recoge de nuevo", e);
    }

    if (!raw) {
      raw = await collect(normalized, engine, onStep);
      // Antes de generar nada: la caché de 24 h sirve aunque fallen las secciones.
      await worker.guardarDatosBrutos(id, raw);
    }

    await onStep("Analizando el negocio…");
    await buildReportV3(
      raw,
      {
        models: engine.models,
        searchModels: engine.searchModels,
        getPage: engine.getPage,
        now,
        runOpts: engine.runOpts,
      },
      async (clave: SeccionClave, contenido, estado) => {
        // buildReportV3 solo propaga el fallo de guardar adn (y las demás se ignoran).
        await worker.guardarSeccion(id, clave, contenido, estado);
        if (clave === "adn" && estado === "lista") await worker.marcarListo(id);
      },
    );
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
