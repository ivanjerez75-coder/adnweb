"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { destinoTrasLogin, validarCredenciales } from "@/lib/server/auth/validate";

export type AuthState = { error?: string; info?: string } | undefined;

function campo(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

export async function registrar(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = campo(formData, "email").trim();
  const password = campo(formData, "password");
  const nombre = campo(formData, "nombre").trim();
  const invalido = validarCredenciales(email, password);
  if (invalido) return { error: invalido };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre } },
  });
  if (error) return { error: "No se ha podido crear la cuenta. Inténtalo de nuevo." };
  if (!data.session) return { info: "Revisa tu email para confirmar la cuenta." };

  redirect(destinoTrasLogin(campo(formData, "next"), campo(formData, "url")));
}

export async function iniciarSesion(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = campo(formData, "email").trim();
  const password = campo(formData, "password");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email o contraseña incorrectos." };

  redirect(destinoTrasLogin(campo(formData, "next"), campo(formData, "url")));
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
