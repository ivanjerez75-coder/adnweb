import type { PageGetter } from "@/lib/engine/safe-fetch";
import type { UserRepo, WorkerRepo } from "@/lib/server/analyses/repo";
import { MAX_URL, startAnalysis } from "@/lib/server/analyses/start";
import { runAnalysis, type RunDeps } from "@/lib/server/analyses/run";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HandlerDeps {
  user: () => Promise<{ userId: string; repo: UserRepo } | null>;
  worker: WorkerRepo;
  getPage: PageGetter;
  engine: RunDeps["engine"];
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

export function createHandlers(deps: HandlerDeps) {
  return {
    async crear(req: Request): Promise<Response> {
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
      await deps.worker.marcarColgados(sesion.userId);

      const r = await startAnalysis(url, { user: sesion.repo, getPage: deps.getPage });
      if (!r.ok) return json({ error: r.mensaje }, r.status);

      const { id, normalized } = r;
      deps.schedule(() =>
        runAnalysis(id, normalized, { worker: deps.worker, engine: deps.engine, now: deps.now }),
      );
      return json({ id }, 202);
    },

    async estado(id: string): Promise<Response> {
      const sesion = await deps.user();
      if (!sesion) return json({ error: "Inicia sesión para continuar." }, 401);
      if (!UUID.test(id)) return json({ error: "No encontrado." }, 404);

      await deps.worker.marcarColgados(sesion.userId);
      const a = await sesion.repo.obtener(id);
      if (!a) return json({ error: "No encontrado." }, 404);
      return json({
        id: a.id,
        estado: a.estado,
        pasoActual: a.pasoActual,
        error: a.error,
        informe: a.informe,
      });
    },
  };
}
