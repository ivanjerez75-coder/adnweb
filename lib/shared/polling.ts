/** ms hasta el siguiente sondeo, o null cuando hay que dejar de sondear. */
export function siguienteSondeo(intento: number): number | null {
  if (intento >= 120) return null;
  return intento < 30 ? 2000 : 5000;
}

export const MSG_LENTO = "Esto está tardando más de lo normal; recarga la página.";
export const MSG_CONSULTA = "No hemos podido consultar el estado del análisis.";
export const MSG_CONSULTA_FIN = "No hemos podido consultar el estado del análisis. Recarga la página.";
export const MAX_FALLOS_SEGUIDOS = 5;

export interface DecisionSondeo {
  accion: "seguir" | "refrescar" | "parar";
  espera?: number;
  mensaje?: string;
}

/**
 * Qué hacer tras un sondeo. `status` 0 = excepción de red. `fallosSeguidos` son los
 * fallos consecutivos ANTERIORES a este sondeo.
 */
export function decidirSondeo(status: number, intento: number, fallosSeguidos: number): DecisionSondeo {
  if (status === 401 || status === 404) return { accion: "refrescar" };
  const espera = siguienteSondeo(intento + 1);
  if (status >= 200 && status < 300) {
    return espera === null ? { accion: "parar", mensaje: MSG_LENTO } : { accion: "seguir", espera };
  }
  if (fallosSeguidos + 1 >= MAX_FALLOS_SEGUIDOS) return { accion: "parar", mensaje: MSG_CONSULTA_FIN };
  if (espera === null) return { accion: "parar", mensaje: MSG_LENTO };
  return { accion: "seguir", espera, mensaje: MSG_CONSULTA };
}
