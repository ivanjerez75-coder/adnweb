"use client";

import type { MouseEvent, ReactNode } from "react";

/** Enlace que lleva al buscador del hero y deja el cursor en el campo. */
export function IrAlBuscador({
  idCampo,
  children,
  className = "",
}: {
  idCampo: string;
  children: ReactNode;
  className?: string;
}) {
  function alPulsar(e: MouseEvent<HTMLAnchorElement>) {
    const campo = document.getElementById(idCampo);
    if (!(campo instanceof HTMLInputElement)) return;
    e.preventDefault();
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    campo.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "center" });
    campo.focus({ preventScroll: true });
  }

  return (
    <a href={`#${idCampo}`} onClick={alPulsar} className={className}>
      {children}
    </a>
  );
}
