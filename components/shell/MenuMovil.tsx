"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { Marca } from "@/components/ui/Marca";
import { BarraLateral, type DatosBarra } from "./BarraLateral";
import { IconoMenu } from "./iconos";

/**
 * Móvil: barra superior con la marca y un botón que abre la barra lateral como cajón.
 * El cajón es un <dialog> modal: atrapa el foco, cierra con Escape y deja inerte el fondo.
 */
export function MenuMovil(datos: DatosBarra) {
  const ref = useRef<HTMLDialogElement>(null);
  const idCajon = useId();
  const [abierto, setAbierto] = useState(false);

  function abrir() {
    ref.current?.showModal();
    setAbierto(true);
  }
  function cerrar() {
    ref.current?.close();
  }

  return (
    <>
      <BarraSuperior>
        <button
          type="button"
          onClick={abrir}
          aria-label={t("barra.menu")}
          aria-expanded={abierto}
          aria-controls={idCajon}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-grafito hover:bg-borde/50"
        >
          <IconoMenu />
        </button>
      </BarraSuperior>
      <dialog
        ref={ref}
        id={idCajon}
        aria-label={t("barra.navegacion")}
        onClose={() => setAbierto(false)}
        onClick={(e) => {
          // Un clic en el fondo (fuera del contenido) cierra el cajón.
          if (e.target === e.currentTarget) cerrar();
        }}
        className="m-0 h-dvh max-h-none w-[min(85vw,300px)] max-w-none bg-fondo p-0 text-grafito backdrop:bg-grafito/40 md:hidden"
      >
        <BarraLateral {...datos} modo="cajon" alCerrar={cerrar} />
      </dialog>
    </>
  );
}

/** Barra superior móvil; también la usa el esqueleto mientras cargan los datos. */
export function BarraSuperior({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between px-4 md:hidden">
      <Link href="/dashboard" className="rounded">
        <Marca className="text-xl" />
      </Link>
      {children}
    </header>
  );
}
