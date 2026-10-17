import { describe, it, expect, vi } from "vitest";
import { runAnalysis } from "@/lib/server/analyses/run";
import { createFakeRepos } from "./fake-repo";
import { fakeFetcher, fakeGetPage, NOW } from "../engine/fake-network";
import { validAiOutput } from "../engine/ai-fixture";
import { makeRaw } from "../engine/raw-fixture";
import { AiUnavailableError, type JsonModel } from "@/lib/engine/ai/providers";
import type { PageGetter } from "@/lib/engine/safe-fetch";

const normalized = { url: "https://facturo.example/", domain: "facturo.example" };
const okModel: JsonModel = { name: "fake", generate: async () => JSON.stringify(validAiOutput) };
const badModel: JsonModel = {
  name: "bad",
  generate: async () => {
    throw new AiUnavailableError("cuota", "quota");
  },
};

function setup(models: JsonModel[], getPage: PageGetter = fakeGetPage) {
  const repos = createFakeRepos({ now: () => NOW });
  const a = repos.state.insertarAnalisis({ userId: "u1", dominio: normalized.domain, url: normalized.url });
  repos.state.creditos -= 1;
  const deps = {
    worker: repos.worker,
    engine: { getPage, fetcher: fakeFetcher(), now: () => NOW, models },
    now: () => NOW,
  };
  return { ...repos, a, deps };
}

describe("runAnalysis", () => {
  it("camino feliz: pasos en orden, listo y sin devolver crédito", async () => {
    const { worker, state, a, deps } = setup([okModel]);
    const pasos: string[] = [];
    const orig = worker.paso;
    worker.paso = async (id, t) => {
      pasos.push(t);
      return orig(id, t);
    };
    await runAnalysis(a.id, normalized, deps);
    expect(pasos).toEqual(["Leyendo la web…", "Analizando tráfico y presencia…", "Detectando señales…", "Generando informe…"]);
    expect(state.analisis[0].estado).toBe("listo");
    expect(state.analisis[0].informe?.dominio).toBe("facturo.example");
    expect(state.analisis[0].creditoDevuelto).toBe(false);
  });

  it("caché: no llama a collect y pide desde now-24h", async () => {
    const { worker, state, a, deps } = setup([okModel], async () => {
      throw new Error("collect no debe llamarse");
    });
    state.insertarAnalisis({
      userId: "u2",
      dominio: normalized.domain,
      estado: "listo",
      datosBrutos: makeRaw(),
      createdAt: new Date(NOW.getTime() - 3_600_000),
    });
    const spy = vi.spyOn(worker, "buscarCache");
    await runAnalysis(a.id, normalized, deps);
    expect(spy).toHaveBeenCalledWith("facturo.example", new Date(NOW.getTime() - 24 * 3_600_000));
    expect(state.analisis.find((x) => x.id === a.id)?.estado).toBe("listo");
  });

  it("fallo: error con mensaje y crédito devuelto", async () => {
    const { state, a, deps } = setup([badModel]);
    await runAnalysis(a.id, normalized, deps);
    expect(state.analisis[0].estado).toBe("error");
    expect(state.analisis[0].error).toBe("Alta demanda, inténtalo en unos minutos.");
    expect(state.analisis[0].creditoDevuelto).toBe(true);
    expect(state.creditos).toBe(5);
  });

  it("dos ejecuciones sobre el mismo fallo devuelven 1 solo crédito", async () => {
    const { state, a, deps } = setup([badModel]);
    await runAnalysis(a.id, normalized, deps);
    await runAnalysis(a.id, normalized, deps);
    expect(state.creditos).toBe(5);
  });

  it("si paso lanza, el análisis termina igualmente", async () => {
    const { worker, state, a, deps } = setup([okModel]);
    worker.paso = async () => {
      throw new Error("db caída");
    };
    await runAnalysis(a.id, normalized, deps);
    expect(state.analisis[0].estado).toBe("listo");
  });

  it("nunca lanza aunque fallar y devolverCredito fallen", async () => {
    const { worker, a, deps } = setup([badModel]);
    worker.fallar = async () => {
      throw new Error("x");
    };
    worker.devolverCredito = async () => {
      throw new Error("y");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runAnalysis(a.id, normalized, deps)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
