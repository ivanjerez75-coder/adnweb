"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  destinoTrasLogin,
  origenDelSitio,
  validarCodigo,
  validarEmail,
} from "@/lib/server/auth/validate";

export type AuthState =
  | { paso?: "codigo"; email?: string; error?: string; info?: string }
  | undefined;

function campo(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function esLimite(error: { status?: number; code?: string; message?: string }): boolean {
  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit" ||
    /rate limit/i.test(error.message ?? "")
  );
}

/** Origen de la web: NEXT_PUBLIC_SITE_URL; sin ella (desarrollo), las cabeceras. Nunca datos del usuario. */
async function origenPeticion(): Promise<string | null> {
  const h = await headers();
  return origenDelSitio(h);
}

/** Paso 1: envía el código por email (crea la cuenta si no existe). */
export async function enviarCodigo(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = campo(formData, "email").trim();
  const invalido = validarEmail(email);
  if (invalido) return { error: invalido };

  // Sin SMTP propio, Supabase manda su email por defecto con un enlace: el enlace vuelve a
  // /auth/callback, que abre la sesión y lleva al destino. Con SMTP propio, el email trae el código.
  const destino = destinoTrasLogin(campo(formData, "next"), campo(formData, "url"));
  const origen = await origenPeticion();
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      ...(origen ? { emailRedirectTo: `${origen}/auth/callback?next=${encodeURIComponent(destino)}` } : {}),
    },
  });
  if (error) {
    const mensaje = esLimite(error) ? t("auth.errorLimite") : t("auth.errorEnvio");
    // Si ya estaba en el paso 2 (reenviar), se queda ahí.
    return campo(formData, "accion") === "reenviar"
      ? { paso: "codigo", email, error: mensaje }
      : { error: mensaje };
  }
  const reenvio = campo(formData, "accion") === "reenviar";
  return { paso: "codigo", email, ...(reenvio ? { info: t("auth.reenviado") } : {}) };
}

/** Paso 2: comprueba el código y entra. */
export async function verificarCodigo(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = campo(formData, "email").trim();
  const token = campo(formData, "codigo").trim();
  const invalido = validarCodigo(token);
  if (invalido) return { paso: "codigo", email, error: invalido };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { paso: "codigo", email, error: t("auth.errorCodigo") };

  redirect(destinoTrasLogin(campo(formData, "next"), campo(formData, "url")));
}

/** Google: redirige al proveedor. El origen sale de las cabeceras, nunca del usuario. */
export async function entrarConGoogle(formData: FormData): Promise<void> {
  const destino = destinoTrasLogin(campo(formData, "next"), campo(formData, "url"));
  const origen = await origenPeticion();
  if (!origen) redirect("/login?error=google");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origen}/auth/callback?next=${encodeURIComponent(destino)}` },
  });
  if (error || !data?.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
