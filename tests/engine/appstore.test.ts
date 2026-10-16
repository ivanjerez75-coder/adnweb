import { describe, it, expect } from "vitest";
import { fetchAppStore } from "../../lib/engine/sources/appstore";

const app = (over: Record<string, unknown>) => ({
  trackName: "Acme",
  averageUserRating: 4.66,
  userRatingCount: 1200,
  trackViewUrl: "https://apps.apple.com/app/id1",
  sellerUrl: "https://www.acme.example/",
  ...over,
});

const ACME = { companyName: "Acme", domains: ["acme.example"] };

describe("fetchAppStore", () => {
  it("busca por id si la web enlaza a la app y elige la de más valoraciones", async () => {
    let called = "";
    const data = await fetchAppStore({ ...ACME, appIds: ["1", "2"] }, async (url) => {
      called = url;
      return Response.json({ results: [app({ trackName: "Lite", userRatingCount: 10 }), app({})] });
    });
    expect(called).toBe("https://itunes.apple.com/lookup?id=1,2");
    expect(data).toEqual({ name: "Acme", rating: 4.7, ratingCount: 1200, url: "https://apps.apple.com/app/id1", linkedFromSite: true });
  });

  it("si la búsqueda por id no da nada, la repite en la tienda española", async () => {
    const urls: string[] = [];
    const data = await fetchAppStore({ ...ACME, appIds: ["7"] }, async (url) => {
      urls.push(url);
      return Response.json({ results: url.includes("country=es") ? [app({ trackName: "Acme ES" })] : [] });
    });
    expect(urls.slice(0, 2)).toEqual(["https://itunes.apple.com/lookup?id=7", "https://itunes.apple.com/lookup?id=7&country=es"]);
    expect(data).toMatchObject({ name: "Acme ES", linkedFromSite: true });
  });

  it("busca por nombre en las tiendas de EE. UU. y España y solo acepta apps del mismo dominio", async () => {
    const urls: string[] = [];
    const data = await fetchAppStore({ appIds: [], companyName: "Acme Inc", domains: ["acme.example"] }, async (url) => {
      urls.push(url);
      return Response.json({
        results: [
          app({ trackName: "Acme Clon", userRatingCount: 99999, sellerUrl: "https://acme-games.example/" }),
          app({ trackName: "Acme", userRatingCount: 50, sellerUrl: "https://blog.acme.example/" }),
        ],
      });
    });
    expect(urls.sort()).toEqual([
      "https://itunes.apple.com/search?term=Acme%20Inc&entity=software&limit=10&country=es",
      "https://itunes.apple.com/search?term=Acme%20Inc&entity=software&limit=10&country=us",
    ]);
    expect(data?.name).toBe("Acme");
    expect(data?.linkedFromSite).toBe(false);
  });

  it("acepta un vendedor en cualquiera de los dominios (notion.so → notion.com)", async () => {
    const data = await fetchAppStore({ appIds: [], companyName: "Notion", domains: ["notion.so", "notion.com"] }, async () =>
      Response.json({ results: [app({ trackName: "Notion", sellerUrl: "https://www.notion.so/" })] }),
    );
    expect(data?.name).toBe("Notion");
  });

  it("una app cuyo nombre empieza por el de la empresa gana a otra más valorada del mismo vendedor", async () => {
    const data = await fetchAppStore({ ...ACME, appIds: [] }, async () =>
      Response.json({
        results: [
          app({ trackName: "Planner Pro", userRatingCount: 99999, trackViewUrl: "https://apps.apple.com/app/id9" }),
          app({ trackName: "Acme: notas", userRatingCount: 40, trackViewUrl: "https://apps.apple.com/app/id2" }),
        ],
      }),
    );
    expect(data?.name).toBe("Acme: notas");
  });

  it("une los resultados de EE. UU. y España", async () => {
    const data = await fetchAppStore({ ...ACME, appIds: [] }, async (url) =>
      Response.json({
        results: url.includes("country=es")
          ? [app({ trackName: "Acme Solo ES", userRatingCount: 900, trackViewUrl: "https://apps.apple.com/app/id5" })]
          : [app({ trackName: "Acme", userRatingCount: 100 })],
      }),
    );
    // Ambas empiezan por el nombre; gana la de más valoraciones tras unir las dos tiendas.
    expect(data).toMatchObject({ name: "Acme Solo ES", ratingCount: 900 });
  });

  it("al unir, una misma app (mismo trackViewUrl) conserva el mayor número de valoraciones", async () => {
    const data = await fetchAppStore({ ...ACME, appIds: [] }, async (url) =>
      Response.json({ results: [app({ userRatingCount: url.includes("country=es") ? 300 : 100 })] }),
    );
    expect(data?.ratingCount).toBe(300);
  });

  it("devuelve null si ninguna app coincide", async () => {
    const data = await fetchAppStore({ ...ACME, appIds: [] }, async () =>
      Response.json({ results: [app({ sellerUrl: "https://otra.example/" }), app({ sellerUrl: undefined })] }),
    );
    expect(data).toBeNull();
  });

  it("valoración null si Apple no la da", async () => {
    const data = await fetchAppStore({ ...ACME, appIds: ["1"] }, async () =>
      Response.json({ results: [app({ averageUserRating: undefined, userRatingCount: undefined })] }),
    );
    expect(data).toMatchObject({ rating: null, ratingCount: 0 });
  });

  it("lanza error si iTunes falla", async () => {
    await expect(fetchAppStore({ ...ACME, appIds: [] }, async () => new Response("", { status: 503 }))).rejects.toThrow();
  });

  it("lanza error si falla una tienda y la otra no encuentra nada (no se puede afirmar que no haya app)", async () => {
    await expect(
      fetchAppStore({ ...ACME, appIds: [] }, async (url) =>
        url.includes("country=es") ? new Response("", { status: 503 }) : Response.json({ results: [] }),
      ),
    ).rejects.toThrow();
  });
});
