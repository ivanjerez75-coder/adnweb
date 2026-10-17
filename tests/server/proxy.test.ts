import { describe, expect, it } from "vitest";
import { config } from "@/proxy";
import { decideAccess } from "@/lib/server/auth/access";

const re = new RegExp(`^${config.matcher[0]}$`);

describe("matcher del proxy", () => {
  it.each(["/historialpng", "/api/analisisxpng", "/dashboard", "/"])("incluye %s", (p) =>
    expect(re.test(p)).toBe(true),
  );
  it.each(["/logo.png", "/_next/static/x.js", "/_next/image", "/favicon.ico"])("excluye %s", (p) =>
    expect(re.test(p)).toBe(false),
  );
});

describe("decideAccess", () => {
  it("deja pasar rutas públicas sin configuración", () => {
    expect(decideAccess({ pathname: "/", configured: false, userId: null })).toBe("pass");
    expect(decideAccess({ pathname: "/login", configured: false, userId: null })).toBe("pass");
  });
  it("503 en rutas protegidas sin configuración", () => {
    expect(decideAccess({ pathname: "/api/analisis", configured: false, userId: null })).toBe("unconfigured-json");
    expect(decideAccess({ pathname: "/dashboard", configured: false, userId: null })).toBe("unconfigured-text");
  });
  it("401 / login sin sesión, pass con sesión", () => {
    expect(decideAccess({ pathname: "/api/analisis", configured: true, userId: null })).toBe("unauthorized-json");
    expect(decideAccess({ pathname: "/cuenta", configured: true, userId: null })).toBe("login");
    expect(decideAccess({ pathname: "/cuenta", configured: true, userId: "u1" })).toBe("pass");
  });
});
