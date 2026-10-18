import { describe, expect, it } from "vitest";
import { createFakeRepos } from "./fake-repo";
import type { RawData } from "@/lib/engine/types";
import type { Report } from "@/lib/engine/report";

const raw = { dominio: "a.com" } as unknown as RawData;
const informe = { x: 1 } as unknown as Report;

describe("fake repos", () => {
  it("iniciar dos veces: la segunda es en_curso y solo se cobra 1", async () => {
    const { user, state } = createFakeRepos({ creditos: 5 });
    const a = await user.iniciar("https://a.com", "a.com");
    expect(a.ok).toBe(true);
    expect(await user.iniciar("https://b.com", "b.com")).toEqual({ ok: false, motivo: "en_curso" });
    expect(state.creditos).toBe(4);
  });

  it("sin créditos -> sin_creditos", async () => {
    const { user } = createFakeRepos({ creditos: 0 });
    expect(await user.iniciar("u", "d")).toEqual({ ok: false, motivo: "sin_creditos" });
  });

  it("devolverCredito es idempotente", async () => {
    const { user, worker, state } = createFakeRepos({ creditos: 5 });
    const r = await user.iniciar("u", "d");
    if (!r.ok) throw new Error("x");
    expect(state.creditos).toBe(4);
    await worker.fallar(r.id, "m", "k");
    expect(await worker.devolverCredito(r.id)).toBe(true);
    expect(await worker.devolverCredito(r.id)).toBe(false);
    expect(state.creditos).toBe(5);
  });

  it("devolverCredito sobre un análisis listo: false y créditos sin cambios", async () => {
    const { user, worker, state } = createFakeRepos({ creditos: 5 });
    const r = await user.iniciar("u", "d");
    if (!r.ok) throw new Error("x");
    await worker.completar(r.id, raw, informe);
    expect(await worker.devolverCredito(r.id)).toBe(false);
    expect(state.creditos).toBe(4);
    expect(state.analisis[0].creditoDevuelto).toBe(false);
  });

  it("devolverCredito sobre un análisis procesando: false", async () => {
    const { user, worker, state } = createFakeRepos({ creditos: 5 });
    const r = await user.iniciar("u", "d");
    if (!r.ok) throw new Error("x");
    expect(await worker.devolverCredito(r.id)).toBe(false);
    expect(state.creditos).toBe(4);
  });

  it("marcarColgados devuelve una sola vez un error aún no devuelto", async () => {
    const { user, worker, state } = createFakeRepos({ creditos: 5 });
    const r = await user.iniciar("u", "d");
    if (!r.ok) throw new Error("x");
    // Función cortada entre fallar y devolverCredito.
    await worker.fallar(r.id, "m", "k");
    expect(state.creditos).toBe(4);
    expect(await worker.marcarColgados("u1")).toBe(0);
    expect(state.creditos).toBe(5);
    expect(state.analisis[0].creditoDevuelto).toBe(true);
    await worker.marcarColgados("u1");
    expect(state.creditos).toBe(5);
  });

  it("obtenerPerfil tras 4 min muestra el crédito devuelto del colgado", async () => {
    const { user, state } = createFakeRepos({ creditos: 5 });
    const r = await user.iniciar("u", "d");
    if (!r.ok) throw new Error("x");
    expect((await user.obtenerPerfil()).creditosRestantes).toBe(4);
    state.avanzar(4 * 60_000);
    expect((await user.obtenerPerfil()).creditosRestantes).toBe(5);
    expect(state.analisis[0].estado).toBe("error");
  });

  it("marcarColgados con now + 4 min", async () => {
    const { user, worker, state } = createFakeRepos({ creditos: 5 });
    const r = await user.iniciar("u", "d");
    if (!r.ok) throw new Error("x");
    expect(await worker.marcarColgados("u1")).toBe(0);
    state.avanzar(4 * 60_000);
    expect(await worker.marcarColgados("u1")).toBe(1);
    expect((await user.obtener(r.id))!.estado).toBe("error");
    expect(state.creditos).toBe(5);
  });

  it("completar tras marcarColgados no pisa el error (Ruling 2)", async () => {
    const { user, worker, state } = createFakeRepos();
    const r = await user.iniciar("u", "d");
    if (!r.ok) throw new Error("x");
    state.avanzar(4 * 60_000);
    await worker.marcarColgados("u1");
    await worker.completar(r.id, raw, informe);
    await worker.fallar(r.id, "m", "k");
    await worker.paso(r.id, "tarde");
    const d = (await user.obtener(r.id))!;
    expect(d.estado).toBe("error");
    expect(d.informe).toBeNull();
    expect(d.pasoActual).toBeNull();
  });

  it("completar guarda informe y buscarCache lo encuentra", async () => {
    const { user, worker, state } = createFakeRepos();
    const r = await user.iniciar("u", "a.com");
    if (!r.ok) throw new Error("x");
    await worker.paso(r.id, "Leyendo");
    expect((await user.obtener(r.id))!.pasoActual).toBe("Leyendo");
    await worker.completar(r.id, raw, informe);
    const d = (await user.obtener(r.id))!;
    expect(d.estado).toBe("listo");
    expect(d.informe).toBe(informe);
    expect(await worker.buscarCache("a.com", new Date(state.now().getTime() - 1000))).toBe(raw);
    expect(await worker.buscarCache("a.com", new Date(state.now().getTime() + 1000))).toBeNull();
    expect(await worker.buscarCache("b.com", new Date(0))).toBeNull();
  });

  it("fallar guarda el error", async () => {
    const { user, worker } = createFakeRepos();
    const r = await user.iniciar("u", "d");
    if (!r.ok) throw new Error("x");
    await worker.fallar(r.id, "mensaje", "kind");
    const d = (await user.obtener(r.id))!;
    expect(d.estado).toBe("error");
    expect(d.error).toBe("mensaje");
  });

  it("obtener solo devuelve análisis del usuario", async () => {
    const { user, state } = createFakeRepos({ userId: "u1" });
    const ajeno = state.insertarAnalisis({ userId: "u2", dominio: "z.com" });
    expect(await user.obtener(ajeno.id)).toBeNull();
    expect(await user.listar()).toEqual([]);
  });

  it("listar filtra por buscar, ordena desc y limita", async () => {
    const { user, worker, state } = createFakeRepos({ creditos: 5 });
    const a = await user.iniciar("u", "alpha.com");
    if (!a.ok) throw new Error("x");
    await worker.completar(a.id, raw, informe);
    state.avanzar(1000);
    const b = await user.iniciar("u", "beta.com");
    if (!b.ok) throw new Error("x");
    expect((await user.listar()).map((x) => x.dominio)).toEqual(["beta.com", "alpha.com"]);
    expect((await user.listar({ buscar: "ALP" })).map((x) => x.dominio)).toEqual(["alpha.com"]);
    expect(await user.listar({ limite: 1 })).toHaveLength(1);
  });

  it("obtenerPerfil refleja créditos", async () => {
    const { user } = createFakeRepos({ creditos: 3, userId: "u9" });
    const p = await user.obtenerPerfil();
    expect(p.id).toBe("u9");
    expect(p.creditosRestantes).toBe(3);
  });
});
