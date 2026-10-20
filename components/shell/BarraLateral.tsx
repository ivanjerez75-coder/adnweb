"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type Clave } from "@/lib/i18n";
import type { AnalisisResumen } from "@/lib/server/analyses/repo";
import { agruparRecientes, filtrarRecientes } from "@/lib/shared/recientes";
import { EstadoPunto } from "./EstadoPunto";
import { IconoAjustes, IconoBuscar, IconoCerrar, IconoNuevo, IconoPanel } from "./iconos";

export interface DatosBarra {
  recientes: AnalisisResumen[];
  /** null si no se pudo leer el perfil. */
  creditos: { restantes: number; mensuales: number } | null;
}

// --- Preferencia "barra plegada", guardada en localStorage -----------------
const CLAVE_PLEGADA = "adnweb.barraPlegada";
const EVENTO_PLEGADA = "adnweb:barra-plegada";

function leerPlegada(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_PLEGADA) === "1";
  } catch {
    return false;
  }
}

function guardarPlegada(valor: boolean) {
  try {
    window.localStorage.setItem(CLAVE_PLEGADA, valor ? "1" : "0");
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): la preferencia dura lo que la página.
  }
  window.dispatchEvent(new Event(EVENTO_PLEGADA));
}

function suscribirPlegada(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO_PLEGADA, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO_PLEGADA, aviso);
  };
}

const sinSuscripcion = () => () => {};

// ---------------------------------------------------------------------------

const GRUPOS: { clave: "hoy" | "ultimos7" | "anteriores"; titulo: Clave }[] = [
  { clave: "hoy", titulo: "barra.hoy" },
  { clave: "ultimos7", titulo: "barra.ultimos7" },
  { clave: "anteriores", titulo: "barra.anteriores" },
];

const botonIcono =
  "flex h-9 w-9 items-center justify-center rounded-lg text-grafito transition-colors hover:bg-borde/50";

type Props = DatosBarra & {
  /** "fija": barra de escritorio, plegable. "cajon": dentro del menú móvil. */
  modo: "fija" | "cajon";
  /** En el cajón: cerrar (botón X o al elegir un enlace). */
  alCerrar?: () => void;
};

