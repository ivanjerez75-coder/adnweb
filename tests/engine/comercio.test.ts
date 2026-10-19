import { describe, it, expect } from "vitest";
import { extractComercio, extractLocal, horarioTexto } from "../../lib/engine/sources/comercio";
import { summarizeSitemap } from "../../lib/engine/sources/sitemap";
import type { SitemapData } from "../../lib/engine/types";
import { makeSite } from "./raw-fixture";

const home = makeSite({ finalUrl: "https://tienda.example/", pages: [], technologies: [{ name: "Stripe", category: "pagos" }] });
const html = (body: string, head = "") => `<html><head>${head}</head><body>${body}</body></html>`;

describe("extractComercio", () => {
  it("detecta los enlaces propios de envíos y devoluciones (texto o ruta), no los de otro dominio", () => {
    const pages = new Map([
      [
        "https://tienda.example/",
        html(`<footer>
          <a href="https://otra.example/envios">Envíos</a>
          <a href="/info/gastos-de-envio">Gastos de envío</a>
          <a href="/politica-de-devoluciones">Cambios</a>
        </footer>`),
      ],
    ]);
    const c = extractComercio(home, null, pages, null);
    expect(c.envios).toBe("https://tienda.example/info/gastos-de-envio");
    expect(c.devoluciones).toBe("https://tienda.example/politica-de-devoluciones");
    expect(c.catalogoAprox).toBeNull();
  });

  it("envíos en catalán o inglés por el texto del enlace", () => {
    const pages = new Map([["https://tienda.example/", html(`<a href="/a">Enviaments</a><a href="/b">Returns</a>`)]]);
    const c = extractComercio(home, null, pages, null);
    expect(c.envios).toBe("https://tienda.example/a");
    expect(c.devoluciones).toBe("https://tienda.example/b");
  });

  it("medios de pago del texto, los alt de los logos y las tecnologías, sin repetir", () => {
    const pages = new Map([
      [
        "https://tienda.example/",
        html(`<p>Paga con Visa, VISA o PayPal. También Bizum y contra reembolso.</p><img src="x.png" alt="Mastercard"><p>Transferencia de conocimiento</p>`),
      ],
    ]);
    const c = extractComercio(home, null, pages, null);
    expect(c.pagos).toEqual(["Visa", "Mastercard", "PayPal", "Bizum", "Stripe", "Contra reembolso"]);
  });

  it("catalogoAprox: URLs del sitemap con ruta de producto; null sin sitemap", () => {
    const urls = ["/producto/a", "/producto/b", "/products/c", "/tienda/d", "/blog/x", "/tienda/", "/p/z"].map((p) => ({
      loc: `https://tienda.example${p}`,
      lastmod: null,
      hreflangs: [],
    }));
    const sm: SitemapData = summarizeSitemap(urls, new Date("2026-10-19"), true, "tienda.example");
    expect(sm.productos).toBe(5);
    expect(extractComercio(home, null, new Map(), sm).catalogoAprox).toBe(5);
    expect(extractComercio(home, null, new Map(), null).catalogoAprox).toBeNull();
  });
});

describe("extractLocal", () => {
  it("horario desde JSON-LD openingHoursSpecification", () => {
    const ld = JSON.stringify({
      "@type": "LocalBusiness",
      openingHoursSpecification: [
        { dayOfWeek: ["https://schema.org/Monday", "Tuesday"], opens: "09:00", closes: "14:00:00" },
        { dayOfWeek: "Saturday", opens: "10:00", closes: "13:00" },
      ],
    });
    const pages = new Map([["https://tienda.example/", html("<p>Hola</p>", `<script type="application/ld+json">${ld}</script>`)]]);
    expect(extractLocal(home, null, pages).horario).toBe("Lun, Mar 09:00-14:00; Sáb 10:00-13:00");
  });

  it("horario desde JSON-LD openingHours (texto)", () => {
    const ld = JSON.stringify({ "@graph": [{ "@type": "Store", openingHours: ["Mo-Fr 09:00-18:00", "Sa 10:00-14:00"] }] });
    const pages = new Map([["https://tienda.example/", html("", `<script type="application/ld+json">${ld}</script>`)]]);
    expect(extractLocal(home, null, pages).horario).toBe("Lun-Vie 09:00-18:00; Sáb 10:00-14:00");
  });

  it("horario desde una línea 'Horario:' de la página de contacto, con tope de 120 caracteres", () => {
    const pages = new Map([
      ["https://tienda.example/", html("<p>Bienvenidos</p>")],
      ["https://tienda.example/contacto", html(`<p>Horario: de lunes a viernes de 9:00 a 14:00 ${"y más ".repeat(40)}</p>`)],
    ]);
    const h = extractLocal(home, null, pages).horario!;
    expect(h.startsWith("de lunes a viernes de 9:00 a 14:00")).toBe(true);
    expect(h.length).toBeLessThanOrEqual(120);
  });

  it("sin horario: null; 'Horario:' sin horas ni días no cuenta", () => {
    expect(horarioTexto("Horario: consúltanos")).toBeNull();
    expect(extractLocal(home, null, new Map([["https://tienda.example/", html("<p>Nada</p>")]])).horario).toBeNull();
  });
});
