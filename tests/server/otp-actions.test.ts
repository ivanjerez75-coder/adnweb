import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  host: "localhost:3100" as string | null,
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => (k === "host" ? sb.host : k === "x-forwarded-proto" ? "http" : null),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: {
      signInWithOtp: sb.signInWithOtp,
      verifyOtp: sb.verifyOtp,
      signInWithOAuth: sb.signInWithOAuth,
    },
  }),
}));

import { entrarConGoogle, enviarCodigo, verificarCodigo } from "@/app/(auth)/actions";

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

beforeEach(() => {
  sb.signInWithOtp.mockReset();
  sb.verifyOtp.mockReset();
  sb.signInWithOAuth.mockReset();
  sb.host = "localhost:3100";
});

describe("enviarCodigo", () => {
  it("rechaza un email inválido sin llamar a Supabase", async () => {
    const r = await enviarCodigo(undefined, form({ email: "nope" }));
    expect(r?.error).toBe("Introduce un email válido.");
    expect(sb.signInWithOtp).not.toHaveBeenCalled();
  });
  it("pide el código con shouldCreateUser y pasa al paso 2", async () => {
    sb.signInWithOtp.mockResolvedValue({ error: null });
    const r = await enviarCodigo(undefined, form({ email: " a@b.com " }));
    expect(sb.signInWithOtp).toHaveBeenCalledWith({
      email: "a@b.com",
      options: { shouldCreateUser: true },
    });
    expect(r).toEqual({ paso: "codigo", email: "a@b.com" });
  });
  it("mapea el límite de envíos a español", async () => {
    sb.signInWithOtp.mockResolvedValue({ error: { status: 429, code: "over_email_send_rate_limit" } });
    const r = await enviarCodigo(undefined, form({ email: "a@b.com" }));
    expect(r?.error).toBe("Has pedido demasiados códigos. Espera unos minutos.");
  });
  it("al reenviar con error se queda en el paso 2", async () => {
    sb.signInWithOtp.mockResolvedValue({ error: { status: 500 } });
    const r = await enviarCodigo(undefined, form({ email: "a@b.com", accion: "reenviar" }));
    expect(r).toMatchObject({ paso: "codigo", email: "a@b.com" });
    expect(r?.error).toBeTruthy();
  });
});

describe("verificarCodigo", () => {
  it("código mal escrito: error claro y sigue en el paso 2", async () => {
    const r = await verificarCodigo(undefined, form({ email: "a@b.com", codigo: "12ab" }));
    expect(r).toMatchObject({ paso: "codigo", email: "a@b.com" });
    expect(r?.error).toBeTruthy();
    expect(sb.verifyOtp).not.toHaveBeenCalled();
  });
  it("código incorrecto o caducado: mensaje y sigue en el paso 2", async () => {
    sb.verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const r = await verificarCodigo(undefined, form({ email: "a@b.com", codigo: "123456" }));
    expect(r).toEqual({ paso: "codigo", email: "a@b.com", error: "El código no es correcto o ha caducado." });
  });
  it("éxito: redirige al panel con la URL de la landing", async () => {
    sb.verifyOtp.mockResolvedValue({ error: null });
    await expect(
      verificarCodigo(undefined, form({ email: "a@b.com", codigo: "123456", url: "canva.com" })),
    ).rejects.toThrow("REDIRECT:/dashboard?url=canva.com");
    expect(sb.verifyOtp).toHaveBeenCalledWith({ email: "a@b.com", token: "123456", type: "email" });
  });
  it("éxito: un next externo no produce redirección abierta", async () => {
    sb.verifyOtp.mockResolvedValue({ error: null });
    await expect(
      verificarCodigo(undefined, form({ email: "a@b.com", codigo: "123456", next: "https://evil.com" })),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });
});

describe("entrarConGoogle", () => {
  it("redirige a Google con el callback del propio origen y la URL conservada", async () => {
    sb.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/x" }, error: null });
    await expect(entrarConGoogle(form({ url: "canva.com" }))).rejects.toThrow(
      "REDIRECT:https://accounts.google.com/x",
    );
    expect(sb.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `http://localhost:3100/auth/callback?next=${encodeURIComponent("/dashboard?url=canva.com")}`,
      },
    });
  });
  it("no usa un next externo", async () => {
    sb.signInWithOAuth.mockResolvedValue({ data: { url: "https://g/x" }, error: null });
    await expect(entrarConGoogle(form({ next: "https://evil.com" }))).rejects.toThrow("REDIRECT:https://g/x");
    expect(sb.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe(
      `http://localhost:3100/auth/callback?next=${encodeURIComponent("/dashboard")}`,
    );
  });
  it("si falla, vuelve a /login con error", async () => {
    sb.signInWithOAuth.mockResolvedValue({ data: null, error: { message: "x" } });
    await expect(entrarConGoogle(form({}))).rejects.toThrow("REDIRECT:/login?error=google");
  });
  it("sin host fiable no llama a Supabase", async () => {
    sb.host = null;
    await expect(entrarConGoogle(form({}))).rejects.toThrow("REDIRECT:/login?error=google");
    expect(sb.signInWithOAuth).not.toHaveBeenCalled();
  });
});
