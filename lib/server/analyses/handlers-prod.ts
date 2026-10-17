import "server-only";
import { after } from "next/server";
import { depsFromEnv } from "@/lib/engine/analyze";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { createHandlers } from "@/lib/server/analyses/handlers";
import { createUserRepo, createWorkerRepo } from "@/lib/server/analyses/supabase-repo";

/** Handlers con las dependencias reales (sesión de Supabase, service role, motor). */
export function createProdHandlers() {
  const engine = depsFromEnv();
  return createHandlers({
    user: async () => {
      const supabase = await createServerSupabase();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return { userId: data.user.id, repo: createUserRepo(supabase) };
    },
    worker: createWorkerRepo(createAdminSupabase()),
    getPage: engine.getPage,
    engine,
    schedule: (task) => after(task),
    now: () => new Date(),
  });
}
