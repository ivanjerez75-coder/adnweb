import { describe, it, expect, vi } from "vitest";
import { runAnalysis } from "@/lib/server/analyses/run";
import { createFakeRepos } from "./fake-repo";
import { fakeV3Model, rawV3, v3GetPage, v3RunOpts } from "./v3-fakes";
import { fakeFetcher, NOW } from "../engine/fake-network";
import { AiUnavailableError, type JsonModel } from "@/lib/engine/ai/providers";
import type { PageGetter } from "@/lib/engine/safe-fetch";

const normalized = { url: "https://facturo.example/", domain: "facturo.example" };
const badModel: JsonModel = {
  name: "bad",
  generate: async () => {
    throw new AiUnavailableError("cuota", "quota");
  },
};

function setup(models: JsonModel[], getPage: PageGetter = v3GetPage) {
  const repos = createFakeRepos({ now: () => NOW });
  const a = repos.state.insertarAnalisis({ userId: "u1", dominio: normalized.domain, url: normalized.url });
  repos.state.creditos -= 1;
  const deps = {
    worker: repos.worker,
    engine: { getPage, fetcher: fakeFetcher(), now: () => NOW, models, searchModels: models, runOpts: v3RunOpts },
    now: () => NOW,
  };
  return { ...repos, a, deps };
}

/** Deja en caché (otro usuario, hace 1 h) unos datos brutos. */
function conCache(state: ReturnType<typeof setup>["state"], datosBrutos: unknown) {
  state.insertarAnalisis({
    userId: "u2",
    dominio: normalized.domain,
    estado: "listo",
    datosBrutos: datosBrutos as never,
    createdAt: new Date(NOW.getTime() - 3_600_000),
  });
}

