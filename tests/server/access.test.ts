import { describe, expect, it } from "vitest";
import { decideAccess } from "@/lib/server/auth/access";

describe("decideAccess: rutas de login", () => {
  it.each(["/auth/callback", "/login", "/registro"])("%s es pública sin sesión", (pathname) => {
    expect(decideAccess({ pathname, configured: true, userId: null })).toBe("pass");
  });
  it("las rutas del panel siguen protegidas", () => {
    expect(decideAccess({ pathname: "/dashboard", configured: true, userId: null })).toBe("login");
  });
});
