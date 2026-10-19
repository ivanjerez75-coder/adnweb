import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserRepo, createWorkerRepo } from "@/lib/server/analyses/supabase-repo";
import type { RawData } from "@/lib/engine/types";
import type { Report } from "@/lib/engine/report";

type Call = [string, unknown[]];
type Res = { data?: unknown; error?: { message: string } | null };

/** Cliente falso: registra la cadena y resuelve con `result`. */
function stub(result: Res, rpcResult: Res = {}) {
  const calls: Call[] = [];
  const rpcCalls: Call[] = [];
  const fromCalls: string[] = [];
  const res = { data: null, error: null, ...result };
  const chain: Record<string, unknown> = {};
  const wrap =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, args]);
      return chain;
    };
  for (const m of ["select", "update", "eq", "not", "gte", "ilike", "order", "limit"]) {
    chain[m] = wrap(m);
  }
  chain.maybeSingle = (...args: unknown[]) => {
    calls.push(["maybeSingle", args]);
    return Promise.resolve(res);
  };
  chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
    Promise.resolve(res).then(ok, ko);
  const client = {
    from: (t: string) => {
      fromCalls.push(t);
      return chain;
    },
    rpc: (fn: string, args?: unknown, opts?: unknown) => {
      rpcCalls.push([fn, [args, opts]]);
      return Promise.resolve({ data: null, error: null, ...rpcResult });
    },
  } as unknown as SupabaseClient;
  return { client, calls, rpcCalls, fromCalls };
}

