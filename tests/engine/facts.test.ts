import { describe, it, expect } from "vitest";
import { presence, computeFacts } from "../../lib/engine/facts";
import { makeRaw, makeSite } from "./raw-fixture";

describe("presence", () => {
  it.each([
    [[true], "si"],
    [[false, true], "si"],
    [[false, false], "no"],
    [[false, null, false], "no"],
    [[false], "desconocido"],
    [[false, null], "desconocido"],
    [[], "desconocido"],
  ] as const)("%j → %s", (checks, expected) => {
    expect(presence([...checks])).toBe(expected);
  });
});

const sitemap = (sections: ("blog" | "precios" | "empleo")[]) => ({ urlCount: 100, sections, languages: [], lastModified: null, recentBlogPosts: 0 });

describe("computeFacts", () => {
  it("caso Notion: la home no enlaza el blog pero el sitemap sí → blog = si", () => {
    const raw = makeRaw({ site: makeSite({ hasBlog: false, textLength: 300 }), sitemap: sitemap(["blog"]) });
    expect(computeFacts(raw).blog).toBe("si");
  });

  it("blog = no si la web y las rutas lo comprueban sin verlo", () => {
    const raw = makeRaw({ site: makeSite({ hasBlog: false }), rutas: { found: [], checked: ["blog"] } });
    expect(computeFacts(raw).blog).toBe("no");
  });

  it("blog = desconocido con una sola comprobación", () => {
    expect(computeFacts(makeRaw({ site: makeSite({ hasBlog: false }) })).blog).toBe("desconocido");
  });

  it("app = no si la web no enlaza y App Store no encontró ninguna (no_aplica)", () => {
    expect(computeFacts(makeRaw({ site: makeSite({ hasAppLinks: false }) })).app).toBe("no");
  });

  it("app = desconocido si App Store falló", () => {
    const raw = makeRaw({ site: makeSite({ hasAppLinks: false }) });
    raw.fuentes.appstore = "fallo";
    expect(computeFacts(raw).app).toBe("desconocido");
  });

  it("app = si si App Store encontró la app", () => {
    const raw = makeRaw({ site: makeSite({ hasAppLinks: false }), appstore: { name: "F", rating: 4, ratingCount: 9, url: "u", linkedFromSite: false } });
    expect(computeFacts(raw).app).toBe("si");
  });

  it("email marketing: lo ve el DNS aunque la web no", () => {
    const raw = makeRaw({ site: makeSite({ technologies: [] }), dns: { emailProvider: "Google Workspace", tools: [{ name: "HubSpot", category: "email" }] } });
    expect(computeFacts(raw).emailMarketing).toBe("si");
  });

  it("email marketing = no si web y DNS lo comprueban sin verlo", () => {
    const raw = makeRaw({ site: makeSite({ technologies: [] }), dns: { emailProvider: "Otro", tools: [] } });
    expect(computeFacts(raw).emailMarketing).toBe("no");
  });

  it("empleo: la ausencia en la web no cuenta; sitemap + rutas sí", () => {
    expect(computeFacts(makeRaw({ rutas: { found: [], checked: ["empleo"] } })).empleo).toBe("desconocido");
    expect(computeFacts(makeRaw({ rutas: { found: [], checked: ["empleo"] }, sitemap: sitemap([]) })).empleo).toBe("no");
    expect(computeFacts(makeRaw({ empleo: { platform: "lever", token: "f", openings: 0, byArea: {}, linkedFromSite: true } })).empleo).toBe("si");
  });

  it("redes une los enlaces de la web sin duplicados", () => {
    expect(computeFacts(makeRaw()).redes).toEqual(["x", "linkedin"]);
  });
});
