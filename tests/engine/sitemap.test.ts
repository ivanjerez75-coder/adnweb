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
  it("extrae hasta 3 líneas Sitemap absolutas", () => {
    const robots = "User-agent: *\nDisallow: /x\nSitemap: https://acme.example/a.xml\nsitemap: /b.xml\nSitemap: ftp://x/c.xml\nSitemap: https://acme.example/d.xml\nSitemap: https://acme.example/e.xml";
    expect(sitemapsFromRobots(robots, "https://acme.example")).toEqual([
      "https://acme.example/a.xml",
      "https://acme.example/b.xml",
      "https://acme.example/d.xml",
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
    });
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