describe("createUserRepo", () => {
  it("iniciar: sin_creditos", async () => {
    const s = stub({}, { error: { message: "sin_creditos" } });
    expect(await createUserRepo(s.client).iniciar("https://a.com", "a.com")).toEqual({
      ok: false,
      motivo: "sin_creditos",
    });
    expect(s.rpcCalls[0][0]).toBe("iniciar_analisis");
    expect(s.rpcCalls[0][1]).toEqual([{ p_url: "https://a.com", p_dominio: "a.com" }, undefined]);
  });

  it("iniciar: analisis_en_curso", async () => {
    const s = stub({}, { error: { message: "analisis_en_curso" } });
    expect(await createUserRepo(s.client).iniciar("u", "d")).toEqual({
      ok: false,
      motivo: "en_curso",
    });
  });

  it("iniciar: url_invalida lanza (no es sin_creditos ni en_curso)", async () => {
    const s = stub({}, { error: { message: "url_invalida" } });
    await expect(createUserRepo(s.client).iniciar("u", "d")).rejects.toThrow("url_invalida");
  });

  it("iniciar: relanza otros errores", async () => {
    const s = stub({}, { error: { message: "boom" } });
    await expect(createUserRepo(s.client).iniciar("u", "d")).rejects.toThrow("boom");
  });

  it("iniciar: ok devuelve el id", async () => {
    const s = stub({}, { data: "abc" });
    expect(await createUserRepo(s.client).iniciar("u", "d")).toEqual({ ok: true, id: "abc" });
  });

  it("obtenerPerfil: mapea snake_case a camelCase", async () => {
    const s = stub(
      {},
      {
        data: {
          id: "u1",
          nombre: "Ana",
          creditos_restantes: 3,
          creditos_mensuales: 5,
          renovacion: "2026-11-01T00:00:00Z",
        },
      },
    );
    expect(await createUserRepo(s.client).obtenerPerfil()).toEqual({
      id: "u1",
      nombre: "Ana",
      creditosRestantes: 3,
      creditosMensuales: 5,
      renovacion: "2026-11-01T00:00:00Z",
    });
    expect(s.rpcCalls[0][0]).toBe("obtener_perfil");
  });

  it("obtenerPerfil: lanza si el perfil no existe (id null)", async () => {
    const s = stub(
      {},
      {
        data: {
          id: null,
          nombre: null,
          creditos_restantes: null,
          creditos_mensuales: null,
          renovacion: null,
        },
      },
    );
    await expect(createUserRepo(s.client).obtenerPerfil()).rejects.toThrow();
  });

  it("obtenerPerfil: relanza errores", async () => {
    const s = stub({}, { error: { message: "no_autenticado" } });
    await expect(createUserRepo(s.client).obtenerPerfil()).rejects.toThrow("no_autenticado");
  });

  it("obtener: select + eq + maybeSingle y mapea", async () => {
    const s = stub({
      data: {
        id: "x",
        url: "https://a.com",
        dominio: "a.com",
        estado: "procesando",
        created_at: "2026-01-01T00:00:00Z",
        paso_actual: "Leyendo",
        informe: null,
        version: 3,
        secciones: { adn: { estado: "lista", contenido: { a: 1 } } },
        error: null,
      },
    });
    const r = await createUserRepo(s.client).obtener("x");
    expect(r).toEqual({
      id: "x",
      url: "https://a.com",
      dominio: "a.com",
      estado: "procesando",
      createdAt: "2026-01-01T00:00:00Z",
      pasoActual: "Leyendo",
      informe: null,
      version: 3,
      secciones: { adn: { estado: "lista", contenido: { a: 1 } } },
      error: null,
    });
    expect(s.fromCalls).toEqual(["analyses"]);
    expect(s.calls.map((c) => c[0])).toEqual(["select", "eq", "maybeSingle"]);
    expect(s.calls[1][1]).toEqual(["id", "x"]);
  });

  it("obtener: null si no hay fila", async () => {
    const s = stub({ data: null });
    expect(await createUserRepo(s.client).obtener("x")).toBeNull();
  });

  it("listar: orden desc, limite 50 por defecto", async () => {
    const s = stub({
      data: [{ id: "1", url: "u", dominio: "d", estado: "listo", created_at: "t" }],
    });
    const r = await createUserRepo(s.client).listar();
    expect(r).toEqual([{ id: "1", url: "u", dominio: "d", estado: "listo", createdAt: "t" }]);
    expect(s.calls.find((c) => c[0] === "order")![1]).toEqual(["created_at", { ascending: false }]);
    expect(s.calls.find((c) => c[0] === "limit")![1]).toEqual([50]);
    expect(s.calls.some((c) => c[0] === "ilike")).toBe(false);
  });

  it("listar: buscar usa ilike en dominio y escapa comodines", async () => {
    const s = stub({ data: [] });
    await createUserRepo(s.client).listar({ buscar: "a%b_c", limite: 5 });
    expect(s.calls.find((c) => c[0] === "ilike")![1]).toEqual(["dominio", "%a\\%b\\_c%"]);
    expect(s.calls.find((c) => c[0] === "limit")![1]).toEqual([5]);
  });
});

