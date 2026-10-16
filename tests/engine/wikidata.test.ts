import { describe, it, expect } from "vitest";
import { fetchWikidata, extractWikidata, type WikidataEntity } from "../../lib/engine/sources/wikidata";

const str = (value: string, rank = "normal") => ({ rank, mainsnak: { datavalue: { value } } });
const time = (t: string) => ({ rank: "normal", mainsnak: { datavalue: { value: { time: t } } } });
const item = (id: string) => ({ rank: "normal", mainsnak: { datavalue: { value: { id } } } });
const qty = (amount: string, unit: string, year?: number, rank = "normal") => ({
  rank,
  mainsnak: { datavalue: { value: { amount, unit } } },
  qualifiers: year ? { P585: [{ datavalue: { value: { time: `+${year}-01-01T00:00:00Z` } } }] } : undefined,
});

const ACME: WikidataEntity = {
  id: "Q1",
  descriptions: { es: { value: "empresa de software" } },
  claims: {
    P856: [str("https://www.acme.example/")],
    P571: [time("+2013-05-01T00:00:00Z")],
    P112: [item("Q10"), item("Q11")],
    P159: [item("Q20")],
    P1128: [qty("+120", "1", 2020), qty("+300", "1", 2024), qty("+999", "1", 2025, "deprecated")],
    P2139: [qty("+50000000", "http://www.wikidata.org/entity/Q4917", 2023)],
  },
};

describe("extractWikidata", () => {
  it("extrae fundación, fundadores, sede, empleados más recientes e ingresos", () => {
    expect(extractWikidata(ACME, { Q10: "Ana", Q11: "Luis", Q20: "Madrid" })).toEqual({
      id: "Q1",
      description: "empresa de software",
      inception: 2013,
      founders: ["Ana", "Luis"],
      headquarters: "Madrid",
      employees: 300,
      revenue: { amount: 50_000_000, currency: "USD", year: 2023 },
    });
  });

  it("devuelve nulos si faltan datos", () => {
    expect(extractWikidata({ id: "Q2", claims: {} }, {})).toEqual({
      id: "Q2",
      description: null,
      inception: null,
      founders: [],
      headquarters: null,
      employees: null,
      revenue: null,
    });
  });
});

describe("fetchWikidata", () => {
  const OTHER: WikidataEntity = { id: "Q9", claims: { P856: [str("https://acme-games.example/")] } };

  it("busca por nombre, acepta solo la entidad con la web del dominio y resuelve etiquetas", async () => {
    const urls: string[] = [];
    const data = await fetchWikidata({ companyName: "Acme", rootDomain: "acme.example" }, async (url) => {
      urls.push(url);
      if (url.includes("wbsearchentities")) return Response.json({ search: [{ id: "Q9" }, { id: "Q1" }] });
      if (url.includes("props=labels")) {
        return Response.json({ entities: { Q10: { labels: { es: { value: "Ana" } } }, Q11: { labels: { en: { value: "Luis" } } }, Q20: { labels: { es: { value: "Madrid" } } } } });
      }
      return Response.json({ entities: { Q9: OTHER, Q1: ACME } });
    });
    expect(urls[0]).toContain("action=wbsearchentities&search=Acme");
    expect(urls[1]).toContain("ids=Q9%7CQ1");
    expect(data?.id).toBe("Q1");
    expect(data?.founders).toEqual(["Ana", "Luis"]);
  });

  it("devuelve null si ninguna entidad tiene la web del dominio", async () => {
    const data = await fetchWikidata({ companyName: "Acme", rootDomain: "acme.example" }, async (url) =>
      url.includes("wbsearchentities") ? Response.json({ search: [{ id: "Q9" }] }) : Response.json({ entities: { Q9: OTHER } }),
    );
    expect(data).toBeNull();
  });

  it("devuelve null si la búsqueda no da resultados", async () => {
    expect(await fetchWikidata({ companyName: "Nada", rootDomain: "nada.example" }, async () => Response.json({ search: [] }))).toBeNull();
  });

  it("lanza error si Wikidata falla", async () => {
    await expect(
      fetchWikidata({ companyName: "Acme", rootDomain: "acme.example" }, async () => new Response("", { status: 500 })),
    ).rejects.toThrow();
  });
});
