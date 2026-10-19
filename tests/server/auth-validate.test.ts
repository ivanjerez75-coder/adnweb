import { describe, expect, it } from "vitest";
import {
  destinoTrasLogin,
  origenDesdeCabeceras,
  validarCodigo,
  validarEmail,
} from "@/lib/server/auth/validate";

describe("validarEmail", () => {
  it("rechaza emails inválidos", () => {
    expect(validarEmail("no-es-email")).toBe("Introduce un email válido.");
    expect(validarEmail("")).toBe("Introduce un email válido.");
  });
  it("acepta un email válido", () => {
    expect(validarEmail(" a@b.com ")).toBeNull();
  });
});

describe("validarCodigo", () => {
  it("acepta 6 dígitos", () => expect(validarCodigo("123456")).toBeNull());
  it.each(["12345", "abcdef", "1234567", ""])("rechaza %j", (c) =>
    expect(validarCodigo(c)).not.toBeNull(),
  );
});

describe("origenDesdeCabeceras", () => {
  it("usa host y proto", () => {
    expect(origenDesdeCabeceras("adnweb.com", "https")).toBe("https://adnweb.com");
    expect(origenDesdeCabeceras("localhost:3100", null)).toBe("http://localhost:3100");
  });
  it("por defecto https fuera de localhost", () => {
    expect(origenDesdeCabeceras("adnweb.com", null)).toBe("https://adnweb.com");
  });
  it("rechaza hosts raros", () => {
    expect(origenDesdeCabeceras("evil.com/x@y", "https")).toBeNull();
    expect(origenDesdeCabeceras(null, "https")).toBeNull();
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
