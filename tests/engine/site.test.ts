import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fetchSite, SiteUnavailableError } from "../../lib/engine/sources/site";
import type { FetchedPage, PageGetter } from "../../lib/engine/safe-fetch";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const page = (url: string, text: string, status = 200): FetchedPage => ({ url, status, headers: {}, text });

function fakeGetter(pages: Record<string, FetchedPage>): PageGetter & { calls: string[] } {
  const calls: string[] = [];
  const get = async (url: string) => {
    calls.push(url);
    const found = pages[url];
    if (!found) return page(url, "", 404);
    return found;
  };
  return Object.assign(get, { calls });
}

describe("fetchSite", () => {
  it("descarga la home y las páginas clave y combina la información", async () => {
    const get = fakeGetter({
      "https://facturo.example/": page("https://facturo.example/", fixture("saas-home.html")),
      "https://facturo.example/precios": page("https://facturo.example/precios", fixture("saas-pricing.html")),
    });
    const site = await fetchSite("https://facturo.example/", get);

    expect(get.calls).toEqual([
      "https://facturo.example/",
      "https://facturo.example/precios",
      "https://facturo.example/blog/",
      "https://facturo.example/sobre-nosotros",
    ]);
    expect(site.pages).toHaveLength(2); // las 404 se ignoran
    expect(site.pricesFound).toEqual(["9 €", "29 €"]);
    expect(site.technologies.map((t) => t.name)).toContain("Stripe");
  });

  it("usa la URL final tras redirecciones", async () => {
    const get = fakeGetter({
      "https://facturo.example/": page("https://www.facturo.example/", fixture("shop-home.html")),
    });
    expect((await fetchSite("https://facturo.example/", get)).finalUrl).toBe("https://www.facturo.example/");
  });

  it("lanza SiteUnavailableError si la home responde con error", async () => {
    const get = fakeGetter({ "https://facturo.example/": page("https://facturo.example/", "", 503) });
    await expect(fetchSite("https://facturo.example/", get)).rejects.toBeInstanceOf(SiteUnavailableError);
  });

  it("sigue adelante si una página clave lanza un error", async () => {
    const get: PageGetter = async (url) => {
      if (url === "https://facturo.example/") return page(url, fixture("saas-home.html"));
      throw new Error("timeout");
    };
    const site = await fetchSite("https://facturo.example/", get);
    expect(site.pages).toHaveLength(1);
  });
});
