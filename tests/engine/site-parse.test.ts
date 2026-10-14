import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parsePage, pickKeyPages, buildSiteData } from "../../lib/engine/sources/site-parse";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const HOME = "https://facturo.example/";

describe("parsePage", () => {
  const parsed = parsePage(fixture("saas-home.html"), HOME);

  it("extrae título, descripción y encabezados", () => {
    expect(parsed.page.title).toBe("Facturo — Facturación online para autónomos");
    expect(parsed.page.description).toBe("Crea y envía facturas en segundos.");
    expect(parsed.page.headings).toContain("Empieza gratis, sin tarjeta");
  });

  it("detecta idiomas sin incluir x-default", () => {
    expect(parsed.lang).toBe("es");
    expect(parsed.hreflangs).toEqual(["es", "en"]);
  });

  it("detecta redes, apps, CTAs y datos estructurados", () => {
    expect(parsed.socialLinks).toEqual({
      x: "https://twitter.com/facturo",
      linkedin: "https://www.linkedin.com/company/facturo",
    });
    expect(parsed.hasAppLinks).toBe(true);
    expect(parsed.ctas).toEqual(expect.arrayContaining(["Empieza gratis", "Pide una demo"]));
    expect(parsed.jsonLdTypes).toEqual(["SoftwareApplication"]);
  });

  it("detecta testimonios y plan gratuito en el texto", () => {
    expect(parsed.mentionsTestimonials).toBe(true);
    expect(parsed.mentionsFreeOrTrial).toBe(true);
  });

  it("convierte los enlaces en absolutos e ignora mailto", () => {
    expect(parsed.links).toContain("https://facturo.example/precios");
    expect(parsed.links.some((l) => l.startsWith("mailto:"))).toBe(false);
  });

  it("no incluye el contenido de los scripts en el texto", () => {
    expect(parsed.page.text).not.toContain("intercomSettings");
  });

  it("detecta precios", () => {
    expect(parsePage(fixture("saas-pricing.html"), `${HOME}precios`).prices).toEqual(["9 €", "29 €"]);
    expect(parsePage(fixture("shop-home.html"), "https://zapas.example/").prices).toEqual(["€59,99", "€79,99"]);
  });

  it.each([
    ["Plan Pro: 1.299 € al año", ["1.299 €"]],
    ["Enterprise $1,299.00 per year", ["$1,299.00"]],
    ["Desde 12.000 € por proyecto", ["12.000 €"]],
    ["Básico 29,99 € o 1299 EUR", ["29,99 €", "1299 EUR"]],
    ["Antes 1.299,00 € ahora", ["1.299,00 €"]],
  ])("detecta precios con separador de miles: %s", (text, prices) => {
    expect(parsePage(`<html><body><p>${text}</p></body></html>`, HOME).prices).toEqual(prices);
  });

  it("no corta un precio con miles por la mitad", () => {
    const prices = parsePage("<html><body><p>Total 1.299 € y 12.000 €</p></body></html>", HOME).prices;
    expect(prices).not.toContain("299 €");
    expect(prices).not.toContain("000 €");
  });

  it("devuelve texto casi vacío para webs hechas solo con JavaScript", () => {
    const js = parsePage(fixture("js-only.html"), "https://app.example/");
    expect(js.textLength).toBeLessThan(50);
    expect(js.lang).toBeNull();
  });
});

describe("parsePage: falsos positivos", () => {
  const page = (body: string) => parsePage(`<html><body>${body}</body></html>`, HOME);

  it("no confunde freelance ni envío gratis con plan gratuito", () => {
    expect(page("<p>Somos freelance. Envío gratis y free shipping.</p>").mentionsFreeOrTrial).toBe(false);
  });

  it("no toma palabras que contienen un verbo de acción como CTA", () => {
    const p = page('<a href="/a">Facebook</a><button>Industry</button><a href="/b">Startups</a>');
    expect(p.ctas).toEqual([]);
  });
});

describe("pickKeyPages", () => {
  it("elige páginas clave del mismo dominio, una por tipo", () => {
    const links = [
      "https://facturo.example/precios",
      "https://facturo.example/blog/",
      "https://facturo.example/blog/post-1",
      "https://facturo.example/sobre-nosotros",
      "https://otra-web.example/precios",
      "https://facturo.example/registro",
      "https://www.facturo.example/pricing",
    ];
    expect(pickKeyPages(links, HOME)).toEqual([
      "https://facturo.example/precios",
      "https://facturo.example/blog/",
      "https://facturo.example/sobre-nosotros",
    ]);
  });

  it("respeta el máximo", () => {
    const links = ["/precios", "/blog", "/about", "/producto", "/features", "/empresa"].map(
      (p) => `https://facturo.example${p}`,
    );
    expect(pickKeyPages(links, HOME, 2)).toHaveLength(2);
  });
});

describe("buildSiteData", () => {
  it("agrega la información de varias páginas", () => {
    const home = parsePage(fixture("saas-home.html"), HOME);
    const pricing = parsePage(fixture("saas-pricing.html"), `${HOME}precios`);
    const site = buildSiteData(HOME, [home, pricing], [{ name: "Stripe", category: "pagos" }]);

    expect(site.finalUrl).toBe(HOME);
    expect(site.pages).toHaveLength(2);
    expect(site.pricesFound).toEqual(["9 €", "29 €"]);
    expect(site.hasPricingPage).toBe(true);
    expect(site.hasBlog).toBe(true);
    expect(site.languages).toEqual(["es", "en"]);
    expect(site.hasFreePlanOrTrial).toBe(true);
    expect(site.hasTestimonials).toBe(true);
    expect(site.hasAppLinks).toBe(true);
    expect(site.technologies).toEqual([{ name: "Stripe", category: "pagos" }]);
    expect(site.textLength).toBe(home.textLength + pricing.textLength);
  });

  it("no cuenta enlaces externos como página de precios o blog", () => {
    const home = parsePage(
      '<html><body><a href="https://otra.example/precios">P</a><a href="https://otra.example/blog/">B</a></body></html>',
      HOME,
    );
    const site = buildSiteData(HOME, [home], []);
    expect(site.hasPricingPage).toBe(false);
    expect(site.hasBlog).toBe(false);
  });

  it("acepta blog y precios en subdominios del propio sitio", () => {
    const home = parsePage(
      '<html><body><a href="https://blog.facturo.example/">B</a><a href="https://app.facturo.example/pricing">P</a></body></html>',
      "https://www.facturo.example/",
    );
    const site = buildSiteData("https://www.facturo.example/", [home], []);
    expect(site.hasBlog).toBe(true);
    expect(site.hasPricingPage).toBe(true);
  });

  it("no confunde un dominio que solo termina igual con un subdominio", () => {
    const home = parsePage(
      '<html><body><a href="https://blog.notfacturo.example/">B</a><a href="https://blog.otra.example/">B</a></body></html>',
      HOME,
    );
    expect(buildSiteData(HOME, [home], []).hasBlog).toBe(false);
  });
});
