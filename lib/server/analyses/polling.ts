/** ms hasta el siguiente sondeo, o null cuando hay que dejar de sondear. */
export function siguienteSondeo(intento: number): number | null {
  if (intento >= 120) return null;
  return intento < 30 ? 2000 : 5000;
}
