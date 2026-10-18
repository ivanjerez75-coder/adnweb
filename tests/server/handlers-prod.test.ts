import { beforeEach, describe, expect, it, vi } from "vitest";
import { serviceRoleKey, supabaseEnv } from "@/lib/supabase/env";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));

const mocks = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  createAdminSupabase: vi.fn(),
  depsFromEnv: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: mocks.createServerSupabase }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: mocks.createAdminSupabase }));
vi.mock("@/lib/engine/analyze", () => ({ depsFromEnv: mocks.depsFromEnv }));

import { createProdHandlers } from "@/lib/server/analyses/handlers-prod";

const sinUsuario = {
  auth: { getUser: async () => ({ data: { user: null }, error: null }) },
};
const conUsuario = {
  auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
};

const post = () =>
  new Request("http://x/api/analisis", { method: "POST", body: JSON.stringify({ url: "a.example" }) });

describe("createProdHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("construirlo no crea el cliente admin ni el motor", () => {
    createProdHandlers();
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
    expect(mocks.depsFromEnv).not.toHaveBeenCalled();
    expect(mocks.createServerSupabase).not.toHaveBeenCalled();
  });

  it("sin sesión: 401 sin crear el cliente admin ni el motor", async () => {
    mocks.createServerSupabase.mockResolvedValue(sinUsuario);
    const h = createProdHandlers();
    expect((await h.crear(post())).status).toBe(401);
    expect((await h.estado(crypto.randomUUID())).status).toBe(401);
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
    expect(mocks.depsFromEnv).not.toHaveBeenCalled();
  });

  it("faltan las variables públicas de Supabase: 503 JSON", async () => {
    mocks.createServerSupabase.mockImplementation(async () => supabaseEnv({}));
    const h = createProdHandlers();
    for (const res of [await h.crear(post()), await h.estado(crypto.randomUUID())]) {
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "El servicio no está configurado." });
    }
  });

  it("falta la service role: 503 JSON", async () => {
    mocks.createServerSupabase.mockResolvedValue(conUsuario);
    mocks.createAdminSupabase.mockImplementation(() => serviceRoleKey({}));
    const res = await createProdHandlers().estado(crypto.randomUUID());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "El servicio no está configurado." });
  });
});
