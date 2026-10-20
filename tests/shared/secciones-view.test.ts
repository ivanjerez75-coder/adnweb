import { describe, expect, it } from "vitest";
import { estadoInforme, ordenSeccionesV4, TIEMPO_MAX_SECCION_MS } from "@/lib/shared/secciones-view";

const t0 = "2026-10-19T10:00:00.000Z";
const en = (ms: number) => new Date(Date.parse(t0) + ms);
const lista = (contenido: unknown = {}) => ({ estado: "lista", contenido });

const todas = {
  datos: lista(),
  anatomia: lista(),
  rendimiento: lista(),
  competencia: lista(),
  diagnostico: lista(),
  oportunidades: lista([]),
  plan: lista(),
  resumen: lista(),
  cobertura: lista({ identidad: { estado: "valido", motivo: "ok" } }),
};

describe("ordenSeccionesV4", () => {
  it("devuelve los 5 bloques en orden con número, ancla, título y pregunta", () => {
    const { bloques } = ordenSeccionesV4({}, t0, en(0));
    expect(bloques.map((b) => b.clave)).toEqual(["negocio", "datos", "competencia", "hallazgos", "oportunidades"]);
    expect(bloques.map((b) => b.numero)).toEqual(["01", "02", "03", "04", "05"]);
    expect(bloques[0]).toMatchObject({ ancla: "bloque-negocio", titulo: "El negocio", pregunta: "¿Qué es y cómo funciona?" });
    expect(bloques[3].pregunta).toBe("¿Qué deberíamos saber?");
  });

  it("el estado de cada bloque es el de su sección principal", () => {
    const { bloques } = ordenSeccionesV4({ anatomia: lista(), diagnostico: { estado: "error", contenido: null } }, t0, en(0));
    const de = (k: string) => bloques.find((b) => b.clave === k)!.estado;
    expect(de("negocio")).toBe("lista");
    expect(de("hallazgos")).toBe("error");
    expect(de("competencia")).toBe("pendiente");
  });

  it("expone todas las secciones del motor, incluidas plan, resumen y cobertura", () => {
    const { porClave } = ordenSeccionesV4(todas, t0, en(0));
    expect(Object.keys(porClave).sort()).toEqual(
      ["anatomia", "cobertura", "competencia", "datos", "diagnostico", "oportunidades", "plan", "rendimiento", "resumen"].sort(),
    );
    expect(porClave.oportunidades.contenido).toEqual([]);
  });

  it("pendiente pasados 3 min pasa a error; lista sin contenido es error", () => {
    const v = ordenSeccionesV4({ competencia: { estado: "lista", contenido: null } }, t0, en(TIEMPO_MAX_SECCION_MS + 1));
    expect(v.porClave.anatomia.estado).toBe("error");
    expect(v.porClave.competencia.estado).toBe("error");
  });

  it("no rompe con estados inválidos ni con secciones antiguas", () => {
    const v = ordenSeccionesV4({ adn: lista(), anatomia: { estado: "x", contenido: 1 } }, t0, en(0));
    expect(v.porClave.anatomia.estado).toBe("pendiente");
    expect(v.bloques).toHaveLength(5);
  });
});

describe("estadoInforme", () => {
  it("generando mientras algo esté pendiente o la fila siga procesando", () => {
    expect(estadoInforme(ordenSeccionesV4({}, t0, en(0)), false)).toBe("generando");
    expect(estadoInforme(ordenSeccionesV4(todas, t0, en(0)), true)).toBe("generando");
  });
  it("completo cuando todo está listo y la cobertura no tiene fallos", () => {
    expect(estadoInforme(ordenSeccionesV4(todas, t0, en(0)), false)).toBe("completo");
  });
  it("parcial si una sección falló o la cobertura marca algo fallido", () => {
    expect(estadoInforme(ordenSeccionesV4({ ...todas, plan: { estado: "error", contenido: null } }, t0, en(0)), false)).toBe("parcial");
    const cob = { ...todas, cobertura: lista({ competencia: { estado: "fallido", motivo: "x" } }) };
    expect(estadoInforme(ordenSeccionesV4(cob, t0, en(0)), false)).toBe("parcial");
  });
});
