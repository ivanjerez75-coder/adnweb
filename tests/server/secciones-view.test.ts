import { describe, expect, it } from "vitest";
import { hayPendientes, ordenSecciones, TIEMPO_MAX_SECCION_MS } from "@/lib/shared/secciones-view";

const t0 = "2026-10-18T10:00:00.000Z";
const en = (ms: number) => new Date(Date.parse(t0) + ms);

describe("ordenSecciones", () => {
  it("devuelve el orden y los títulos fijos", () => {
    const r = ordenSecciones({}, t0, en(0));
    expect(r.map((s) => s.clave)).toEqual(["datos", "adn", "saber", "score", "revision", "competidores", "aprender", "cierre"]);
    expect(r.map((s) => s.titulo)).toEqual([
      "Datos y métricas",
      "ADN del negocio",
      "Qué sabemos y qué no",
      "DNA Score",
      "Qué hace bien y problemas",
      "Competidores",
      "Qué aprender",
      "Oportunidades",
    ]);
  });

  it("una sección ausente cuenta como pendiente", () => {
    expect(ordenSecciones({}, t0, en(0)).every((s) => s.estado === "pendiente")).toBe(true);
  });

  it("conserva estado y contenido de las guardadas", () => {
    const r = ordenSecciones({ saber: { estado: "lista", contenido: ["a"] } }, t0, en(0));
    expect(r.find((s) => s.clave === "saber")).toMatchObject({ estado: "lista", contenido: ["a"] });
  });

  it("pendiente pasados 3 min desde createdAt pasa a error", () => {
    const secs = { adn: { estado: "pendiente" as const, contenido: null }, saber: { estado: "lista" as const, contenido: [] } };
    const antes = ordenSecciones(secs, t0, en(TIEMPO_MAX_SECCION_MS - 1));
    expect(antes.find((s) => s.clave === "adn")!.estado).toBe("pendiente");
    const despues = ordenSecciones(secs, t0, en(TIEMPO_MAX_SECCION_MS + 1));
    expect(despues.find((s) => s.clave === "adn")!.estado).toBe("error");
    expect(despues.find((s) => s.clave === "saber")!.estado).toBe("lista");
  });

  it("ignora claves desconocidas y estados inválidos", () => {
    const r = ordenSecciones({ raro: { estado: "lista", contenido: 1 }, adn: { estado: "x" as never, contenido: 1 } }, t0, en(0));
    expect(r).toHaveLength(8);
    expect(r.find((s) => s.clave === "adn")!.estado).toBe("pendiente");
  });

  it("createdAt inválido no convierte en error", () => {
    expect(ordenSecciones({}, "nope", en(10 ** 9))[0].estado).toBe("pendiente");
  });
});

describe("hayPendientes", () => {
  it("true mientras alguna esté pendiente, false si no", () => {
    expect(hayPendientes(ordenSecciones({}, t0, en(0)))).toBe(true);
    expect(hayPendientes(ordenSecciones({}, t0, en(TIEMPO_MAX_SECCION_MS + 1)))).toBe(false);
  });
});
