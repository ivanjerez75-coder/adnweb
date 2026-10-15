import { describe, it, expect } from "vitest";
import { probePaths, SOFT_404_PATH } from "../../lib/engine/sources/paths";
import type { FetchedPage, PageGetter } from "../../lib/engine/safe-fetch";

const page = (url: string, status = 200, finalUrl = url): FetchedPage => ({ url: finalUrl, status, headers: {}, text: "" });

describe("probePaths", () => {
  it("marca las secciones que existen y las comprobadas", async () => {
    const get: PageGetter = async (url) => {
      if (url.endsWith("/blog")) return page(url);
      if (url.endsWith("/careers")) return page(url, 200, "https://www.notion.com/careers");
      if (url.endsWith("/about")) return page(url, 200, "https://notion.com/"); // redirige a la home
      return page(url, 404);
    };
    const data = await probePaths("https://notion.com/", get);
    expect(data.found).toEqual(["blog", "empleo"]);
    expect(data.checked).toEqual(["blog", "precios", "empleo"]);
  });

  it("ignora redirecciones a otro dominio", async () => {
    const get: PageGetter = async (url) => (url.endsWith("/blog") ? page(url, 200, "https://medium.com/acme") : page(url, 404));
    expect((await probePaths("https://acme.example/", get)).found).toEqual([]);
  });

  it("no da nada por comprobado si la web responde 200 a cualquier ruta", async () => {
    const get: PageGetter = async (url) => page(url, 200);
    expect(await probePaths("https://spa.example/", get)).toEqual({ found: [], checked: [] });
  });

  it("solo cuenta como comprobadas las secciones con alguna respuesta", async () => {
    const get: PageGetter = async (url) => {
      if (url.endsWith(SOFT_404_PATH)) return page(url, 404);
      if (url.endsWith("/blog")) throw new Error("timeout");
      return page(url, 404);
    };
    expect((await probePaths("https://acme.example/", get)).checked).toEqual(["precios", "empleo", "about"]);
  });

  it("lanza error si ninguna ruta responde", async () => {
    const get: PageGetter = async () => {
      throw new Error("caída");
    };
    await expect(probePaths("https://acme.example/", get)).rejects.toThrow();
  });

  it("un 403 en todas las rutas no cuenta como comprobado", async () => {
    const get: PageGetter = async (url) => (url.endsWith(SOFT_404_PATH) ? page(url, 404) : page(url, 403));
    expect(await probePaths("https://acme.example/", get)).toEqual({ found: [], checked: [] });
  });

  it("si la ruta de control responde 403 no se da nada por comprobado", async () => {
    const get: PageGetter = async (url) => (url.endsWith(SOFT_404_PATH) ? page(url, 403) : page(url, 404));
    expect(await probePaths("https://acme.example/", get)).toEqual({ found: [], checked: [] });
  });

  it("si la ruta de control falla no se da nada por comprobado", async () => {
    const get: PageGetter = async (url) => {
      if (url.endsWith(SOFT_404_PATH)) throw new Error("timeout");
      return page(url, 404);
    };
    expect(await probePaths("https://acme.example/", get)).toEqual({ found: [], checked: [] });
  });

  it("empleo no se marca como comprobado si una de sus rutas falla", async () => {
    const get: PageGetter = async (url) => {
      if (url.endsWith(SOFT_404_PATH)) return page(url, 404);
      if (url.endsWith("/careers")) return page(url, 404);
      if (url.endsWith("/jobs")) throw new Error("timeout");
      return page(url, 404);
    };
    const data = await probePaths("https://acme.example/", get);
    expect(data.found).toEqual([]);
    expect(data.checked).not.toContain("empleo");
  });

  it("una redirección a /login no cuenta como empleo", async () => {
    const get: PageGetter = async (url) => {
      if (url.endsWith("/careers")) return page(url, 200, "https://acme.example/login");
      return page(url, 404);
    };
    const data = await probePaths("https://acme.example/", get);
    expect(data.found).not.toContain("empleo");
    expect(data.checked).not.toContain("empleo");
  });

  it("una redirección de /blog a /blog/ cuenta como encontrada", async () => {
    const get: PageGetter = async (url) => {
      if (url.endsWith("/blog")) return page(url, 200, "https://acme.example/blog/");
      return page(url, 404);
    };
    expect((await probePaths("https://acme.example/", get)).found).toContain("blog");
  });
});
