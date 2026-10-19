import { describe, expect, it } from "vitest";
import { decidirCallback } from "@/lib/server/auth/callback";

describe("decidirCallback", () => {
  it("con código y next interno intercambia y conserva el destino", () => {
    expect(decidirCallback({ code: "abc", next: "/dashboard?url=x" })).toEqual({
      tipo: "intercambiar",
      code: "abc",
      destino: "/dashboard?url=x",
    });
  });
  it("next externo cae a /dashboard", () => {
    expect(decidirCallback({ code: "abc", next: "https://evil.com" })).toMatchObject({
      tipo: "intercambiar",
      destino: "/dashboard",
    });
    expect(decidirCallback({ code: "abc", next: "//evil.com" })).toMatchObject({ destino: "/dashboard" });
  });
  it("sin next va a /dashboard", () => {
    expect(decidirCallback({ code: "abc" })).toMatchObject({ destino: "/dashboard" });
  });
  it("sin código vuelve a /login con error", () => {
    expect(decidirCallback({ next: "/dashboard" })).toEqual({ tipo: "error", destino: "/login?error=google" });
  });
  it("si Google devuelve error (cancelado) vuelve a /login aunque haya código", () => {
    expect(decidirCallback({ code: "abc", error: "access_denied" })).toEqual({
      tipo: "error",
      destino: "/login?error=google",
    });
  });
});
