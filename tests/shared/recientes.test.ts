import { describe, it, expect } from "vitest";
import { agruparRecientes, filtrarRecientes } from "@/lib/shared/recientes";

// Fechas en hora local: el test vale en cualquier zona horaria.
const local = (d: number, h = 0, m = 0, s = 0, ms = 0) =>
  new Date(2026, 9, d, h, m, s, ms).toISOString();
const item = (id: string, createdAt: string) => ({ id, dominio: `${id}.com`, createdAt });

const AHORA = new Date(2026, 9, 19, 15, 30); // 19 oct 2026, 15:30 local

describe("agruparRecientes", () => {
  it("lista vacía da tres grupos vacíos", () => {
    expect(agruparRecientes([], AHORA)).toEqual({ hoy: [], ultimos7: [], anteriores: [] });
  });

  it("la medianoche local de hoy cuenta como hoy; un milisegundo antes, no", () => {
    const g = agruparRecientes(
      [item("medianoche", local(19)), item("ayer", local(18, 23, 59, 59, 999))],
      AHORA,
    );
    expect(g.hoy.map((a) => a.id)).toEqual(["medianoche"]);
    expect(g.ultimos7.map((a) => a.id)).toEqual(["ayer"]);
    expect(g.anteriores).toEqual([]);
  });

  it("el límite de 7 días es la medianoche local de hace 7 días", () => {
    const g = agruparRecientes(
      [item("justo7", local(12)), item("antes", local(11, 23, 59, 59, 999))],
      AHORA,
    );
    expect(g.ultimos7.map((a) => a.id)).toEqual(["justo7"]);
    expect(g.anteriores.map((a) => a.id)).toEqual(["antes"]);
  });

  it("conserva el orden de entrada dentro de cada grupo", () => {
    const g = agruparRecientes(
      [
        item("a", local(19, 14)),
        item("b", local(19, 9)),
        item("c", local(17)),
        item("d", local(15)),
        item("e", local(1)),
      ],
      AHORA,
    );
    expect(g.hoy.map((a) => a.id)).toEqual(["a", "b"]);
    expect(g.ultimos7.map((a) => a.id)).toEqual(["c", "d"]);
    expect(g.anteriores.map((a) => a.id)).toEqual(["e"]);
  });

  it("una fecha futura (reloj desajustado) va a hoy", () => {
    const g = agruparRecientes([item("futuro", local(20, 8))], AHORA);
    expect(g.hoy.map((a) => a.id)).toEqual(["futuro"]);
  });

  it("una fecha ilegible va a anteriores sin romper", () => {
    const g = agruparRecientes([item("rota", "no-es-fecha")], AHORA);
    expect(g.anteriores.map((a) => a.id)).toEqual(["rota"]);
  });
});

describe("filtrarRecientes", () => {
  const lista = [item("canva", local(19)), item("notion", local(18)), item("Stripe", local(17))];

  it("sin texto devuelve la lista entera", () => {
    expect(filtrarRecientes(lista, "  ")).toHaveLength(3);
  });

  it("filtra por dominio sin distinguir mayúsculas", () => {
    expect(filtrarRecientes(lista, "STR").map((a) => a.id)).toEqual(["Stripe"]);
    expect(filtrarRecientes(lista, "ti").map((a) => a.id)).toEqual(["notion"]);
  });
});