export function BarraLateral({ recientes, creditos, modo, alCerrar }: Props) {
  const pathname = usePathname();
  const idBusqueda = useId();
  const refBusqueda = useRef<HTMLInputElement>(null);
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState("");

  // En el servidor y en la hidratación la barra está desplegada; luego se aplica la preferencia.
  const plegadaGuardada = useSyncExternalStore(suscribirPlegada, leerPlegada, () => false);
  const plegada = modo === "fija" && plegadaGuardada;
  // Los grupos dependen de la hora local del navegador: solo se calculan ya montados.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  const filtrados = filtrarRecientes(recientes, buscando ? texto : "");
  const grupos = montado ? agruparRecientes(filtrados, new Date()) : null;

  function alternarBusqueda() {
    if (plegada) {
      guardarPlegada(false);
      setBuscando(true);
    } else if (buscando) {
      setBuscando(false);
      setTexto("");
      return;
    } else {
      setBuscando(true);
    }
    // Espera al render que muestra el campo.
    requestAnimationFrame(() => refBusqueda.current?.focus());
  }

  const alNavegar = modo === "cajon" ? alCerrar : undefined;

  const enlaceItem = (a: AnalisisResumen) => {
    const href = `/analisis/${a.id}`;
    const actual = pathname === href;
    return (
      <li key={a.id}>
        <Link
          href={href}
          onClick={alNavegar}
          aria-current={actual ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
            actual ? "bg-superficie font-semibold text-grafito shadow-sm" : "text-grafito hover:bg-borde/40"
          }`}
        >
          <EstadoPunto estado={a.estado} />
          <span className="min-w-0 truncate">{a.dominio}</span>
        </Link>
      </li>
    );
  };

  return (
    <div
      className={`flex h-full flex-col bg-fondo ${
        modo === "fija"
          ? `${plegada ? "w-[72px]" : "w-[260px]"} transition-[width] duration-200 motion-reduce:transition-none`
          : "w-full"
      }`}
    >
      {/* Cabecera: buscar y plegar, arriba a la derecha (diseño del usuario). */}
      <div className={`flex items-center gap-1 px-3 pt-4 pb-2 ${plegada ? "flex-col" : "justify-end"}`}>
        {modo === "fija" && (
          <button
            type="button"
            onClick={() => guardarPlegada(!plegada)}
            aria-label={plegada ? t("barra.desplegar") : t("barra.plegar")}
            aria-expanded={!plegada}
            title={plegada ? t("barra.desplegar") : t("barra.plegar")}
            className={`${botonIcono} ${plegada ? "" : "order-2"}`}
          >
            <IconoPanel />
          </button>
        )}
        <button
          type="button"
          onClick={alternarBusqueda}
          aria-label={t("panel.buscar")}
          aria-expanded={buscando && !plegada}
          aria-controls={buscando && !plegada ? idBusqueda : undefined}
          title={t("panel.buscar")}
          className={`${botonIcono} ${buscando && !plegada ? "bg-borde/50" : ""}`}
        >
          <IconoBuscar />
        </button>
        {modo === "cajon" && (
          <button type="button" onClick={alCerrar} aria-label={t("barra.cerrarMenu")} className={`${botonIcono} order-3`}>
            <IconoCerrar />
          </button>
        )}
      </div>

      {buscando && !plegada && (
        <div className="px-3 pb-2">
          <input
            ref={refBusqueda}
            id={idBusqueda}
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setBuscando(false);
                setTexto("");
              }
            }}
            placeholder={t("barra.buscarPlaceholder")}
            aria-label={t("panel.buscar")}
            className="w-full rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm text-grafito placeholder:text-suave focus:border-teal focus:outline-none"
          />
        </div>
      )}

      <nav aria-label={t("barra.navegacion")} className="px-3">
        <Link
          href="/dashboard"
          onClick={alNavegar}
          aria-current={pathname === "/dashboard" ? "page" : undefined}
          title={plegada ? t("panel.nuevo") : undefined}
          className={`flex items-center gap-3 rounded-lg py-2 text-[0.9375rem] font-medium text-grafito transition-colors hover:bg-borde/40 ${
            plegada ? "justify-center px-0" : "px-3"
          }`}
        >
          <IconoNuevo />
          <span className={plegada ? "sr-only" : ""}>{t("panel.nuevo")}</span>
        </Link>
      </nav>

      {/* Recientes */}
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!plegada && (
          <section aria-labelledby={`${idBusqueda}-recientes`}>
            <h2
              id={`${idBusqueda}-recientes`}
              className="px-3 pb-1 text-xs font-semibold tracking-[0.12em] text-suave uppercase"
            >
              {t("panel.recientes")}
            </h2>
            {recientes.length === 0 ? (
              <p className="px-3 py-1.5 text-sm text-suave">{t("panel.sinRecientes")}</p>
            ) : filtrados.length === 0 ? (
              <p className="px-3 py-1.5 text-sm text-suave" role="status">
                {t("barra.sinResultados")}
              </p>
            ) : grupos ? (
              GRUPOS.filter((g) => grupos[g.clave].length > 0).map((g) => (
                <div key={g.clave} className="mt-2">
                  <h3 className="px-3 py-1 text-xs font-medium text-suave">{t(g.titulo)}</h3>
                  <ul>{grupos[g.clave].map(enlaceItem)}</ul>
                </div>
              ))
            ) : (
              <ul className="mt-2">{filtrados.map(enlaceItem)}</ul>
            )}
            {recientes.length > 0 && (
              <Link
                href="/historial"
                onClick={alNavegar}
                className="mt-2 block rounded-lg px-3 py-1.5 text-sm font-medium text-teal hover:bg-borde/40"
              >
                {t("barra.verHistorial")}
              </Link>
            )}
          </section>
        )}
      </div>

      {/* Pie: créditos y ajustes */}
      <div className="border-t border-borde px-3 py-3">
        {creditos && !plegada && (
          <p className="px-3 pb-2 text-sm text-suave">
            {t("barra.creditos", { n: creditos.restantes, total: creditos.mensuales })}
          </p>
        )}
        <Link
          href="/cuenta"
          onClick={alNavegar}
          aria-current={pathname === "/cuenta" ? "page" : undefined}
          title={plegada ? t("barra.ajustes") : undefined}
          className={`flex items-center gap-3 rounded-lg py-2 text-[0.9375rem] font-medium text-grafito transition-colors hover:bg-borde/40 ${
            plegada ? "justify-center px-0" : "px-3"
          }`}
        >
          <IconoAjustes />
          <span className={plegada ? "sr-only" : ""}>{t("barra.ajustes")}</span>
        </Link>
      </div>
    </div>
  );
}
