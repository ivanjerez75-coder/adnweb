import "server-only";
import { after } from "next/server";
import { depsFromEnv } from "@/lib/engine/analyze";
import { searchModelsFromEnv } from "@/lib/engine/v3/llm";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { createHandlers } from "@/lib/server/analyses/handlers";
import type { WorkerRepo } from "@/lib/server/analyses/repo";
import type { RunDeps } from "@/lib/server/analyses/run";
import { createUserRepo, createWorkerRepo } from "@/lib/server/analyses/supabase-repo";

/**
 * Handlers con las dependencias reales (sesión de Supabase, service role, motor).
 * El cliente admin y el motor se construyen solo en el camino que los usa.
 */
export function createProdHandlers() {
  let worker: WorkerRepo | undefined;
  let engine: RunDeps["engine"] | undefined;
  return createHandlers({
    user: async () => {
      const supabase = await createServerSupabase();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return { userId: data.user.id, repo: createUserRepo(supabase) };
    },
    worker: () => (worker ??= createWorkerRepo(createAdminSupabase())),
    engine: () => (engine ??= { ...depsFromEnv(), searchModels: searchModelsFromEnv({ GEMINI_API_KEY: process.env.GEMINI_API_KEY, GEMINI_MODELS: process.env.GEMINI_MODELS, GEMINI_MODEL: process.env.GEMINI_MODEL }) }),
    schedule: (task) => after(task),
    now: () => new Date(),
  });
}