describe("runAnalysis v3", () => {
  it("camino feliz con caché v3: listo, versión 3, secciones guardadas, sin informe ni devolución", async () => {
    const { state, a, deps } = setup([fakeV3Model()]);
    conCache(state, rawV3);
    await runAnalysis(a.id, normalized, deps);
    const mine = state.analisis.find((x) => x.id === a.id)!;
    expect(mine.estado).toBe("listo");
    expect(mine.version).toBe(3);
    expect(mine.informe).toBeNull();
    expect(mine.creditoDevuelto).toBe(false);
    expect(Object.keys(mine.secciones).sort()).toEqual(
      ["anatomia", "aprender", "cierre", "competencia", "datos", "rendimiento", "revision"],
    );
    expect(Object.values(mine.secciones).every((s) => s.estado === "lista")).toBe(true);
  });

  it("queda listo justo después de guardar anatomia, antes de las demás secciones", async () => {
    const { worker, state, a, deps } = setup([fakeV3Model()]);
    conCache(state, rawV3);
    const mine = state.analisis.find((x) => x.id === a.id)!;
    const orig = worker.guardarSeccion;
    const vistas: Array<[string, string]> = [];
    worker.guardarSeccion = async (id, clave, c, e) => {
      const r = await orig(id, clave, c, e);
      vistas.push([clave, mine.estado]);
      return r;
    };
    await runAnalysis(a.id, normalized, deps);
    const iAdn = vistas.findIndex(([c]) => c === "anatomia");
    expect(vistas[0]).toEqual(["datos", "procesando"]);
    // Cuando se guarda anatomia aún está procesando; marcarListo va inmediatamente después.
    expect(vistas[iAdn][0]).toBe("anatomia");
    expect(vistas.slice(iAdn + 1).length).toBeGreaterThan(0);
    expect(vistas.slice(iAdn + 1).every(([, e]) => e === "listo")).toBe(true);
  });

  it("un error posterior deja el análisis listo con esa sección en error", async () => {
    const { state, a, deps } = setup([fakeV3Model({ competidores: true })]);
    conCache(state, rawV3);
    await runAnalysis(a.id, normalized, deps);
    const mine = state.analisis.find((x) => x.id === a.id)!;
    expect(mine.estado).toBe("listo");
    expect(mine.secciones.competencia).toEqual({ estado: "error", contenido: null });
    expect(mine.secciones.anatomia.estado).toBe("lista");
    expect(mine.creditoDevuelto).toBe(false);
  });

  it("fallo de anatomia: error, anatomia en error y crédito devuelto una vez", async () => {
    const { state, a, deps } = setup([badModel]);
    conCache(state, rawV3);
    await runAnalysis(a.id, normalized, deps);
    await runAnalysis(a.id, normalized, deps);
    const mine = state.analisis.find((x) => x.id === a.id)!;
    expect(mine.estado).toBe("error");
    expect(mine.error).toBe("Alta demanda, inténtalo en unos minutos.");
    expect(mine.secciones.anatomia).toEqual({ estado: "error", contenido: null });
    expect(mine.creditoDevuelto).toBe(true);
    expect(state.creditos).toBe(5);
  });

  it("caché con datos v2 (o sin versión): se ignora y se recoge de nuevo", async () => {
    for (const vieja of [{ version: 2, domain: "facturo.example" }, { domain: "facturo.example" }]) {
      const getPage = vi.fn<PageGetter>(v3GetPage);
      const { state, a, deps } = setup([badModel], getPage);
      conCache(state, vieja);
      await runAnalysis(a.id, normalized, deps);
      expect(getPage).toHaveBeenCalled();
      // Los datos recogidos se guardan antes de anatomia aunque este falle.
      expect(state.analisis.find((x) => x.id === a.id)?.datosBrutos?.version).toBe(3);
    }
  });

  it("caché v3 caducada (collectedAt > 24 h) o sin el campo legal (pre v3.1): se recoge de nuevo", async () => {
    const { legal: _sinLegal, ...preV31 } = rawV3;
    void _sinLegal;
    const viejas = [{ ...rawV3, collectedAt: new Date(NOW.getTime() - 25 * 3_600_000).toISOString() }, { ...rawV3, collectedAt: "no es fecha" }, preV31];
    for (const vieja of viejas) {
      const getPage = vi.fn<PageGetter>(v3GetPage);
      const { state, a, deps } = setup([badModel], getPage);
      conCache(state, vieja);
      await runAnalysis(a.id, normalized, deps);
      expect(getPage.mock.calls.some(([u]) => u === "https://facturo.example/"), JSON.stringify(vieja.collectedAt)).toBe(true);
    }
    // Recogida hace 23 h y con legal: se reutiliza.
    const getPage = vi.fn<PageGetter>(v3GetPage);
    const { state, a, deps } = setup([badModel], getPage);
    conCache(state, { ...rawV3, collectedAt: new Date(NOW.getTime() - 23 * 3_600_000).toISOString() });
    await runAnalysis(a.id, normalized, deps);
    expect(getPage.mock.calls.some(([u]) => u === "https://facturo.example/")).toBe(false);
  });

  it("caché v3: no llama a collect y pide desde now-24h", async () => {
    // collect pide la home del negocio; la verificación de competidores usa otras URL.
    const getPage = vi.fn<PageGetter>(v3GetPage);
    const { worker, state, a, deps } = setup([fakeV3Model()], getPage);
    conCache(state, rawV3);
    const spy = vi.spyOn(worker, "buscarCache");
    await runAnalysis(a.id, normalized, deps);
    expect(spy).toHaveBeenCalledWith("facturo.example", new Date(NOW.getTime() - 24 * 3_600_000));
    expect(getPage).not.toHaveBeenCalledWith("https://facturo.example/");
    expect(state.analisis.find((x) => x.id === a.id)?.estado).toBe("listo");
  });

  it("guarda los datos brutos antes de anatomia (la caché sirve aunque fallen las secciones)", async () => {
    const { worker, state, a, deps } = setup([badModel]);
    const orden: string[] = [];
    const g = worker.guardarDatosBrutos;
    worker.guardarDatosBrutos = async (...args) => {
      orden.push("brutos");
      return g(...args);
    };
    const s = worker.guardarSeccion;
    worker.guardarSeccion = async (...args) => {
      orden.push(`seccion:${args[1]}`);
      return s(...args);
    };
    await runAnalysis(a.id, normalized, deps);
    expect(orden[0]).toBe("brutos");
    expect(state.analisis.find((x) => x.id === a.id)?.datosBrutos?.domain).toBe("facturo.example");
  });

  it("si paso lanza, el análisis termina igualmente", async () => {
    const { worker, state, a, deps } = setup([fakeV3Model()]);
    conCache(state, rawV3);
    worker.paso = async () => {
      throw new Error("db caída");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runAnalysis(a.id, normalized, deps);
    err.mockRestore();
    expect(state.analisis.find((x) => x.id === a.id)?.estado).toBe("listo");
  });

  it("si guardarSeccion de anatomia falla, el análisis falla y se devuelve el crédito", async () => {
    const { worker, state, a, deps } = setup([fakeV3Model()]);
    conCache(state, rawV3);
    const orig = worker.guardarSeccion;
    worker.guardarSeccion = async (id, clave, c, e) => {
      if (clave === "anatomia") throw new Error("db caída");
      return orig(id, clave, c, e);
    };
    await runAnalysis(a.id, normalized, deps);
    const mine = state.analisis.find((x) => x.id === a.id)!;
    expect(mine.estado).toBe("error");
    expect(mine.creditoDevuelto).toBe(true);
  });

  it("nunca lanza aunque fallar y devolverCredito fallen", async () => {
    const { worker, state, a, deps } = setup([badModel]);
    conCache(state, rawV3);
    worker.fallar = async () => {
      throw new Error("x");
    };
    worker.devolverCredito = async () => {
      throw new Error("y");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const refund = vi.spyOn(worker, "devolverCredito");
    await expect(runAnalysis(a.id, normalized, deps)).resolves.toBeUndefined();
    expect(refund).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
    expect(state.creditos).toBe(4);
  });

  it("si buscarCache lanza, se recoge de nuevo", async () => {
    const getPage = vi.fn<PageGetter>(v3GetPage);
    const { worker, a, deps } = setup([badModel], getPage);
    worker.buscarCache = async () => {
      throw new Error("db caída");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runAnalysis(a.id, normalized, deps);
    err.mockRestore();
    expect(getPage).toHaveBeenCalled();
  });

  it("la caché encadena: B reutiliza la de A y C la de B sin volver a recoger", async () => {
    const getPage = vi.fn<PageGetter>(v3GetPage);
    const { state, worker, a: b, deps } = setup([fakeV3Model()], getPage);
    const origen = state.insertarAnalisis({
      userId: "u2",
      dominio: normalized.domain,
      estado: "listo",
      datosBrutos: rawV3,
      createdAt: new Date(NOW.getTime() - 7_200_000),
    });
    await runAnalysis(b.id, normalized, deps);
    expect(b.datosBrutos?.version).toBe(3);
    // La fila original deja de ser utilizable: C solo puede apoyarse en B.
    origen.datosBrutos = null;
    b.createdAt = new Date(NOW.getTime() - 3_600_000);
    const c = state.insertarAnalisis({ userId: "u1", dominio: normalized.domain, url: normalized.url });
    await runAnalysis(c.id, normalized, { ...deps, worker });
    expect(getPage).not.toHaveBeenCalledWith("https://facturo.example/");
    expect(c.estado).toBe("listo");
    expect(c.datosBrutos?.version).toBe(3);
  });

  it("buscarCache ignora filas listas sin datos brutos", async () => {
    const { state, worker } = setup([fakeV3Model()]);
    state.insertarAnalisis({ userId: "u2", dominio: normalized.domain, estado: "listo", createdAt: new Date(NOW.getTime() - 1000) });
    expect(await worker.buscarCache(normalized.domain, new Date(NOW.getTime() - 86_400_000))).toBeNull();
  });

  it("si la fila ya está en estado final (guardarSeccion false), aborta sin fallar ni devolver", async () => {
    const { worker, state, a, deps } = setup([fakeV3Model()]);
    conCache(state, rawV3);
    const orig = worker.guardarSeccion;
    const guardadas: string[] = [];
    worker.guardarSeccion = async (id, clave, c, e) => {
      const r = await orig(id, clave, c, e);
      guardadas.push(clave);
      // Simula marcar_colgados tras la primera sección.
      if (clave === "datos") a.estado = "error";
      return a.estado === "error" ? false : r;
    };
    const fallar = vi.spyOn(worker, "fallar");
    const refund = vi.spyOn(worker, "devolverCredito");
    await expect(runAnalysis(a.id, normalized, deps)).resolves.toBeUndefined();
    expect(fallar).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
    expect(guardadas).toEqual(["datos"]);
  });
});
