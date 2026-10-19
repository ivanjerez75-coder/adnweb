import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.user } }) },
  }),
}));

import { empezar } from "@/app/landing-actions";

function form(url?: string): FormData {
  const f = new FormData();
  if (url !== undefined) f.set("url", url);
  return f;
}

describe("empezar (landing)", () => {
  beforeEach(() => {
    estado.user = null;
  });

  it("sin sesión lleva al registro conservando la URL", async () => {
    await expect(empezar(form("  canva.com "))).rejects.toThrow(
      "REDIRECT:/registro?url=canva.com",
    );
  });

  it("con sesión va directo al panel con la URL", async () => {
    estado.user = { id: "u1" };
    await expect(empezar(form("notion.so"))).rejects.toThrow(
      "REDIRECT:/dashboard?url=notion.so",
    );
  });

  it("codifica la URL y omite el parámetro si viene vacía", async () => {
    await expect(empezar(form("a b&c"))).rejects.toThrow(
      "REDIRECT:/registro?url=a%20b%26c",
    );
    await expect(empezar(form("   "))).rejects.toThrow(/REDIRECT:\/registro$/);
  });
});
