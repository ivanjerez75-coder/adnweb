"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function empezar(formData: FormData): Promise<void> {
  const v = formData.get("url");
  const url = typeof v === "string" ? v.trim() : "";
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const destino = data.user ? "/dashboard" : "/login";
  redirect(url ? `${destino}?url=${encodeURIComponent(url)}` : destino);
}
