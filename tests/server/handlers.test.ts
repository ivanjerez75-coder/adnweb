import { describe, it, expect, vi } from "vitest";
import { createHandlers } from "@/lib/server/analyses/handlers";
import { createFakeRepos } from "./fake-repo";
import { fakeFetcher, fakeGetPage, NOW } from "../engine/fake-network";
import { validAiOutput } from "../engine/ai-fixture";
import type { JsonModel } from "@/lib/engine/ai/providers";

const okModel: JsonModel = { name: "fake", generate: async () => JSON.stringify(validAiOutput) };

function setup(opts: { sesion?: boolean } = {}) {
  const repos = createFakeRepos({ now: () => NOW });
  const tareas: Array<() => Promise<void>> = [];
  const handlers = createHandlers({
    user: async () => (opts.sesion === false ? null : { userId: "u1", repo: repos.user }),
    worker: repos.worker,
    getPage: fakeGetPage,
    engine: { getPage: fakeGetPage, fetcher: fakeFetcher(), now: () => NOW, models: [okModel] },
    schedule: (t) => {
      tareas.push(t);
    },
    now: () => NOW,
  });
  return { ...repos, tareas, handlers };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api/analisis", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("crear", () => {
  it("401 sin sesión", async () => {
    const { handlers } = setup({ sesion: false });
    const res = await handlers.crear(post({ url: "facturo.example" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Inicia sesión para continuar." });
  });

  it("400 con cuerpo inválido", async () => {
    const { handlers } = setup();
    for (const b of [{}, "no json", { url: 3 }]) {
      const res = await handlers.crear(post(b));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "La URL no es válida." });
    }
  });

  it("400 con una url de 2049 caracteres, sin llegar a startAnalysis", async () => {
    const { handlers, state } = setup();
    const url = `https://example.com/${"a".repeat(2049 - "https://example.com/".length)}`;
    expect(url).toHaveLength(2049);
    const res = await handlers.crear(post({ url }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "La URL no es válida." });
    expect(state.analisis).toHaveLength(0);
    expect(state.creditos).toBe(5);
  });

  it("403 si el Origin no coincide con el Host", async () => {
    const { handlers, state, tareas } = setup();
    const res = await handlers.crear(
      post({ url: "facturo.example" }, { origin: "https://malo.example", host: "dnaweb.example" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Origen no permitido." });
    expect(state.analisis).toHaveLength(0);
    expect(tareas).toHaveLength(0);
  });

  it("403 si el Origin es 'null'", async () => {
    const { handlers } = setup();
    const res = await handlers.crear(post({ url: "facturo.example" }, { origin: "null", host: "dnaweb.example" }));
    expect(res.status).toBe(403);
  });

  it("202 si el Origin coincide con el Host", async () => {
    const { handlers } = setup();
    const res = await handlers.crear(
      post({ url: "facturo.example" }, { origin: "https://dnaweb.example", host: "dnaweb.example" }),
    );
    expect(res.status).toBe(202);
  });

  it("202 sin cabecera Origin", async () => {
    const { handlers } = setup();
    const res = await handlers.crear(post({ url: "facturo.example" }, { host: "dnaweb.example" }));
    expect(res.status).toBe(202);
  });

  it("devuelve el error de startAnalysis", async () => {
    const { handlers } = setup();
    const res = await handlers.crear(post({ url: "no es una url" }));
    expect(res.status).toBe(400);
  });

  it("202, programa 1 tarea y al ejecutarla queda listo", async () => {
    const { handlers, tareas, state } = setup();
    const res = await handlers.crear(post({ url: "facturo.example" }));
    expect(res.status).toBe(202);
    const { id } = await res.json();
    expect(state.analisis[0].id).toBe(id);
    expect(tareas).toHaveLength(1);
    await tareas[0]();
    expect(state.analisis[0].estado).toBe("listo");
  });

  it("un análisis colgado de 4 min no bloquea: 202, el viejo pasa a error y se devuelve el crédito", async () => {
    const { handlers, state } = setup();
    const viejo = state.insertarAnalisis({
      userId: "u1",
      dominio: "viejo.example",
      createdAt: new Date(NOW.getTime() - 4 * 60_000),
    });
    state.creditos -= 1;
    const res = await handlers.crear(post({ url: "facturo.example" }));
    expect(res.status).toBe(202);
    expect(viejo.estado).toBe("error");
    expect(viejo.creditoDevuelto).toBe(true);
    expect(state.creditos).toBe(4);
  });
});

describe("estado", () => {
  it("404 sin llamar al repo si el id no es UUID", async () => {
    const { handlers, user } = setup();
    const spy = vi.spyOn(user, "obtener");
    const res = await handlers.estado("a1");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No encontrado." });
    expect(spy).not.toHaveBeenCalled();
  });

  it("401 sin sesión", async () => {
    const { handlers } = setup({ sesion: false });
    const res = await handlers.estado(crypto.randomUUID());
    expect(res.status).toBe(401);
  });

  it("404 para el análisis de otro usuario", async () => {
    const { handlers, state } = setup();
    const ajeno = state.insertarAnalisis({ userId: "u2", dominio: "z.example" });
    const res = await handlers.estado(ajeno.id);
    expect(res.status).toBe(404);
  });

  it("200 con los campos del análisis", async () => {
    const { handlers, state } = setup();
    const a = state.insertarAnalisis({ userId: "u1", dominio: "z.example", pasoActual: "Leyendo la web…" });
    const res = await handlers.estado(a.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: a.id,
      estado: "procesando",
      pasoActual: "Leyendo la web…",
      error: null,
      informe: null,
    });
  });

  it("colgado 4 min: estado error, mensaje de timeout y crédito devuelto", async () => {
    const { handlers, state } = setup();
    const a = state.insertarAnalisis({
      userId: "u1",
      dominio: "z.example",
      createdAt: new Date(NOW.getTime() - 4 * 60_000),
    });
    state.creditos -= 1;
    const body = await (await handlers.estado(a.id)).json();
    expect(body.estado).toBe("error");
    expect(body.error).toBe("El análisis ha tardado demasiado. Te hemos devuelto el crédito.");
    expect(state.creditos).toBe(5);
  });
});
