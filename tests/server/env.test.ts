import { describe, expect, it } from "vitest";
import { MissingEnvError, serviceRoleKey, supabaseEnv } from "@/lib/supabase/env";

describe("MissingEnvError", () => {
  it("es el error que lanzan supabaseEnv y serviceRoleKey", () => {
    expect(() => supabaseEnv({})).toThrow(MissingEnvError);
    expect(() => serviceRoleKey({})).toThrow(MissingEnvError);
  });
});

describe("supabaseEnv", () => {
  it("lanza si faltan las variables", () => {
    expect(() => supabaseEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
  it("devuelve url y anonKey", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    };
    expect(supabaseEnv(env)).toEqual({ url: "https://x.supabase.co", anonKey: "anon" });
  });
});

describe("serviceRoleKey", () => {
  it("lanza si falta", () => {
    expect(() => serviceRoleKey({})).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
  it("devuelve la clave", () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: "srv" };
    expect(serviceRoleKey(env)).toBe("srv");
  });
});
