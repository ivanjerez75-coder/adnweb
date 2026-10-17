import { describe, expect, it } from "vitest";
import { isProtectedPath, safeNext } from "@/lib/server/auth/redirect";

describe("isProtectedPath", () => {
  it.each(["/dashboard", "/analisis/abc", "/historial", "/cuenta", "/api/analisis"])(
    "protege %s",
    (p) => expect(isProtectedPath(p)).toBe(true),
  );
  it.each(["/", "/login", "/registro", "/api/health"])("no protege %s", (p) =>
    expect(isProtectedPath(p)).toBe(false),
  );
});

describe("safeNext", () => {
  it("acepta rutas internas", () => {
    expect(safeNext("/analisis/1")).toBe("/analisis/1");
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", null, "", "javascript:alert(1)"])(
    "rechaza %s",
    (v) => expect(safeNext(v)).toBe("/dashboard"),
  );
});
