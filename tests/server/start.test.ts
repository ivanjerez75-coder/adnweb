import { describe, expect, it } from "vitest";
import { startAnalysis } from "@/lib/server/analyses/start";
import { createFakeRepos } from "./fake-repo";
import { BlockedUrlError } from "@/lib/engine/safe-fetch";
import type { PageGetter } from "@/lib/engine/safe-fetch";

const okGetter: PageGetter = async (url) => ({ url, status: 200, headers: {}, text: "" }) as never;

describe("startAnalysis", () => {
  it("URL inválida: 400 y no cobra", async () => {
    const { user, state } = createFakeRepos({ creditos: 5 });
    const r = await startAnalysis("localhost", { user, getPage: okGetter });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.mensaje.length).toBeGreaterThan(0);
    }
    expect(state.creditos).toBe(5);
  });

  it("web inaccesible: 422 y no cobra", async () => {
    const { user, state } = createFakeRepos({ creditos: 5 });
    const getPage: PageGetter = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await startAnalysis("example.com", { user, getPage })).toEqual({
      ok: false,
      status: 422,
      mensaje: "No hemos podido acceder a esta web.",
    });
    expect(state.creditos).toBe(5);
  });

  it("BlockedUrlError: 400", async () => {
    const { user, state } = createFakeRepos({ creditos: 5 });
    const getPage: PageGetter = async () => {
      throw new BlockedUrlError("privada");
    };
    expect(await startAnalysis("example.com", { user, getPage })).toEqual({
      ok: false,
      status: 400,
      mensaje: "La URL no es válida.",
    });
    expect(state.creditos).toBe(5);
  });

  it("sin créditos: 402", async () => {
    const { user } = createFakeRepos({ creditos: 0 });
    expect(await startAnalysis("example.com", { user, getPage: okGetter })).toEqual({
      ok: false,
      status: 402,
      mensaje: "No te quedan créditos este mes.",
    });
  });

  it("análisis en curso: 409", async () => {
    const { user } = createFakeRepos({ creditos: 5 });
    await startAnalysis("example.com", { user, getPage: okGetter });
    expect(await startAnalysis("other.com", { user, getPage: okGetter })).toEqual({
      ok: false,
      status: 409,
      mensaje: "Ya tienes un análisis en curso.",
    });
  });

  it("OK: devuelve id y dominio, créditos 5 -> 4", async () => {
    const { user, state } = createFakeRepos({ creditos: 5 });
    const r = await startAnalysis("https://example.com/x", { user, getPage: okGetter });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.id).toBeTruthy();
      expect(r.normalized.domain).toBe("example.com");
    }
    expect(state.creditos).toBe(4);
  });

  it("dos llamadas concurrentes con 1 crédito: solo una ok y nunca por debajo de 0", async () => {
    const { user, state } = createFakeRepos({ creditos: 1 });
    const rs = await Promise.all([
      startAnalysis("example.com", { user, getPage: okGetter }),
      startAnalysis("example.com", { user, getPage: okGetter }),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(state.creditos).toBe(0);
  });
});
