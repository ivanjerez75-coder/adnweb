import { describe, it, expect, vi, afterEach } from "vitest";
import { extractPassages, fetchPages, selectPages } from "../../lib/engine/sources/pages";
import type { FetchedPage, PageGetter } from "../../lib/engine/safe-fetch";
import type { SitemapData } from "../../lib/engine/types";
import { makeSite } from "./raw-fixture";

const sitemap = (candidatas: string[]): SitemapData => ({
  urlCount: candidatas.length, sections: [], languages: [], lastModified: null, recentBlogPosts: 0, complete: true, candidatas,
});
const ok = (url: string, text: string, status = 200): FetchedPage => ({ url, status, headers: {}, text });

describe("extractPassages", () => {
  const html = `<html><body>
    <nav><p>Navegación que no debe salir en ningún caso jamás.</p></nav>
    <main>
      <h1>Facturación para autónomos</h1>
      <p>Facturo ayuda a más de 5.000 autónomos a emitir facturas en menos de un minuto.</p>
      <p>Facturo ayuda a más de 5.000 autónomos a emitir facturas en menos de un minuto.</p>
      <p>Corto.</p>
      <script>var x = "Texto de script que no debe aparecer en los extractos";</script>
      <style>.a { content: "Texto de estilo que tampoco debe aparecer nunca"; }</style>
      <ul><li>Plan Pro con facturas ilimitadas y soporte prioritario por chat.</li></ul>
    </main>
    <footer><p>Copyright Facturo SL todos los derechos reservados 2026.</p></footer>
  </body></html>`;

  it("devuelve frases literales de main, sin nav/footer/script/style, sin duplicados ni fragmentos cortos", () => {
    expect(extractPassages(html)).toEqual([
      "Facturo ayuda a más de 5.000 autónomos a emitir facturas en menos de un minuto.",
      "Plan Pro con facturas ilimitadas y soporte prioritario por chat.",
    ]);
  });

  it("parte los párrafos largos en frases de 200 caracteres como máximo", () => {
    const long = "Primera frase con contenido suficiente para ser citada. " + "Segunda frase igualmente larga y literal para la cita. ".repeat(6);
    const out = extractPassages(`<body><p>${long}</p></body>`);
    expect(out.length).toBeGreaterThan(1);
    for (const p of out) expect(p.length).toBeLessThanOrEqual(200);
    expect(out[0]).toBe("Primera frase con contenido suficiente para ser citada.");
  });

  it("conserva el texto de un hero dentro de header y descarta los enlaces de nav", () => {
    const out = extractPassages(`<body><header><nav><a href="/x">Enlace de navegación largo del menú</a><p>Menú de navegación dentro del nav largo.</p></nav>
      <h1>Facturación sencilla para autónomos y pymes</h1><p>Emite y cobra tus facturas en menos de un minuto.</p></header></body>`);
    expect(out).toEqual(["Facturación sencilla para autónomos y pymes", "Emite y cobra tus facturas en menos de un minuto."]);
  });

  it("usa body si no hay main y limita el resultado a 25", () => {
    const body = Array.from({ length: 40 }, (_, i) => `<p>Párrafo número ${i} con texto suficiente para pasar el filtro.</p>`).join("");
    expect(extractPassages(`<body>${body}</body>`)).toHaveLength(25);
    expect(extractPassages(`<body>${body}</body>`, 5)).toHaveLength(5);
  });
});

describe("selectPages", () => {
  const home = makeSite({ finalUrl: "https://acme.example/", pages: [
    { url: "https://acme.example/", title: "", description: "", headings: [], text: "" },
    { url: "https://acme.example/precios", title: "", description: "", headings: [], text: "" },
  ] });

  it("incluye siempre la home, la primera", () => {
    expect(selectPages(home, null)[0]).toBe("https://acme.example/");
  });

  it("prefiere secciones de negocio (también tras un idioma) sobre el resto, sin duplicados ni otros dominios", () => {
    const urls = selectPages(home, sitemap([
      "https://acme.example/blog/post-1",
      "https://acme.example/es/servicios",
      "https://acme.example/precios/",
      "https://acme.example/quienes-somos",
      "https://otra.example/servicios",
      "https://www.acme.example/contact",
      "https://acme.example/careers",
    ]));
    expect(urls).toEqual([
      "https://acme.example/",
      "https://acme.example/precios",
      "https://acme.example/es/servicios",
      "https://acme.example/quienes-somos",
      "https://www.acme.example/contact",
      "https://acme.example/careers",
    ]);
  });

  it("limita a max", () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://acme.example/servicios/s${i}`);
    expect(selectPages(home, sitemap(many))).toHaveLength(15);
    expect(selectPages(home, sitemap(many), 4)).toHaveLength(4);
  });
});

