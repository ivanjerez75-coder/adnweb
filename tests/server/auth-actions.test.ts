import { describe, expect, it } from "vitest";
import { destinoTrasLogin, validarCredenciales } from "@/lib/server/auth/validate";

describe("validarCredenciales", () => {
  it("rechaza un email inválido", () => {
    expect(validarCredenciales("no-es-email", "12345678")).toBe("Introduce un email válido.");
    expect(validarCredenciales("", "12345678")).toBe("Introduce un email válido.");
  });
  it("rechaza contraseñas de menos de 8 caracteres", () => {
    expect(validarCredenciales("a@b.com", "1234567")).toBe(
      "La contraseña debe tener al menos 8 caracteres.",
    );
  });
  it("acepta datos válidos", () => {
    expect(validarCredenciales("a@b.com", "12345678")).toBeNull();
  });
});

describe("destinoTrasLogin", () => {
  it("ignora next externo", () => {
    expect(destinoTrasLogin("https://evil.com", null)).toBe("/dashboard");
  });
  it("lleva la url al dashboard", () => {
    expect(destinoTrasLogin(null, "notion.so")).toBe("/dashboard?url=notion.so");
  });
  it("respeta un next interno", () => {
    expect(destinoTrasLogin("/historial", null)).toBe("/historial");
  });
  it("codifica la url", () => {
    expect(destinoTrasLogin(null, "a b&c")).toBe("/dashboard?url=a%20b%26c");
  });
});
