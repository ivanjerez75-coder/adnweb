import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createUserRepo } from "@/lib/server/analyses/supabase-repo";

/** Repo del usuario actual; redirige a /login si no hay sesión. */
export async function repoDelUsuario(next: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return createUserRepo(supabase);
}
