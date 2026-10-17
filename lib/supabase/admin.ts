import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseEnv } from "./env";

/** Cliente con service role: salta RLS. Solo para código de servidor. */
export function createAdminSupabase(): SupabaseClient {
  const { url } = supabaseEnv();
  return createClient(url, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
