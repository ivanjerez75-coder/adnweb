import { describe, it, expect } from "vitest";
import { parseSitemapXml, sitemapsFromRobots, summarizeSitemap, fetchSitemap } from "../../lib/engine/sources/sitemap";
import type { FetchedPage, PageGetter } from "../../lib/engine/safe-fetch";

const NOW = new Date("2026-10-15T00:00:00Z");
const page = (url: string, text: string, status = 200): FetchedPage => ({ url, status, headers: {}, text });

const URLSET = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc>https://acme.example/</loc><lastmod>2026-10-01</lastmod><xhtml:link rel="alternate" hreflang="fr" href="https://acme.example/fr/"/></url>
<url><loc>https://acme.example/blog/post-1?a=1&amp;b=2</loc><lastmod>2026-09-20T10:00:00+00:00</lastmod></url>
<url><loc>https://acme.example/blog/post-2</loc><lastmod>2026-05-01</lastmod></url>
<url><loc>https://acme.example/es/precios</loc></url>
<url><loc>https://acme.example/careers</loc><lastmod>2030-01-01</lastmod></url>
<url><loc>https://acme.example/go/app</loc></url>
</urlset>`;

describe("parseSitemapXml", () => {
  it("lee un urlset con loc, lastmod y hreflang", () => {
    const parsed = parseSitemapXml(URLSET);
    expect(parsed.kind).toBe("urlset");
    expect(parsed.urls).toHaveLength(6);
    expect(parsed.urls[0]).toEqual({ loc: "https://acme.example/", lastmod: "2026-10-01", hreflangs: ["fr"] });
    expect(parsed.urls[1].loc).toBe("https://acme.example/blog/post-1?a=1&b=2");
  });

  it("lee un índice de sitemaps", () => {
    const xml = `<sitemapindex><sitemap><loc>https://acme.example/s1.xml</loc></sitemap><sitemap><loc>https://acme.example/s2.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemapXml(xml)).toEqual({ kind: "index", children: ["https://acme.example/s1.xml", "https://acme.example/s2.xml"], urls: [] });
  });
});

describe("sitemapsFromRobots", () => {
  it("extrae TODAS las líneas Sitemap http(s) válidas, sin tope y sin duplicados", () => {
    const robots = "User-agent: *\nDisallow: /x\nSitemap: https://acme.example/a.xml\nsitemap: /b.xml\nSitemap: ftp://x/c.xml\nSitemap: https://acme.example/d.xml\nSitemap: https://acme.example/e.xml\nSitemap: https://acme.example/a.xml";
    expect(sitemapsFromRobots(robots, "https://acme.example")).toEqual([
      "https://acme.example/a.xml",
      "https://acme.example/b.xml",
      "https://acme.example/d.xml",
      "https://acme.example/e.xml",
    ]);
  });
});

describe("summarizeSitemap", () => {
  it("cuenta URLs, secciones, idiomas, última fecha y blog reciente", () => {
    expect(summarizeSitemap(parseSitemapXml(URLSET).urls, NOW)).toEqual({
      urlCount: 6,
      sections: ["blog", "precios", "empleo"],
      languages: ["es", "fr"],
      lastModified: "2026-10-01",
      recentBlogPosts: 1,
      complete: true,
    });
  });

  const sectionsOf = (...paths: string[]) =>
    summarizeSitemap(paths.map((p) => ({ loc: `https://acme.example${p}`, lastmod: null, hreflangs: [] })), NOW).sections;

  it("/blog/pricing-tips es solo blog", () => {
    expect(sectionsOf("/blog/pricing-tips")).toEqual(["blog"]);
  });

  it("/help/pricing es solo ayuda", () => {
    expect(sectionsOf("/help/pricing")).toEqual(["ayuda"]);
  });

  it("/es/precios es precios", () => {
    expect(sectionsOf("/es/precios")).toEqual(["precios"]);
  });

  it("/blogs/journal/post (Shopify) es blog", () => {
    expect(sectionsOf("/blogs/journal/post-1")).toEqual(["blog"]);
  });

  it("no cuenta una sección en el tercer segmento", () => {
    expect(sectionsOf("/products/x/pricing", "/a/b/blog")).toEqual([]);
  });

  it("un sitemap sin URLs no es completo", () => {
    expect(summarizeSitemap([], NOW).complete).toBe(false);
  });
});

