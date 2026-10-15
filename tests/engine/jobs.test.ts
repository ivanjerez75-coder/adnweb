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

describe("fetchJobs con tableros enlazados que fallan", () => {
  const lever = [{ categories: { department: "Engineering" } }];
  const linked = { platform: "greenhouse" as const, token: "a", linkedFromSite: true };
  const guessed = { platform: "lever" as const, token: "b", linkedFromSite: false };
  const isGreenhouse = (url: string) => url.includes("boards-api.greenhouse.io");

  it("(a) lanza si el tablero enlazado falla aunque un adivinado tenga ofertas", async () => {
    await expect(
      fetchJobs([linked, guessed], async (url) => {
        if (isGreenhouse(url)) throw new Error("red caída");
        return Response.json(lever);
      }),
    ).rejects.toThrow();
  });

  it("(b) lanza si el tablero enlazado responde 503 aunque un adivinado tenga ofertas", async () => {
    await expect(
      fetchJobs([linked, guessed], async (url) => (isGreenhouse(url) ? new Response("", { status: 503 }) : Response.json(lever))),
    ).rejects.toThrow();
  });

  it("(c) ignora un tablero enlazado 404 y devuelve el adivinado con ofertas", async () => {
    const data = await fetchJobs([linked, guessed], async (url) =>
      isGreenhouse(url) ? new Response("", { status: 404 }) : Response.json(lever),
    );
    expect(data).toEqual({ platform: "lever", token: "b", openings: 1, byArea: { Engineering: 1 }, linkedFromSite: false });
  });

  it("(d) lanza si todas las peticiones responden 500", async () => {
    await expect(fetchJobs([linked, guessed], async () => new Response("", { status: 500 }))).rejects.toThrow();
  });
});

describe("jobCandidates con etiquetas genéricas o cortas", () => {
  it("(e) no adivina con etiquetas genéricas o de menos de 4 caracteres", () => {
    expect(jobCandidates(null, "app.example")).toEqual([]);
    expect(jobCandidates(null, "store.example")).toEqual([]);
  });

  it("(e) pasa a minúsculas la etiqueta del dominio al adivinar", () => {
    expect(jobCandidates(null, "Facturo.example")).toEqual([
      { platform: "greenhouse", token: "facturo", linkedFromSite: false },
      { platform: "lever", token: "facturo", linkedFromSite: false },
      { platform: "ashby", token: "facturo", linkedFromSite: false },
    ]);
  });
});
