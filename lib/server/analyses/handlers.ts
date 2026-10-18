import type { UserRepo, WorkerRepo } from "@/lib/server/analyses/repo";
import { MAX_URL, startAnalysis } from "@/lib/server/analyses/start";
import { runAnalysis, type RunDeps } from "@/lib/server/analyses/run";
import { MissingEnvError } from "@/lib/supabase/env";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HandlerDeps {
  user: () => Promise<{ userId: string; repo: UserRepo } | null>;
  /** Se construye solo cuando hace falta (cliente con service role). */
  worker: () => WorkerRepo;
  /** Se construye solo cuando hace falta (motor de análisis). */
  engine: () => RunDeps["engine"];
  schedule: (task: () => Promise<void>) => void;
  now: () => Date;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Sin cabecera Origin se permite; si la hay, su host debe ser el de la petición. */
function origenPermitido(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  const host = (req.headers.get("host") ?? new URL(req.url).host).toLowerCase();
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // p. ej. "null"
  }
}

/** Si faltan variables de entorno, 503 con JSON en lugar de un 500 vacío. */
async function conServicio(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MissingEnvError) {
      console.error("API de análisis:", error.message);
      return json({ error: "El servicio no está configurado." }, 503);
    }
    throw error;
  }
}

export function createHandlers(deps: HandlerDeps) {
  return {
    crear: (req: Request): Promise<Response> =>
      conServicio(async () => {
        if (!origenPermitido(req)) return json({ error: "Origen no permitido." }, 403);

        const sesion = await deps.user();
        if (!sesion) return json({ error: "Inicia sesión para continuar." }, 401);

        let url: unknown;
        try {
          url = ((await req.json()) as { url?: unknown } | null)?.url;
        } catch {
          url = undefined;
        }
        if (typeof url !== "string" || url.length > MAX_URL) {
          return json({ error: "La URL no es válida." }, 400);
        }

        // Un análisis colgado no debe bloquear uno nuevo.
        const worker = deps.worker();
        await worker.marcarColgados(sesion.userId);

        const engine = deps.engine();
        const r = await startAnalysis(url, { user: sesion.repo, getPage: engine.getPage });
        if (!r.ok) return json({ error: r.mensaje }, r.status);

        const { id, normalized } = r;
        deps.schedule(() => runAnalysis(id, normalized, { worker, engine, now: deps.now }));
        return json({ id }, 202);
      }),

    estado: (id: string): Promise<Response> =>
      conServicio(async () => {
        const sesion = await deps.user();
        if (!sesion) return json({ error: "Inicia sesión para continuar." }, 401);
        if (!UUID.test(id)) return json({ error: "No encontrado." }, 404);

        await deps.worker().marcarColgados(sesion.userId);
        const a = await sesion.repo.obtener(id);
        if (!a) return json({ error: "No encontrado." }, 404);
        return json({
          id: a.id,
          estado: a.estado,
          pasoActual: a.pasoActual,
          error: a.error,
          informe: a.informe,
          version: a.version,
          secciones: a.secciones,
        });
      }),
  };
}