describe("fetchSitemap", () => {
  const getter = (pages: Record<string, FetchedPage>): PageGetter & { calls: string[] } => {
    const calls: string[] = [];
    return Object.assign(
      async (url: string) => {
        calls.push(url);
        return pages[url] ?? page(url, "", 404);
      },
      { calls },
    );
  };

  it("sigue robots → índice → hijos", async () => {
    const get = getter({
      "https://acme.example/robots.txt": page("https://acme.example/robots.txt", "Sitemap: https://acme.example/index.xml"),
      "https://acme.example/index.xml": page("https://acme.example/index.xml", `<sitemapindex><sitemap><loc>https://acme.example/a.xml</loc></sitemap></sitemapindex>`),
      "https://acme.example/a.xml": page("https://acme.example/a.xml", URLSET),
    });
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(data?.urlCount).toBe(6);
  });

  it("usa /sitemap.xml si robots no declara sitemaps", async () => {
    const get = getter({ "https://acme.example/sitemap.xml": page("https://acme.example/sitemap.xml", URLSET) });
    expect((await fetchSitemap("https://acme.example/page", get, NOW))?.urlCount).toBe(6);
  });

  it("no entra en bucle con un índice que se referencia a sí mismo y limita a 4 archivos", async () => {
    const index = (n: number) => `<sitemapindex><sitemap><loc>https://acme.example/i${n}.xml</loc></sitemap><sitemap><loc>https://acme.example/i0.xml</loc></sitemap></sitemapindex>`;
    const pages: Record<string, FetchedPage> = { "https://acme.example/robots.txt": page("https://acme.example/robots.txt", "Sitemap: https://acme.example/i0.xml") };
    for (let n = 0; n < 10; n++) pages[`https://acme.example/i${n}.xml`] = page(`https://acme.example/i${n}.xml`, index(n + 1));
    const get = getter(pages);
    await fetchSitemap("https://acme.example/", get, NOW);
    expect(get.calls.filter((c) => c.endsWith(".xml"))).toHaveLength(4);
  });

  it("devuelve null si no hay sitemap", async () => {
    expect(await fetchSitemap("https://acme.example/", getter({}), NOW)).toBeNull();
  });

  it("lanza error si todas las peticiones fallan", async () => {
    const get: PageGetter = async () => {
      throw new Error("timeout");
    };
    await expect(fetchSitemap("https://acme.example/", get, NOW)).rejects.toThrow();
  });
});

describe("XML tolerante", () => {
  it("lee CDATA, prefijos de espacio de nombres y decodifica entidades", () => {
    const xml = `<?xml version="1.0"?><ns:urlset xmlns:ns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      `<ns:url><ns:loc><![CDATA[https://acme.example/a?x=1&y=2]]></ns:loc><ns:lastmod>2026-10-02</ns:lastmod></ns:url>` +
      `<url><loc>https://acme.example/it&apos;s-here</loc></url>` +
      `<url><loc>https://acme.example/n?a=&#65;&#x42;&quot;&lt;&gt;</loc></url>` +
      `</ns:urlset>`;
    const parsed = parseSitemapXml(xml);
    expect(parsed.urls.map((u) => u.loc)).toEqual([
      "https://acme.example/a?x=1&y=2",
      "https://acme.example/it's-here",
      'https://acme.example/n?a=AB"<>',
    ]);
    expect(parsed.urls[0].lastmod).toBe("2026-10-02");
  });

  it("acepta etiquetas con atributos y espacios antes del cierre", () => {
    const urlset = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ><url foo="bar"> <loc >https://acme.example/attr</loc >  <lastmod  >2026-10-03</lastmod></url></urlset>`;
    expect(parseSitemapXml(urlset).urls).toEqual([{ loc: "https://acme.example/attr", lastmod: "2026-10-03", hreflangs: [] }]);

    const index = `<sitemapindex xmlns="x" ><sitemap id="1"><loc>https://acme.example/s9.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemapXml(index)).toEqual({ kind: "index", children: ["https://acme.example/s9.xml"], urls: [] });
  });

  it("corta la lectura al límite pedido sin construir todas las URLs", () => {
    const xml = `<urlset>${Array.from({ length: 10 }, (_, i) => `<url><loc>https://acme.example/p/${i}</loc></url>`).join("")}</urlset>`;
    expect(parseSitemapXml(xml, 5).urls).toHaveLength(5);
  });
});

describe("idiomas en la ruta", () => {
  it("cuenta solo segmentos completos de idioma", () => {
    const urls = ["/es/", "/en-us/", "/pt-br/", "/no-te-pierdas", "/it-services", "/id-card"].map((p) => ({
      loc: `https://acme.example${p}`,
      lastmod: null,
      hreflangs: [],
    }));
    expect(summarizeSitemap(urls, NOW).languages).toEqual(["en", "es", "pt"]);
  });
});

