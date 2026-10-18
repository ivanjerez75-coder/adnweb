import { describe, it, expect } from "vitest";
import { extractLegal, validarCifNif } from "../../lib/engine/sources/legal";
import { makeSite } from "./raw-fixture";

const LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE";
const nifOk = (n: number) => `${String(n).padStart(8, "0")}${LETRAS[n % 23]}`;
function cifOk(letra: string, siete: string, comoLetra = false) {
  let suma = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(siete[i]);
    if (i % 2 === 0) {
      const x = d * 2;
      suma += Math.floor(x / 10) + (x % 10);
    } else suma += d;
  }
  const c = (10 - (suma % 10)) % 10;
  return `${letra}${siete}${comoLetra ? "JABCDEFGHI"[c] : c}`;
}

describe("validarCifNif", () => {
  it("valida CIF con dígito de control", () => {
    expect(validarCifNif("B12345674")).toBe(true);
    expect(validarCifNif(cifOk("A", "5822361"))).toBe(true);
    expect(validarCifNif(cifOk("B", "0123456"))).toBe(true);
  });
  it("valida CIF con letra de control", () => {
    expect(validarCifNif(cifOk("Q", "2826000", true))).toBe(true);
    expect(validarCifNif(cifOk("G", "8123456", true))).toBe(true);
  });
  it("rechaza control erróneo, formato raro y vacío", () => {
    expect(validarCifNif("B12345675")).toBe(false);
    expect(validarCifNif("12345678A")).toBe(false);
    expect(validarCifNif(cifOk("Q", "2826000", false))).toBe(false); // Q exige letra
    expect(validarCifNif("hola")).toBe(false);
    expect(validarCifNif("")).toBe(false);
  });
  it("valida NIF y NIE", () => {
    expect(validarCifNif("12345678Z")).toBe(true);
    expect(validarCifNif(nifOk(87654321))).toBe(true);
    const nie = (l: string, d: string) => `${l}${d}${LETRAS[Number(`${"XYZ".indexOf(l)}${d}`) % 23]}`;
    expect(validarCifNif(nie("X", "1234567"))).toBe(true);
    expect(validarCifNif(nie("Z", "7654321"))).toBe(true);
    expect(validarCifNif("X1234567A")).toBe(false);
  });
  it("tolera guiones, puntos, espacios y minúsculas", () => {
    expect(validarCifNif("b-12345674")).toBe(true);
    expect(validarCifNif("12.345.678-Z")).toBe(true);
  });
});

const HOME = "https://facturo.example/";
const home = makeSite({ finalUrl: HOME, jsonLdOrg: null });

describe("extractLegal", () => {
  const html = `<html><body><main>Hola</main><footer>
    <a href="/aviso-legal">Aviso legal</a>
    <a href="/politica-de-privacidad">Política de privacidad</a>
    <a href="/cookies">Cookies</a>
    <a href="/terms">Términos</a>
    <a href="mailto:hola@facturo.example?subject=x">Escríbenos</a>
    <a href="tel:+34911222333">Llámanos</a>
    <p>Facturo Soluciones, S.L. - CIF: B-12345674 - Domicilio: Calle Mayor 1, 28013 Madrid.</p>
  </footer></body></html>`;

  it("encuentra enlaces legales, CIF válido, razón social, email y teléfono", () => {
    const l = extractLegal(home, null, new Map([[HOME, html]]));
    expect(l.avisoLegal).toBe("https://facturo.example/aviso-legal");
    expect(l.privacidad).toBe("https://facturo.example/politica-de-privacidad");
    expect(l.cookies).toBe("https://facturo.example/cookies");
    expect(l.condiciones).toBe("https://facturo.example/terms");
    expect(l.cif).toBe("B12345674");
    expect(l.razonSocial).toBe("Facturo Soluciones, S.L.");
    expect(l.email).toBe("hola@facturo.example");
    expect(l.telefono).toBe("+34911222333");
    expect(l.direccion).toContain("Calle Mayor 1");
    expect(l.fuentes.cif).toBe(HOME);
    expect(l.fuentes.avisoLegal).toBe(HOME);
  });

  it("detecta enlaces por el texto aunque la ruta no lo diga", () => {
    const h = `<a href="/p/1">Aviso Legal</a><a href="/p/2">Privacy Policy</a><a href="/p/3">Condiciones de uso</a><a href="/p/4">Política de cookies</a>`;
    const l = extractLegal(home, null, new Map([[HOME, h]]));
    expect(l).toMatchObject({
      avisoLegal: "https://facturo.example/p/1",
      privacidad: "https://facturo.example/p/2",
      condiciones: "https://facturo.example/p/3",
      cookies: "https://facturo.example/p/4",
    });
  });

  it("ignora CIF inválido y no inventa nada", () => {
    const l = extractLegal(home, null, new Map([[HOME, `<footer>CIF: B12345675</footer>`]]));
    expect(l.cif).toBeNull();
    expect(l.razonSocial).toBeNull();
    expect(l.email).toBeNull();
    expect(l.fuentes).toEqual({});
  });

  it("razón social de fundaciones y asociaciones, y datos de otras páginas", () => {
    const l = extractLegal(
      home,
      null,
      new Map([
        [HOME, "<p>Hola</p>"],
        ["https://facturo.example/aviso-legal", "<p>Titular: Fundación Ayuda Mutua. NIF 12345678Z</p>"],
      ]),
    );
    expect(l.razonSocial).toBe("Fundación Ayuda Mutua");
    expect(l.cif).toBe("12345678Z");
    expect(l.fuentes.cif).toBe("https://facturo.example/aviso-legal");
    const a = extractLegal(home, null, new Map([[HOME, `<p>Asociación Vecinal Norte · CIF ${cifOk("G", "8123456", true)}</p>`]]));
    expect(a.razonSocial).toBe("Asociación Vecinal Norte");
  });

  it("usa JSON-LD como respaldo de razón social y dirección", () => {
    const site = makeSite({ finalUrl: HOME, jsonLdOrg: { legalName: "Facturo Global S.A.", address: "Gran Vía 5, Madrid" } });
    const l = extractLegal(site, null, new Map([[HOME, "<p>Hola</p>"]]));
    expect(l.razonSocial).toBe("Facturo Global S.A.");
    expect(l.direccion).toBe("Gran Vía 5, Madrid");
  });

  it("sin datos devuelve todo null", () => {
    expect(extractLegal(null, null, new Map())).toEqual({
      avisoLegal: null, privacidad: null, cookies: null, condiciones: null, cif: null,
      razonSocial: null, email: null, telefono: null, direccion: null, fuentes: {},
    });
  });
});
