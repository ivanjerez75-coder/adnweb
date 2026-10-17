"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { siguienteSondeo } from "@/lib/server/analyses/polling";

export function Progreso({ id }: { id: string }) {
  const router = useRouter();
  const [paso, setPaso] = useState<string | null>(null);
  const [lento, setLento] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function sondear(intento: number) {
      let estado = "procesando";
      try {
        const res = await fetch(`/api/analisis/${id}`, { cache: "no-store" });
        if (res.ok) {
          const d = (await res.json()) as { estado: string; pasoActual: string | null };
          estado = d.estado;
          if (!cancelado) setPaso(d.pasoActual);
        }
      } catch {
        // error de red: se reintenta en el siguiente sondeo
      }
      if (cancelado) return;
      if (estado !== "procesando") {
        router.refresh();
        return;
      }
      const espera = siguienteSondeo(intento + 1);
      if (espera === null) {
        setLento(true);
        return;
      }
      timer = setTimeout(() => void sondear(intento + 1), espera);
    }

    timer = setTimeout(() => void sondear(0), siguienteSondeo(0) ?? 2000);
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, router]);

  return (
    <div>
      <p role="status">{paso ?? "Preparando el análisis…"}</p>
      {lento && <p>Esto está tardando más de lo normal; recarga la página.</p>}
    </div>
  );
}
