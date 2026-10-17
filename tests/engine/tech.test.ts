import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectTech } from "../../lib/engine/sources/tech";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const names = (html: string, headers: Record<string, string> = {}) =>
  detectTech(html, headers).map((t) => t.name);

describe("detectTech", () => {
  it("detecta analítica, pagos y chat en el SaaS", () => {
    expect(names(fixture("saas-home.html"))).toEqual(
      expect.arrayContaining(["Google Analytics", "Stripe", "Intercom"]),
    );
  });

  it("detecta Shopify en la tienda", () => {
    expect(detectTech(fixture("shop-home.html"), {})).toContainEqual({ name: "Shopify", category: "ecommerce" });
  });

  it("detecta tecnologías en las cabeceras", () => {
    expect(names("", { "x-powered-by": "Next.js" })).toContain("Next.js");
  });

  it("no repite tecnologías ni inventa ninguna en una web vacía", () => {
    expect(names("<html></html>")).toEqual([]);
  });

  it("no atribuye tecnologías que solo se mencionan en el texto visible", () => {
    expect(names("<html><body><p>Usamos Klaviyo, Mixpanel y Next.js</p></body></html>")).toEqual([]);
  });
});

describe("detectTech — falsos positivos en páginas con datos incrustados", () => {
  const nextPage = `<html><head>
    <meta name="description" content="Conecta con Shopify">
    <meta property="og:description" content="Conecta con Shopify">
    <meta property="og:title" content="Integra WooCommerce">
    <script id="__NEXT_DATA__" type="application/json">{"props":{"copy":"Integración con Shopify, WooCommerce y PrestaShop","logo":"https://cdn.shopify.com/logo.png"}}</script>
    <script type="application/ld+json">{"description":"Shopify WooCommerce PrestaShop"}</script>
    <script src="/_next/static/chunks/main.js"></script>
    <script>self.__next_f.push([1,"Integración con Shopify, WooCommerce y PrestaShop https://cdn.shopify.com/logo.png"])</script>
    </head><body></body></html>`;

  it("no detecta Shopify, WooCommerce ni PrestaShop por texto de datos incrustados", () => {
    const found = names(nextPage);
    expect(found).toContain("Next.js");
    expect(found).not.toContain("Shopify");
    expect(found).not.toContain("WooCommerce");
    expect(found).not.toContain("PrestaShop");
  });

  it("detecta WooCommerce por su plugin real", () => {
    expect(names(`<link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/x.css">`)).toContain("WooCommerce");
  });

  it("detecta PrestaShop por la meta generator", () => {
    expect(names(`<meta name="generator" content="PrestaShop">`)).toContain("PrestaShop");
  });

  it("detecta Shopify por script src o por Shopify.theme inline", () => {
    expect(names(`<script src="https://cdn.shopify.com/s/x.js"></script>`)).toContain("Shopify");
    expect(names(`<script>var Shopify = Shopify || {}; Shopify.shop = "a.myshopify.com";</script>`)).toContain("Shopify");
  });
});
