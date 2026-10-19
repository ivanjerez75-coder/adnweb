"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { BuscadorUrl } from "@/components/ui/BuscadorUrl";

/** Mensaje en español para cada respuesta de POST /api/analisis que no inicia el análisis. */
function mensajeDeError(status: number, error: string | undefined): string {
  switch (status) {
    case 400:
      return t("errores.urlInvalida");
    case 401:
      return t("errores.sesionCaducada");
    case 402:
      return t("errores.sinCreditos");
    case 409:
      return t("errores.enCurso");
    default:
      // El resto de mensajes de la API ya vienen en español (p. ej. "No hemos podido acceder a esta web.").
      return error ?? t("errores.generico");
  }
}

export function NuevoAnalisis({ urlInicial }: { urlInicial: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviando = useRef(false);

  async function enviar(valor: string) {
    if (enviando.current) return;
    const url = valor.trim();
    if (!url) {
      setError(t("errores.urlInvalida"));
      return;
    }
    enviando.current = true;
    setError(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/analisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.status === 202 && cuerpo.id) {
        router.push("/analisis/" + cuerpo.id);
        // La barra lateral (layout) no se vuelve a pedir al navegar: así aparece el nuevo reciente.
        router.refresh();
        return;
      }
      setError(mensajeDeError(res.status, cuerpo.error));
    } catch {
      setError(t("errores.generico"));
    }
    enviando.current = false;
    setOcupado(false);
  }

  return (
    <BuscadorUrl
      alEnviar={enviar}
      valorInicial={urlInicial}
      error={error}
      ocupado={ocupado}
      idCampo="url-panel"
    />
  );
}
