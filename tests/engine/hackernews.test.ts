import { describe, it, expect } from "vitest";
import { fetchHackerNews } from "../../lib/engine/sources/hackernews";

const NOW = new Date("2026-10-15T00:00:00Z");
const SINCE = Math.floor(NOW.getTime() / 1000) - 365 * 24 * 60 * 60;

describe("fetchHackerNews", () => {
  it("cuenta historias totales y del último año y toma la destacada", async () => {
    const urls: string[] = [];
    const data = await fetchHackerNews("acme.example", async (url) => {
      urls.push(url);
      return url.includes("numericFilters")
        ? Response.json({ nbHits: 4, hits: [] })
        : Response.json({ nbHits: 25, hits: [{ title: "Show HN: Acme", points: 512 }] });
    }, NOW);
    expect(urls[0]).toBe("https://hn.algolia.com/api/v1/search?query=acme.example&restrictSearchableAttributes=url&tags=story&hitsPerPage=1");
    expect(urls[1]).toContain(`numericFilters=created_at_i%3E${SINCE}`);
    expect(data).toEqual({ total: 25, lastYear: 4, top: { title: "Show HN: Acme", points: 512 } });
  });

  it("sin resultados", async () => {
    expect(await fetchHackerNews("x.example", async () => Response.json({ nbHits: 0, hits: [] }), NOW)).toEqual({ total: 0, lastYear: 0, top: null });
  });

  it("lanza error si Algolia falla", async () => {
    await expect(fetchHackerNews("x.example", async () => new Response("", { status: 500 }), NOW)).rejects.toThrow();
  });
});
