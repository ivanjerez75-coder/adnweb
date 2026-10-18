"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decidirSondeo, siguienteSondeo } from "@/lib/server/analyses/polling";

export function Progreso({ id }: { id: string }) {
  const router = useRouter();
  const [paso, setPaso] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallos = 0;

    async function sondear(intento: number) {
      let status = 0;
      let estado = "procesando";
      let errorApi: string | undefined;
      try {
        const res = await fetch(`/api/analisis/${id}`, { cache: "no-store" });
        status = res.status;
        const d = (await res.json().catch(() => ({}))) as {
          estado?: string;
          pasoActual?: string | null;
          error?: string | null;
        };
        if (res.ok) {
          estado = d.estado ?? "procesando";
          if (!cancelado) setPaso(d.pasoActual ?? null);
        } else if (typeof d.error === "string") {
          errorApi = d.error;
        }
      } catch {
        status = 0;
      }
      if (cancelado) return;

      if (status >= 200 && status < 300 && estado !== "procesando") {
        router.refresh();
        return;
      }
      const d = decidirSondeo(status, intento, fallos);
      fallos = status >= 200 && status < 300 ? 0 : fallos + 1;
      if (d.accion === "refrescar") {
        router.refresh();
        return;
      }
      setAviso(d.mensaje ? (d.accion === "seguir" && errorApi ? errorApi : d.mensaje) : null);
      if (d.accion === "parar") return;
      timer = setTimeout(() => void sondear(intento + 1), d.espera);
    }

    timer = setTimeout(() => void sondear(0), siguienteSondeo(0)!);
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, router]);

  return (
    <div>
      <p role="status">{paso ?? "Preparando el análisis…"}</p>
      {aviso && <p role="alert">{aviso}</p>}
    </div>
  );
}
