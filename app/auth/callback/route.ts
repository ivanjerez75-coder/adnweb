import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { decidirCallback } from "@/lib/server/auth/callback";
import { origenDesdeCabeceras } from "@/lib/server/auth/validate";

/** Retorno de Google: intercambia el código por la sesión. Nunca responde 500. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const decision = decidirCallback({
    code: p.get("code"),
    error: p.get("error"),
    next: p.get("next"),
  });
  const origen =
    origenDesdeCabeceras(
      request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
      request.headers.get("x-forwarded-proto"),
    ) ?? request.nextUrl.origin;
  const ir = (destino: string) => NextResponse.redirect(new URL(destino, origen));

  if (decision.tipo === "error") return ir(decision.destino);
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(decision.code);
    if (error) return ir("/login?error=google");
  } catch {
    return ir("/login?error=google");
  }
  return ir(decision.destino);
}
