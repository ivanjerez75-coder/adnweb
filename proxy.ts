import { NextResponse, type NextRequest } from "next/server";
import { decideAccess } from "@/lib/server/auth/access";
import { updateSession } from "@/lib/supabase/session";

const NOT_CONFIGURED = "El servicio no está configurado.";

function withSession(out: NextResponse, session: NextResponse): NextResponse {
  session.cookies.getAll().forEach((c) => out.cookies.set(c));
  const cache = session.headers.get("cache-control");
  if (cache) out.headers.set("cache-control", cache);
  return out;
}

export async function proxy(request: NextRequest) {
  const { response, userId, configured } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  switch (decideAccess({ pathname, configured, userId })) {
    case "pass":
      return response;
    case "unauthorized-json":
      return withSession(
        NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 }),
        response,
      );
    case "unconfigured-json":
      return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
    case "unconfigured-text":
      return new NextResponse(NOT_CONFIGURED, {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    case "login": {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "";
      login.searchParams.set("next", pathname + search);
      return withSession(NextResponse.redirect(login), response);
    }
  }
}

export const config = {
  matcher: [String.raw`/((?!_next/static|_next/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)`],
};
