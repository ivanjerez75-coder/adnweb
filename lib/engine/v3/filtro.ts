/**
 * Filtro de código para el texto libre de la IA: cifras y promesas de conversión que no
 * respalda ningún dato. Nunca se aplica a los extractos literales de página (Evidence).
 */
/** Importes y porcentajes: en un texto descriptivo pueden ser legítimos ("desde 29 €/mes", "100 % ecológico"). */
const IMPORTES_Y_PORCENTAJES: RegExp[] = [
  // Importes: "2 M€", "500 €", "3 millones EUR", "$20", "€ 9".
  /\d[\d.,]*\s*(?:k|m|mil|millones?|mill\.?)?\s*(?:€|\$|eur\b|euros?\b|usd\b|d[oó]lares\b)/i,
  /(?:€|\$|\beur|\busd)\s*\d/i,
  // Porcentajes.
  /\d+(?:[.,]\d+)?\s?%/,
];
/** Verbos de cambio que, junto a un porcentaje, forman una predicción ("subirá un 30 %", "crece un 30 % al año"). */
const CAMBIO = String.raw`(?:crec|sub[ie]|aument|increment|mejor|reduc|dupl|tripl|dispar|baj)\w*`;
const CIFRAS: RegExp[] = [
  // Porcentajes de crecimiento o mejora (también en texto descriptivo).
  new RegExp(String.raw`${CAMBIO}[^.;!?]*\d+(?:[.,]\d+)?\s?%|\d+(?:[.,]\d+)?\s?%[^.;!?]*${CAMBIO}`, "i"),
  // Recuentos de visitas, visitantes, usuarios o clientes.
  /\d[\d.,]*\s*(?:k|mil|millones?)?\s+(?:visitas|visitantes|usuarios|clientes)\b/i,
  // Años de experiencia que la empresa se atribuye: "más de 60 años".
  /m[aá]s\s+de\s+\d+\s+a[nñ]os/i,
];
/** Promesas de conversión, abandono o ventas perdidas. */
const PROMESAS: RegExp[] = [
  /ventas\s+perdidas|tasa\s+de\s+conversi[oó]n|tasa\s+de\s+abandono|abandono\s+del?\s+carrito|\bchurn\b|aumentar[aá]\s+las\s+ventas|impulsar[aá]\s+las\s+ventas|atraer[aá]\s+(?:m[aá]s|mayor\s+volumen)/i,
];

export interface OpcionesFiltro {
  /**
   * Solo cifras (importes, %, recuentos, años), no las palabras de conversión: para los items de
   * "qué no sabemos", que nombran justo esos datos como desconocidos ("no se conoce el churn").
   */
  soloCifras?: boolean;
  /**
   * Texto que describe la oferta o una acción (qué es, propuesta de valor, qué aprender, acción):
   * deja pasar importes y porcentajes, que suelen ser precios o atributos publicados.
   */
  descriptivo?: boolean;
}

export function contieneCifraNoRespaldada(texto: string, opts: OpcionesFiltro = {}): boolean {
  const t = texto ?? "";
  const cifras = opts.descriptivo ? CIFRAS : [...IMPORTES_Y_PORCENTAJES, ...CIFRAS];
  return cifras.some((re) => re.test(t)) || (!opts.soloCifras && PROMESAS.some((re) => re.test(t)));
}

/** Quita cada frase que contiene una cifra o promesa no respaldada. Si no queda nada, "". */
export function limpiarAfirmacionesNoRespaldadas(texto: string, opts: OpcionesFiltro = {}): string {
  const t = (texto ?? "").trim();
  if (!t) return "";
  return t
    .split(/(?<=[.!?;])\s+/)
    .filter((f) => !contieneCifraNoRespaldada(f, opts))
    .join(" ")
    .trim();
}
