import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

/** Refresca la sesión en el proxy y devuelve el id del usuario (o null). */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; userId: string | null; configured: boolean }> {
  let response = NextResponse.next({ request });
  let env: { url: string; anonKey: string };
  try {
    env = supabaseEnv();
  } catch {
    return { response, userId: null, configured: false };
  }
  const { url, anonKey } = env;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return { response, userId: typeof sub === "string" ? sub : null, configured: true };
}
