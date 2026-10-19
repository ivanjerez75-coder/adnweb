"use client";

import { Component, createContext, useContext, type ReactNode } from "react";
import type { Evidence } from "@/lib/engine/v3/evidence";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { t } from "@/lib/i18n";
import { arr, esHttp, etiquetaClase } from "@/lib/shared/informe-view";

/** Lleva a un ancla de la página (abre desplegables, limpia el filtro si la oculta y la resalta). */
export const IrAContext = createContext<(ancla: string) => void>(() => {});
export const useIrA = () => useContext(IrAContext);

/** Panel blanco del informe. */
export function Panel({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`rounded-[14px] border border-borde bg-superficie p-5 sm:p-7 ${className}`}>
      {children}
    </div>
  );
}

/** Rótulo pequeño en mayúsculas para los subapartados. */
export function Rotulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold tracking-[0.08em] text-suave uppercase ${className}`}>{children}</p>;
}

export function Subtitulo({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="font-display text-xl leading-tight font-extrabold tracking-[0.01em] text-grafito uppercase">
      {children}
    </h3>
  );
}

/** Etiqueta de clase de dato (Observado, Fuente externa, Inferencia, Hipótesis). */
export function Clase({ clase }: { clase: unknown }) {
  const e = etiquetaClase(clase);
  if (!e) return null;
  return <Etiqueta tono={e.tono}>{t(e.clave)}</Etiqueta>;
}

/** Enlace externo seguro (solo http/https); si no, texto plano. */
export function EnlaceExterno({ href, children, className = "" }: { href: string | null | undefined; children: ReactNode; className?: string }) {
  if (!esHttp(href)) return <span className={className}>{children}</span>;
  return (
    <a href={href} rel="noopener noreferrer" target="_blank" className={`underline decoration-borde underline-offset-2 hover:decoration-teal ${className}`}>
      {children}
    </a>
  );
}

function nombreFuente(e: Evidence): string {
  if (esHttp(e.url)) {
    try {
      const u = new URL(e.url);
      return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
    } catch {
      /* cae al texto de la fuente */
    }
  }
  return e.fuente;
}

/** Una cita literal: serif cursiva, borde teal. El texto nunca se filtra ni se reescribe. */
function Cita({ e }: { e: Evidence }) {
  const literal = e.tipo === "pagina";
  return (
    <li>
      <blockquote className="border-l-[3px] border-teal bg-superficie-2 px-4 py-2.5">
        <p className={literal ? "font-cita text-[15px] leading-relaxed text-grafito italic" : "text-sm text-grafito"}>
          {literal ? <>«{e.texto}»</> : e.texto}
        </p>
        <footer className="mt-1 text-xs text-suave">
          {t("informe.fuente")}: <EnlaceExterno href={e.url}>{nombreFuente(e)}</EnlaceExterno>
        </footer>
      </blockquote>
    </li>
  );
}

/** "Ver prueba": desplegable con las citas literales y sus fuentes. */
export function VerPrueba({ evidencias, className = "" }: { evidencias: Evidence[] | undefined; className?: string }) {
  const lista = arr<Evidence>(evidencias).filter((e) => e && typeof e.texto === "string");
  if (lista.length === 0) return null;
  return (
    <details className={`group mt-2 ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-teal select-none hover:underline [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ›
        </span>
        {lista.length === 1 ? t("informe.verPrueba") : t("informe.verPruebas", { n: lista.length })}
      </summary>
      <ul className="mt-2 space-y-2">
        {lista.map((e, i) => (
          <Cita key={`${e.id}-${i}`} e={e} />
        ))}
      </ul>
    </details>
  );
}

/** Zona desplegable para el material detallado (tablas completas, metodología, fuentes). */
export function Desplegable({ titulo, children, id }: { titulo: string; children: ReactNode; id?: string }) {
  return (
    <details id={id} className="group mt-6 rounded-xl border border-borde bg-superficie">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 font-semibold text-grafito select-none hover:bg-superficie-2 [&::-webkit-details-marker]:hidden">
        <span>{titulo}</span>
        <span aria-hidden="true" className="text-lg text-suave transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="border-t border-borde px-5 py-5">{children}</div>
    </details>
  );
}

/** Lista de textos sencillos; nada si está vacía. */
export function ListaTextos({ items, className = "" }: { items: unknown; className?: string }) {
  const xs = arr<string>(items).filter((s) => typeof s === "string" && s.trim());
  if (xs.length === 0) return null;
  return (
    <ul className={`list-disc space-y-1 pl-5 ${className}`}>
      {xs.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

/** Esqueleto de un bloque que se está generando. */
export function Esqueleto() {
  return (
    <div role="status" aria-live="polite">
      <p className="text-sm font-semibold text-suave">{t("informe.generando")}</p>
      <div aria-hidden="true" className="mt-4 space-y-3">
        <div className="h-5 w-3/4 animate-pulse rounded bg-superficie-2 motion-reduce:animate-none" />
        <div className="h-5 w-2/3 animate-pulse rounded bg-superficie-2 motion-reduce:animate-none" />
        <div className="h-24 animate-pulse rounded-xl bg-superficie-2 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function Fallida() {
  return <p className="text-suave">{t("informe.seccionFallida")}</p>;
}

/** Un bloque con contenido mal formado no debe tumbar el resto de la página. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  render() {
    return this.state.fallo ? <Fallida /> : this.props.children;
  }
}

/** Enlace "Ver origen" que lleva al hallazgo o a la fila de la comparación. */
export function VerOrigen({ ancla, etiqueta }: { ancla: string; etiqueta?: string }) {
  const irA = useIrA();
  return (
    <a
      href={`#${ancla}`}
      onClick={(e) => {
        e.preventDefault();
        irA(ancla);
      }}
      className="inline-flex items-center gap-1 text-sm font-semibold text-teal hover:underline"
    >
      {etiqueta ?? t("informe.verOrigen")} <span aria-hidden="true">↗</span>
    </a>
  );
}
