import { describe, it, expect } from "vitest";
import { jobCandidates, parseGreenhouse, parseLever, parseAshby, fetchJobs } from "../../lib/engine/sources/jobs";
import { makeSite } from "./raw-fixture";

describe("jobCandidates", () => {
  it("prioriza los tableros enlazados y añade la etiqueta del dominio en las 3 plataformas", () => {
    const site = makeSite({ jobBoards: [{ platform: "lever", token: "facturo-hq" }] });
    expect(jobCandidates(site, "facturo.example")).toEqual([
      { platform: "lever", token: "facturo-hq", linkedFromSite: true },
      { platform: "greenhouse", token: "facturo", linkedFromSite: false },
      { platform: "lever", token: "facturo", linkedFromSite: false },
      { platform: "ashby", token: "facturo", linkedFromSite: false },
    ]);
  });

  it("no duplica un candidato enlazado y adivinado", () => {
    const site = makeSite({ jobBoards: [{ platform: "ashby", token: "facturo" }] });
    expect(jobCandidates(site, "facturo.example").filter((c) => c.platform === "ashby")).toEqual([
      { platform: "ashby", token: "facturo", linkedFromSite: true },
    ]);
  });
});

describe("parsers", () => {
  it("Greenhouse cuenta ofertas únicas por departamento", () => {
    const json = { departments: [{ name: "Engineering", jobs: [{ id: 1 }, { id: 2 }] }, { name: "Sales", jobs: [{ id: 2 }, { id: 3 }] }, { name: "Vacío", jobs: [] }] };
    expect(parseGreenhouse(json)).toEqual({ openings: 3, byArea: { Engineering: 2, Sales: 2 } });
  });
  it("Lever agrupa por departamento o equipo", () => {
    const json = [{ categories: { department: "Engineering" } }, { categories: { team: "Support" } }, { categories: {} }];
    expect(parseLever(json)).toEqual({ openings: 3, byArea: { Engineering: 1, Support: 1, Otros: 1 } });
  });
  it("Ashby ignora las ofertas no publicadas", () => {
    const json = { jobs: [{ department: "Design", isListed: true }, { team: "Ops" }, { department: "X", isListed: false }] };
    expect(parseAshby(json)).toEqual({ openings: 2, byArea: { Design: 1, Ops: 1 } });
  });
  it("devuelven null con formas inesperadas", () => {
    expect(parseGreenhouse({})).toBeNull();
    expect(parseLever({ ok: true })).toBeNull();
    expect(parseAshby(null)).toBeNull();
  });
});

describe("fetchJobs", () => {
  const lever = [{ categories: { department: "Engineering" } }];

  it("devuelve el primer candidato con ofertas, en orden de prioridad", async () => {
    const data = await fetchJobs(
      [
        { platform: "greenhouse", token: "a", linkedFromSite: false },
        { platform: "lever", token: "b", linkedFromSite: false },
      ],
      async (url) => (url.includes("api.lever.co/v0/postings/b") ? Response.json(lever) : new Response("", { status: 404 })),
    );
    expect(data).toEqual({ platform: "lever", token: "b", openings: 1, byArea: { Engineering: 1 }, linkedFromSite: false });
  });

  it("acepta un tablero enlazado aunque tenga 0 ofertas, pero no uno adivinado", async () => {
    const fetcher = async () => Response.json([]);
    expect(await fetchJobs([{ platform: "lever", token: "x", linkedFromSite: false }], fetcher)).toBeNull();
    expect((await fetchJobs([{ platform: "lever", token: "x", linkedFromSite: true }], fetcher))?.openings).toBe(0);
  });

  it("usa los endpoints públicos", async () => {
    const urls: string[] = [];
    await fetchJobs(
      [
        { platform: "greenhouse", token: "g", linkedFromSite: false },
        { platform: "lever", token: "l", linkedFromSite: false },
        { platform: "ashby", token: "a", linkedFromSite: false },
      ],
      async (url) => {
        urls.push(url);
        return new Response("", { status: 404 });
      },
    );
    expect(urls).toEqual([
      "https://boards-api.greenhouse.io/v1/boards/g/departments",
      "https://api.lever.co/v0/postings/l?mode=json",
      "https://api.ashbyhq.com/posting-api/job-board/a",
    ]);
  });

  it("lanza error si ninguna plataforma responde", async () => {
    const fetcher = async () => {
      throw new Error("red caída");
    };
    await expect(fetchJobs([{ platform: "lever", token: "x", linkedFromSite: false }], fetcher)).rejects.toThrow();
  });
});