describe("límites de tamaño y de URLs", () => {
  const getterFor = (pages: Record<string, FetchedPage>): PageGetter => async (url: string) => pages[url] ?? page(url, "", 404);

  const bigSitemap = (prefix: string, n: number) => {
    const pad = "x".repeat(120);
    const body = Array.from({ length: n }, (_, i) => `<url><loc>https://acme.example/${prefix}/${i}</loc><!-- ${pad} --></url>`).join("");
    return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
  };

  it("tope duro de 5 MB: el segundo archivo no se parsea ni se cuenta", async () => {
    const a = bigSitemap("p", 20000);
    const b = bigSitemap("q", 20000);
    expect(a.length + b.length).toBeGreaterThan(5_000_000);
    const get = getterFor({
      "https://acme.example/robots.txt": page("https://acme.example/robots.txt", "Sitemap: https://acme.example/a.xml\nSitemap: https://acme.example/b.xml"),
      "https://acme.example/a.xml": page("https://acme.example/a.xml", a),
      "https://acme.example/b.xml": page("https://acme.example/b.xml", b),
    });
    expect((await fetchSitemap("https://acme.example/", get, NOW))?.urlCount).toBe(20000);
  });

  it("tope de 50 000 URLs", async () => {
    const xml = `<urlset>${Array.from({ length: 50010 }, (_, i) => `<url><loc>https://acme.example/n/${i}</loc></url>`).join("")}</urlset>`;
    const get = getterFor({ "https://acme.example/sitemap.xml": page("https://acme.example/sitemap.xml", xml) });
    expect((await fetchSitemap("https://acme.example/", get, NOW))?.urlCount).toBe(50000);
  });

  it("omite sitemaps .gz aunque la URL tenga query string", async () => {
    const get = getterFor({
      "https://acme.example/robots.txt": page("https://acme.example/robots.txt", "Sitemap: https://acme.example/sitemap.xml.gz?v=1"),
      "https://acme.example/sitemap.xml.gz?v=1": page("https://acme.example/sitemap.xml.gz?v=1", URLSET),
    });
    expect(await fetchSitemap("https://acme.example/", get, NOW)).toBeNull();
  });
});

