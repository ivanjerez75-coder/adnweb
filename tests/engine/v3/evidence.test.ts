import { describe, it, expect } from "vitest";
import { buildEvidence, citar } from "../../../lib/engine/v3/evidence";
import { makeRaw, makeSite, ps } from "../raw-fixture";
import type { Signal } from "../../../lib/engine/types";

const signal: Signal = { id: "sin_blog", family: "contenido", source: "web", label: "No tiene blog", polarity: "negativa" };
const paginas = [
  { id: "p1", url: "https://facturo.example/", titulo: "Inicio", tieneDescripcion: true, extractos: [{ id: "p1-e1", cita: "  Facturas en 1 minuto. " }, { id: "p1-e2", cita: "Sin permanencia" }] },
];

describe("buildEvidence", () => {
  it("incluye extractos (texto intacto, fuente = url), señales y datos existentes", () => {
    const raw = makeRaw({
      paginas,
      wikidata: { id: "Q1", description: null, inception: 2015, founders: [], headquarters: "Madrid", employees: 40, employeesYear: 2024, revenue: null },
    });
    const reg = buildEvidence(raw, [signal]);
    const e = reg.get("p1-e1")!;
    expect(e).toMatchObject({ tipo: "pagina", texto: "  Facturas en 1 minuto. ", url: "https://facturo.example/", fuente: "https://facturo.example/" });
    expect(reg.get("sin_blog")).toMatchObject({ tipo: "senal", texto: "No tiene blog", fuente: "web" });
    expect(reg.get("dato:fundacion")?.tipo).toBe("dato");
    expect(reg.get("dato:fundacion")?.texto).toContain("2015");
    expect(reg.get("dato:empleados")?.texto).toContain("40");
    expect(reg.get("dato:sede")?.texto).toContain("Madrid");
    expect(reg.get("dato:fundacion")?.fuente).toBe("wikidata");
  });

  it("los datos solo aparecen si el valor existe", () => {
    const vacio = buildEvidence(makeRaw({ tranco: null, radar: null, site: null, pagespeed: null }), []);
    expect([...vacio.keys()].filter((k) => k.startsWith("dato:"))).toEqual([]);
    const lleno = buildEvidence(
      makeRaw({
        empleo: { platform: "lever", token: "x", openings: 7, byArea: {}, linkedFromSite: true },
        appstore: { name: "Facturo", rating: 4.5, ratingCount: 10, url: "https://apps.apple.com/x", linkedFromSite: true },
        dns: { emailProvider: "Google Workspace", tools: [] },
        sitemap: { urlCount: 120, sections: [], languages: ["fr"], lastModified: null, recentBlogPosts: 0, complete: true, candidatas: [] },
      }),
      [],
    );
    for (const k of ["empleo", "app", "email", "trafico", "paginas_sitemap", "idiomas"]) expect(lleno.has(`dato:${k}`)).toBe(true);
    expect(lleno.get("dato:idiomas")?.texto).toContain("fr");
    expect(lleno.has("dato:fundacion")).toBe(false);
  });
});

describe("buildEvidence: datos v3.1", () => {
  const ids = (reg: Map<string, unknown>) => [...reg.keys()].filter((k) => k.startsWith("dato:"));

  it("sin legal, JSON-LD, PageSpeed ni precios no hay ids nuevos", () => {
    const reg = buildEvidence(makeRaw({ legal: null, pagespeed: null, site: makeSite({ pricesFound: [], jsonLdOrg: null, languages: [] }), tranco: null, radar: null }), []);
    expect(ids(reg)).toEqual([]);
  });

  it("legal, JSON-LD, PageSpeed, CrUX y precios aparecen cuando existen", () => {
    const reg = buildEvidence(
      makeRaw({
        legal: {
          avisoLegal: "https://facturo.example/aviso-legal", privacidad: "https://facturo.example/privacidad", cookies: null, condiciones: null,
          cif: "B12345674", razonSocial: "Facturo SL", email: "hola@facturo.example", telefono: null, direccion: null,
          fuentes: { cif: "https://facturo.example/aviso-legal", razonSocial: "https://facturo.example/aviso-legal", email: "https://facturo.example/contacto" },
        },
        pagespeed: { ...ps(80, 90), campo: { fuente: "origen", lcpMs: 2400, inpMs: 180, cls: 0.05, categoria: "FAST" } },
        site: makeSite({ pricesFound: ["29 €/mes", "290 €/año"], jsonLdOrg: { name: "Facturo", legalName: "Facturo SL" } }),
      }),
      [],
    );
    expect(reg.get("dato:cif")?.texto).toContain("B12345674");
    expect(reg.get("dato:cif")?.url).toBe("https://facturo.example/aviso-legal");
    expect(reg.get("dato:razon_social")?.texto).toContain("Facturo SL");
    expect(reg.has("dato:aviso_legal")).toBe(true);
    expect(reg.has("dato:privacidad")).toBe(true);
    expect(reg.has("dato:cookies")).toBe(false);
    expect(reg.get("dato:contacto")?.texto).toContain("hola@facturo.example");
    expect(reg.has("dato:jsonld_org")).toBe(true);
    expect(reg.get("dato:pagespeed")?.texto).toMatch(/80/);
    expect(reg.get("dato:crux")?.texto).toMatch(/2400/);
    expect(reg.get("dato:precio:1")).toMatchObject({ tipo: "dato", texto: expect.stringContaining("29 €/mes") });
    expect(reg.get("dato:precio:1")?.url).toMatch(/^https:/);
    expect(reg.has("dato:precio:2")).toBe(true);
    expect(reg.has("dato:precio:3")).toBe(false);
  });

  it("PageSpeed parcial (móvil falla): dato:pagespeed con el escritorio", () => {
    const reg = buildEvidence(makeRaw({ pagespeed: { ...ps(null, 92), error: "móvil no disponible: x" } }), []);
    expect(reg.get("dato:pagespeed")?.texto).toBe("PageSpeed (sobre 100): escritorio 92");
  });
  it("PageSpeed con error no genera dato:pagespeed", () => {
    const reg = buildEvidence(makeRaw({ pagespeed: { ...ps(null, null), error: "cuota" } }), []);
    expect(reg.has("dato:pagespeed")).toBe(false);
    expect(reg.has("dato:crux")).toBe(false);
  });
});

describe("citar", () => {
  const reg = buildEvidence(makeRaw({ paginas }), [signal]);

  it("descarta ids desconocidos", () => {
    expect(citar(["p1-e1", "nope"], reg)?.map((e) => e.id)).toEqual(["p1-e1"]);
    expect(citar(["nope"], reg)).toBeNull();
  });
  it("requierePagina devuelve null si solo quedan señales", () => {
    expect(citar(["sin_blog"], reg, { requierePagina: true })).toBeNull();
    expect(citar(["sin_blog", "p1-e2"], reg, { requierePagina: true })).toHaveLength(2);
  });
  it("minimo exige esa cantidad de ids válidos", () => {
    expect(citar(["p1-e1", "nope"], reg, { minimo: 2 })).toBeNull();
    expect(citar(["p1-e1", "sin_blog"], reg, { minimo: 2 })).toHaveLength(2);
  });
});