describe("createWorkerRepo", () => {
  const raw = { dominio: "a.com" } as unknown as RawData;
  const informe = { x: 1 } as unknown as Report;
  const eqs = (s: ReturnType<typeof stub>) =>
    s.calls.filter((c) => c[0] === "eq").map((c) => c[1]);
  const upd = (s: ReturnType<typeof stub>) =>
    s.calls.find((c) => c[0] === "update")![1][0] as Record<string, unknown>;

  it("paso: solo actualiza filas procesando", async () => {
    const s = stub({});
    await createWorkerRepo(s.client).paso("id1", "Leyendo");
    expect(upd(s).paso_actual).toBe("Leyendo");
    expect(typeof upd(s).updated_at).toBe("string");
    expect(eqs(s)).toContainEqual(["id", "id1"]);
    expect(eqs(s)).toContainEqual(["estado", "procesando"]);
  });

  it("completar: listo, filtra por estado procesando", async () => {
    const s = stub({});
    await createWorkerRepo(s.client).completar("id1", raw, informe);
    expect(upd(s).estado).toBe("listo");
    expect(upd(s).paso_actual).toBeNull();
    expect(upd(s).datos_brutos).toBe(raw);
    expect(upd(s).informe).toBe(informe);
    expect(typeof upd(s).updated_at).toBe("string");
    expect(eqs(s)).toContainEqual(["estado", "procesando"]);
  });

  it("guardarDatosBrutos: solo datos_brutos, filas procesando", async () => {
    const s = stub({});
    await createWorkerRepo(s.client).guardarDatosBrutos("id1", raw);
    expect(upd(s).datos_brutos).toBe(raw);
    expect(upd(s).estado).toBeUndefined();
    expect(eqs(s)).toContainEqual(["estado", "procesando"]);
  });

  it("marcarListo: listo, version 4, filtra por estado procesando", async () => {
    const s = stub({});
    await createWorkerRepo(s.client).marcarListo("id1");
    expect(upd(s)).toMatchObject({ estado: "listo", version: 4, paso_actual: null });
    expect(upd(s).informe).toBeUndefined();
    expect(eqs(s)).toContainEqual(["id", "id1"]);
    expect(eqs(s)).toContainEqual(["estado", "procesando"]);
  });

  it("guardarSeccion: llama a la rpc guardar_seccion y relanza errores", async () => {
    const s = stub({});
    expect(await createWorkerRepo(s.client).guardarSeccion("id1", "adn", { x: 1 }, "lista")).toBe(false);
    const t = stub({}, { data: true });
    expect(await createWorkerRepo(t.client).guardarSeccion("id1", "adn", { x: 1 }, "lista")).toBe(true);
    expect(s.rpcCalls[0][0]).toBe("guardar_seccion");
    expect(s.rpcCalls[0][1][0]).toEqual({ p_id: "id1", p_clave: "adn", p_contenido: { x: 1 }, p_estado: "lista" });
    const e = stub({}, { error: { message: "boom" } });
    await expect(createWorkerRepo(e.client).guardarSeccion("id1", "adn", null, "error")).rejects.toThrow("boom");
  });

  it("fallar: error, filtra por estado procesando", async () => {
    const s = stub({});
    await createWorkerRepo(s.client).fallar("id1", "mensaje", "ai_invalid");
    expect(upd(s)).toMatchObject({
      estado: "error",
      error: "mensaje",
      error_kind: "ai_invalid",
      paso_actual: null,
    });
    expect(eqs(s)).toContainEqual(["estado", "procesando"]);
  });

  it("lanza si la actualizacion falla", async () => {
    const s = stub({ error: { message: "db" } });
    await expect(createWorkerRepo(s.client).paso("i", "t")).rejects.toThrow("db");
  });

  it("buscarCache: filtros y datos_brutos", async () => {
    const s = stub({ data: { datos_brutos: raw } });
    const desde = new Date("2026-01-01T00:00:00Z");
    expect(await createWorkerRepo(s.client).buscarCache("a.com", desde)).toBe(raw);
    expect(eqs(s)).toContainEqual(["estado", "listo"]);
    expect(s.calls).toContainEqual(["not", ["datos_brutos", "is", null]]);
    expect(eqs(s)).toContainEqual(["dominio", "a.com"]);
    expect(s.calls.find((c) => c[0] === "gte")![1]).toEqual(["created_at", desde.toISOString()]);
    expect(s.calls.find((c) => c[0] === "order")![1]).toEqual(["created_at", { ascending: false }]);
    expect(s.calls.find((c) => c[0] === "limit")![1]).toEqual([1]);
  });

  it("buscarCache: null si no hay", async () => {
    const s = stub({ data: null });
    expect(await createWorkerRepo(s.client).buscarCache("a.com", new Date())).toBeNull();
  });

  it("devolverCredito y marcarColgados usan los RPC", async () => {
    const s = stub({}, { data: true });
    expect(await createWorkerRepo(s.client).devolverCredito("i")).toBe(true);
    expect(s.rpcCalls[0]).toEqual(["devolver_credito", [{ p_id: "i" }, undefined]]);
    const s2 = stub({}, { data: 2 });
    expect(await createWorkerRepo(s2.client).marcarColgados("u")).toBe(2);
    expect(s2.rpcCalls[0]).toEqual(["marcar_colgados", [{ p_user: "u" }, undefined]]);
  });
});