describe("sitemaps parciales", () => {
  const getterFor = (pages: Record<string, FetchedPage>): PageGetter & { calls: string[] } => {
    const calls: string[] = [];
    return Object.assign(
      async (url: string) => {
        calls.push(url);
        return pages[url] ?? page(url, "", 404);
      },
      { calls },
    );
  };
  const urlset = (...paths: string[]) => `<urlset>${paths.map((p) => `<url><loc>https://acme.example${p}</loc></url>`).join("")}</urlset>`;
  const index = (...children: string[]) => `<sitemapindex>${children.map((c) => `<sitemap><loc>${c}</loc></sitemap>`).join("")}</sitemapindex>`;
  const robots = (url: string) => ({ "https://acme.example/robots.txt": page("https://acme.example/robots.txt", `Sitemap: ${url}`) });

  it("un sitemap leído entero es completo", async () => {
    const get = getterFor({ "https://acme.example/sitemap.xml": page("https://acme.example/sitemap.xml", urlset("/a", "/b")) });
    expect((await fetchSitemap("https://acme.example/", get, NOW))?.complete).toBe(true);
  });

  it("un índice con solo hijos .gz → null (no comprobado)", async () => {
    const get = getterFor({
      ...robots("https://acme.example/index.xml"),
      "https://acme.example/index.xml": page("https://acme.example/index.xml", index("https://acme.example/a.xml.gz", "https://acme.example/b.xml.gz")),
    });
    expect(await fetchSitemap("https://acme.example/", get, NOW)).toBeNull();
  });

  it("un índice cuyos hijos fallan todos → null (no comprobado)", async () => {
    const get = getterFor({
      ...robots("https://acme.example/index.xml"),
      "https://acme.example/index.xml": page("https://acme.example/index.xml", index("https://acme.example/a.xml", "https://acme.example/b.xml")),
      "https://acme.example/a.xml": page("https://acme.example/a.xml", "", 500),
    });
    expect(await fetchSitemap("https://acme.example/", get, NOW)).toBeNull();
  });

  it("con 5 hijos lee primero el que contiene «blog» y queda incompleto", async () => {
    const children = ["pages", "products", "collections", "legal", "blog-posts"].map((n) => `https://acme.example/sitemap-${n}.xml`);
    const pages: Record<string, FetchedPage> = {
      ...robots("https://acme.example/index.xml"),
      "https://acme.example/index.xml": page("https://acme.example/index.xml", index(...children)),
    };
    for (const c of children) pages[c] = page(c, urlset(c.includes("blog") ? "/blog/post-1" : `/p/${c.length}`));
    const get = getterFor(pages);
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(get.calls).toContain("https://acme.example/sitemap-blog-posts.xml");
    expect(data?.sections).toContain("blog");
    expect(data?.complete).toBe(false);
  });

  it("un hijo que falla deja el sitemap incompleto", async () => {
    const get = getterFor({
      ...robots("https://acme.example/index.xml"),
      "https://acme.example/index.xml": page("https://acme.example/index.xml", index("https://acme.example/a.xml", "https://acme.example/b.xml")),
      "https://acme.example/a.xml": page("https://acme.example/a.xml", urlset("/a")),
    });
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(data?.urlCount).toBe(1);
    expect(data?.complete).toBe(false);
  });

  it("un hijo .gz deja el sitemap incompleto", async () => {
    const get = getterFor({
      ...robots("https://acme.example/index.xml"),
      "https://acme.example/index.xml": page("https://acme.example/index.xml", index("https://acme.example/a.xml", "https://acme.example/b.xml.gz")),
      "https://acme.example/a.xml": page("https://acme.example/a.xml", urlset("/a")),
    });
    expect((await fetchSitemap("https://acme.example/", get, NOW))?.complete).toBe(false);
  });

  it("un archivo de casi 2 MB puede venir cortado: incompleto", async () => {
    const big = urlset("/a") + " ".repeat(1_999_000);
    const get = getterFor({ "https://acme.example/sitemap.xml": page("https://acme.example/sitemap.xml", big) });
    expect((await fetchSitemap("https://acme.example/", get, NOW))?.complete).toBe(false);
  });

  it("el tope de URLs deja el sitemap incompleto", async () => {
    const xml = `<urlset>${Array.from({ length: 50010 }, (_, i) => `<url><loc>https://acme.example/n/${i}</loc></url>`).join("")}</urlset>`;
    const get = getterFor({ "https://acme.example/sitemap.xml": page("https://acme.example/sitemap.xml", xml) });
    expect((await fetchSitemap("https://acme.example/", get, NOW))?.complete).toBe(false);
  });

  it("el tope de bytes deja el sitemap incompleto", async () => {
    const pad = "x".repeat(120);
    const big = (prefix: string) =>
      `<urlset>${Array.from({ length: 20000 }, (_, i) => `<url><loc>https://acme.example/${prefix}/${i}</loc><!-- ${pad} --></url>`).join("")}</urlset>`;
    const get = getterFor({
      "https://acme.example/robots.txt": page("https://acme.example/robots.txt", "Sitemap: https://acme.example/a.xml\nSitemap: https://acme.example/b.xml"),
      "https://acme.example/a.xml": page("https://acme.example/a.xml", big("p")),
      "https://acme.example/b.xml": page("https://acme.example/b.xml", big("q")),
    });
    expect((await fetchSitemap("https://acme.example/", get, NOW))?.complete).toBe(false);
  });
});

