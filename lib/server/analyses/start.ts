import { InvalidUrlError, normalizeUrl, type NormalizedUrl } from "@/lib/engine/url";
import { BlockedUrlError, checkReachable, type PageGetter } from "@/lib/engine/safe-fetch";
import type { UserRepo } from "@/lib/server/analyses/repo";

export type StartResult =
  | { ok: true; id: string; normalized: NormalizedUrl }
  | { ok: false; status: 400 | 402 | 409 | 422; mensaje: string };

/** Longitud máxima de la URL de entrada (la misma que exige iniciar_analisis). */
export const MAX_URL = 2048;

const SIN_CREDITOS: StartResult = { ok: false, status: 402, mensaje: "No te quedan créditos este mes." };

/** Valida la URL, comprueba que responde (gratis) y solo entonces cobra el crédito. */
export async function startAnalysis(
  input: string,
  deps: { user: UserRepo; getPage: PageGetter },
): Promise<StartResult> {
  let normalized: NormalizedUrl;
  try {
    normalized = normalizeUrl(input);
  } catch (error) {
    if (error instanceof InvalidUrlError) return { ok: false, status: 400, mensaje: error.message };
    throw error;
  }

  // Sin créditos no se hace ninguna petición saliente. El cobro atómico
  // de iniciar_analisis sigue siendo la garantía real.
  const perfil = await deps.user.obtenerPerfil();
  if (perfil.creditosRestantes <= 0) return SIN_CREDITOS;

  let alcanzable: boolean;
  try {
    alcanzable = await checkReachable(normalized.url, deps.getPage);
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      return { ok: false, status: 400, mensaje: "La URL no es válida." };
    }
    throw error;
  }
  if (!alcanzable) {
    return { ok: false, status: 422, mensaje: "No hemos podido acceder a esta web." };
  }

  const inicio = await deps.user.iniciar(normalized.url, normalized.domain);
  if (!inicio.ok) {
    return inicio.motivo === "sin_creditos"
      ? SIN_CREDITOS
      : { ok: false, status: 409, mensaje: "Ya tienes un análisis en curso." };
  }
  return { ok: true, id: inicio.id, normalized };
}
