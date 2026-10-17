import { describe, expect, it } from "vitest";
import { siguienteSondeo } from "@/lib/server/analyses/polling";

describe("siguienteSondeo", () => {
  it("2000 ms en los primeros 30 intentos", () => {
    expect(siguienteSondeo(0)).toBe(2000);
    expect(siguienteSondeo(29)).toBe(2000);
  });
  it("5000 ms hasta el intento 119", () => {
    expect(siguienteSondeo(30)).toBe(5000);
    expect(siguienteSondeo(119)).toBe(5000);
  });
  it("null a partir del intento 120", () => {
    expect(siguienteSondeo(120)).toBeNull();
  });
});