describe("sitemaps declarados en robots.txt", () => {
  const getterFor = (pages: Record<string, FetchedPage>): PageGetter & { calls: string[] } => {
    const calls: string[] = [];
    return Object.assign(
      async (url: string) => {
        calls.push(url);
        return pages[url] ?? page(url, "", 404);
      },
      { calls },
    );
  };
  const urlset = (...paths: string[]) => `<urlset>${paths.map((p) => `<url><loc>https://acme.example${p}</loc></url>`).join("")}</urlset>`;
  const robotsWith = (urls: string[]) => page("https://acme.example/robots.txt", urls.map((u) => `Sitemap: ${u}`).join("\n"));

  it("4 sitemaps en robots, el 4.º con el blog: se lee (antes se descartaba y daba un falso «sin blog»)", async () => {
    const urls = [1, 2, 3, 4].map((n) => `https://acme.example/s${n}.xml`);
    const pages: Record<string, FetchedPage> = { "https://acme.example/robots.txt": robotsWith(urls) };
    urls.forEach((u, i) => (pages[u] = page(u, urlset(i === 3 ? "/blog/p" : `/p${i}`))));
    const data = await fetchSitemap("https://acme.example/", getterFor(pages), NOW);
    expect(data?.urlCount).toBe(4);
    expect(data?.sections).toContain("blog");
    expect(data?.complete).toBe(true);
  });

  it("4 sitemaps en robots con un índice que agota el tope: el de blog se lee primero y el resultado es incompleto", async () => {
    const urls = ["https://acme.example/index.xml", "https://acme.example/s2.xml", "https://acme.example/s3.xml", "https://acme.example/sitemap-blog.xml"];
    const pages: Record<string, FetchedPage> = {
      "https://acme.example/robots.txt": robotsWith(urls),
      "https://acme.example/index.xml": page(
        "https://acme.example/index.xml",
        `<sitemapindex><sitemap><loc>https://acme.example/c1.xml</loc></sitemap><sitemap><loc>https://acme.example/c2.xml</loc></sitemap></sitemapindex>`,
      ),
      "https://acme.example/s2.xml": page("https://acme.example/s2.xml", urlset("/p2")),
      "https://acme.example/s3.xml": page("https://acme.example/s3.xml", urlset("/p3")),
      "https://acme.example/sitemap-blog.xml": page("https://acme.example/sitemap-blog.xml", urlset("/blog/p")),
      "https://acme.example/c1.xml": page("https://acme.example/c1.xml", urlset("/c1")),
      "https://acme.example/c2.xml": page("https://acme.example/c2.xml", urlset("/c2")),
    };
    const get = getterFor(pages);
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(get.calls[1]).toBe("https://acme.example/sitemap-blog.xml");
    expect(data?.sections).toContain("blog");
    expect(data?.complete).toBe(false);
  });

  it("5 sitemaps en robots sin «blog»: el 5.º no se lee y el resultado es incompleto", async () => {
    const urls = [1, 2, 3, 4, 5].map((n) => `https://acme.example/s${n}.xml`);
    const pages: Record<string, FetchedPage> = { "https://acme.example/robots.txt": robotsWith(urls) };
    urls.forEach((u, i) => (pages[u] = page(u, urlset(`/p${i}`))));
    const get = getterFor(pages);
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(get.calls).not.toContain("https://acme.example/s5.xml");
    expect(data?.urlCount).toBe(4);
    expect(data?.complete).toBe(false);
  });

  it("5 sitemaps en robots con el de blog al final: se lee el de blog primero", async () => {
    const urls = ["s1", "s2", "s3", "s4", "blog"].map((n) => `https://acme.example/${n}.xml`);
    const pages: Record<string, FetchedPage> = { "https://acme.example/robots.txt": robotsWith(urls) };
    urls.forEach((u) => (pages[u] = page(u, urlset(u.includes("blog") ? "/blog/p" : "/x"))));
    const get = getterFor(pages);
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(get.calls[1]).toBe("https://acme.example/blog.xml");
    expect(data?.sections).toContain("blog");
    expect(data?.complete).toBe(false);
  });
});