describe("fetchPages", () => {
  afterEach(() => vi.useRealTimers());

  it("asigna ids secuenciales, omite fallos y 4xx y numera los extractos", async () => {
    const get: PageGetter = async (url) => {
      if (url.endsWith("/boom")) throw new Error("red");
      if (url.endsWith("/nope")) return ok(url, "<body><p>Página que no existe en realidad.</p></body>", 404);
      return ok(url, `<html><head><title>T ${url}</title></head><body><main><p>Texto literal de ${url} suficientemente largo.</p></main></body></html>`);
    };
    const docs = await fetchPages(
      ["https://a.example/", "https://a.example/boom", "https://a.example/nope", "https://a.example/x"],
      get,
      { timeoutMs: 1000 },
    );
    expect(docs.map((d) => d.id)).toEqual(["p1", "p2"]);
    expect(docs[1].url).toBe("https://a.example/x");
    expect(docs[1].titulo).toBe("T https://a.example/x");
    expect(docs[1].extractos).toEqual([{ id: "p2-e1", cita: "Texto literal de https://a.example/x suficientemente largo." }]);
  });

  it("marca tieneDescripcion solo con meta description no vacía", async () => {
    const get: PageGetter = async (url) =>
      ok(url, url.endsWith("/con")
        ? '<head><meta name="description" content="Algo"></head><body></body>'
        : '<head><meta name="description" content="  "></head><body></body>');
    const docs = await fetchPages(["https://a.example/con", "https://a.example/sin"], get, { timeoutMs: 1000 });
    expect(docs.map((d) => d.tieneDescripcion)).toEqual([true, false]);
  });

  it("descarta las páginas que acaban en otro dominio tras una redirección", async () => {
    const get: PageGetter = async (url) =>
      ok(url.endsWith("/go") ? "https://otra.example/landing" : url, "<body><p>Contenido suficientemente largo para citar.</p></body>");
    const docs = await fetchPages(["https://a.example/", "https://a.example/go", "https://www.a.example/b"], get, { timeoutMs: 1000 });
    expect(docs.map((d) => [d.id, d.url])).toEqual([["p1", "https://a.example/"], ["p2", "https://www.a.example/b"]]);
  });

  it("deja de esperar en timeoutMs y devuelve lo terminado", async () => {
    vi.useFakeTimers();
    const get: PageGetter = (url) =>
      url.endsWith("/slow")
        ? new Promise<FetchedPage>(() => {})
        : Promise.resolve(ok(url, "<body><p>Contenido rápido y suficientemente largo.</p></body>"));
    const promise = fetchPages(["https://a.example/", "https://a.example/slow"], get, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    const docs = await promise;
    expect(docs.map((d) => d.url)).toEqual(["https://a.example/"]);
  });
});

describe("selectPages con el menú de la portada", () => {
  it("lee las páginas del menú (en cualquier idioma) antes que las noticias del sitemap", () => {
    const home = makeSite({
      finalUrl: "https://teb.example/",
      pages: [{ url: "https://teb.example/", title: "", description: "", headings: [], text: "" }],
      navLinks: [
        "https://teb.example/qui-som/",
        "https://teb.example/el-que-fem/",
        "https://teb.example/serveis-per-a-empreses/",
        "https://teb.example/blog/",
        "https://teb.example/2024/05/noticia/",
        "https://teb.example/memoria.pdf",
        "https://otra.example/socis/",
      ],
    });
    const urls = selectPages(home, sitemap(["https://teb.example/dia-de-la-dona/", "https://teb.example/les-primeres-vacunes/"]));
    expect(urls.slice(0, 4)).toEqual([
      "https://teb.example/",
      "https://teb.example/qui-som",
      "https://teb.example/serveis-per-a-empreses",
      "https://teb.example/el-que-fem",
    ]);
    expect(urls).not.toContain("https://teb.example/blog");
    expect(urls).not.toContain("https://teb.example/memoria.pdf");
    expect(urls).not.toContain("https://teb.example/dia-de-la-dona");
  });
});
