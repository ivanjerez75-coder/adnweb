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

describe("fetchAppStore", () => {
  it("busca por id si la web enlaza a la app y elige la de más valoraciones", async () => {
    let called = "";
    const data = await fetchAppStore({ appIds: ["1", "2"], companyName: "Acme", rootDomain: "acme.example" }, async (url) => {
      called = url;
      return Response.json({ results: [app({ trackName: "Lite", userRatingCount: 10 }), app({})] });
    });
    expect(called).toBe("https://itunes.apple.com/lookup?id=1,2");
    expect(data).toEqual({ name: "Acme", rating: 4.7, ratingCount: 1200, url: "https://apps.apple.com/app/id1", linkedFromSite: true });
  });

  it("busca por nombre y solo acepta apps cuyo vendedor es el mismo dominio", async () => {
    let called = "";
    const data = await fetchAppStore({ appIds: [], companyName: "Acme Inc", rootDomain: "acme.example" }, async (url) => {
      called = url;
      return Response.json({
        results: [
          app({ trackName: "Acme Clon", userRatingCount: 99999, sellerUrl: "https://acme-games.example/" }),
          app({ trackName: "Acme", userRatingCount: 50, sellerUrl: "https://blog.acme.example/" }),
        ],
      });
    });
    expect(called).toBe("https://itunes.apple.com/search?term=Acme%20Inc&entity=software&limit=10");
    expect(data?.name).toBe("Acme");
    expect(data?.linkedFromSite).toBe(false);
  });

  it("devuelve null si ninguna app coincide", async () => {
    const data = await fetchAppStore({ appIds: [], companyName: "Acme", rootDomain: "acme.example" }, async () =>
      Response.json({ results: [app({ sellerUrl: "https://otra.example/" }), app({ sellerUrl: undefined })] }),
    );
    expect(data).toBeNull();
  });

  it("valoración null si Apple no la da", async () => {
    const data = await fetchAppStore({ appIds: ["1"], companyName: "Acme", rootDomain: "acme.example" }, async () =>
      Response.json({ results: [app({ averageUserRating: undefined, userRatingCount: undefined })] }),
    );
    expect(data).toMatchObject({ rating: null, ratingCount: 0 });
  });

  it("lanza error si iTunes falla", async () => {
    await expect(
      fetchAppStore({ appIds: [], companyName: "Acme", rootDomain: "acme.example" }, async () => new Response("", { status: 503 })),
    ).rejects.toThrow();
  });
});
