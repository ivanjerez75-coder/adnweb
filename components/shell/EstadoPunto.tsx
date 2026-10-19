import { t } from "@/lib/i18n";
import type { EstadoAnalisis } from "@/lib/server/analyses/repo";

const colores: Record<EstadoAnalisis, string> = {
  listo: "bg-teal",
  procesando: "bg-suave motion-safe:animate-pulse",
  error: "bg-rojo",
};

/** Punto de color con el estado de un análisis; el estado se lee también en voz alta. */
export function EstadoPunto({ estado }: { estado: EstadoAnalisis }) {
  return (
    <>
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${colores[estado]}`} />
      <span className="sr-only">{t(`estado.${estado}`)}</span>
    </>
  );
}
