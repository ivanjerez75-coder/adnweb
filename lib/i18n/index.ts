import { es, type Clave } from "./es";

export { es };
export type { Clave };

export const IDIOMAS = ["es"] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_POR_DEFECTO: Idioma = "es";

const diccionarios = { es } as const;

export function t(
  clave: Clave,
  vars?: Record<string, string | number>,
): string {
  let valor: unknown = diccionarios[IDIOMA_POR_DEFECTO];
  for (const parte of clave.split(".")) {
    valor = (valor as Record<string, unknown> | undefined)?.[parte];
  }
  if (typeof valor !== "string") return clave;
  if (!vars) return valor;
  return valor.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

/** Trocea un texto con *marcas*: los trozos impares van destacados. */
export function trozosDestacados(
  texto: string,
): { texto: string; destacado: boolean }[] {
  return texto
    .split("*")
    .map((parte, i) => ({ texto: parte, destacado: i % 2 === 1 }))
    .filter((p) => p.texto !== "");
}

/** El texto tal y como se lee, sin las *marcas* de destacado. */
export function sinMarcas(texto: string): string {
  return texto.replaceAll("*", "");
}