describe("urlset cuyos loc son sitemaps", () => {
  const getterFor = (pages: Record<string, FetchedPage>): PageGetter & { calls: string[] } => {
    const calls: string[] = [];
    return Object.assign(
      async (url: string) => {
        calls.push(url);
        return pages[url] ?? page(url, "", 404);
      },
      { calls },
    );
  };

  it("parseSitemapXml separa los loc .xml / .xml.gz como hijos y no como páginas", () => {
    const xml = `<urlset><url><loc>https://acme.example/sitemap-posts.xml</loc></url><url><loc>https://acme.example/sitemap-pages.xml.gz</loc></url><url><loc>https://acme.example/about</loc></url></urlset>`;
    const parsed = parseSitemapXml(xml);
    expect(parsed.kind).toBe("urlset");
    expect(parsed.children).toEqual(["https://acme.example/sitemap-posts.xml", "https://acme.example/sitemap-pages.xml.gz"]);
    expect(parsed.urls.map((u) => u.loc)).toEqual(["https://acme.example/about"]);
  });

  it("fetchSitemap los encola como hijos (blog primero) y no los cuenta como páginas", async () => {
    const get = getterFor({
      "https://acme.example/sitemap.xml": page(
        "https://acme.example/sitemap.xml",
        `<urlset><url><loc>https://acme.example/sitemap-a.xml</loc></url><url><loc>https://acme.example/sitemap-blog.xml</loc></url></urlset>`,
      ),
      "https://acme.example/sitemap-a.xml": page("https://acme.example/sitemap-a.xml", `<urlset><url><loc>https://acme.example/a</loc></url></urlset>`),
      "https://acme.example/sitemap-blog.xml": page("https://acme.example/sitemap-blog.xml", `<urlset><url><loc>https://acme.example/blog/p</loc></url></urlset>`),
    });
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(get.calls).toContain("https://acme.example/sitemap-a.xml");
    expect(get.calls.indexOf("https://acme.example/sitemap-blog.xml")).toBeLessThan(get.calls.indexOf("https://acme.example/sitemap-a.xml"));
    expect(data?.urlCount).toBe(2);
    expect(data?.sections).toEqual(["blog"]);
    expect(data?.complete).toBe(true);
  });

  it("los hijos de un urlset respetan el tope de archivos y dejan el resultado incompleto", async () => {
    const children = [1, 2, 3, 4, 5].map((n) => `https://acme.example/sitemap-${n}.xml`);
    const pages: Record<string, FetchedPage> = {
      "https://acme.example/sitemap.xml": page("https://acme.example/sitemap.xml", `<urlset>${children.map((c) => `<url><loc>${c}</loc></url>`).join("")}</urlset>`),
    };
    for (const c of children) pages[c] = page(c, `<urlset><url><loc>${c.replace(".xml", "")}/p</loc></url></urlset>`);
    const get = getterFor(pages);
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(get.calls.filter((c) => c.endsWith(".xml"))).toHaveLength(4);
    expect(data?.urlCount).toBe(3);
    expect(data?.complete).toBe(false);
  });

  it("un hijo .xml.gz dentro de un urlset deja el resultado incompleto", async () => {
    const get = getterFor({
      "https://acme.example/sitemap.xml": page(
        "https://acme.example/sitemap.xml",
        `<urlset><url><loc>https://acme.example/a</loc></url><url><loc>https://acme.example/more.xml.gz</loc></url></urlset>`,
      ),
    });
    const data = await fetchSitemap("https://acme.example/", get, NOW);
    expect(data?.urlCount).toBe(1);
    expect(data?.complete).toBe(false);
  });
});
