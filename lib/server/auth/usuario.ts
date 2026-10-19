import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createUserRepo } from "@/lib/server/analyses/supabase-repo";

/** Repo y email del usuario actual; redirige a /login si no hay sesión. */
export async function sesionDelUsuario(next: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { repo: createUserRepo(supabase), email: data.user.email ?? null };
}

/** Repo del usuario actual; redirige a /login si no hay sesión. */
export async function repoDelUsuario(next: string) {
  return (await sesionDelUsuario(next)).repo;
}

/**
 * Repo del usuario actual, o null si no hay sesión. Para el layout de la app,
 * que no conoce la ruta: la redirección con el `next` correcto la hacen el proxy y cada página.
 */
export async function repoSiHaySesion() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ? createUserRepo(supabase) : null;
}
