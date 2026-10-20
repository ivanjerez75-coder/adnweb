"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Clave } from "@/lib/i18n";
import { decidirSondeo, siguienteSondeo } from "@/lib/shared/polling";
import {
  estadoInforme,
  ordenSeccionesV4,
  type BloqueInforme,
  type ClaveBloque,
  type EstadoInforme,
  type EstadoSeccionVista,
  type InformeVista,
  type SeccionVista,
} from "@/lib/shared/secciones-view";
import {
  fechaCorta,
  filtroDesdeHash,
  hashDeFiltro,
  type Filtro,
} from "@/lib/shared/informe-view";
import {
  Esqueleto,
  ErrorBoundary,
  Fallida,
  IrAContext,
  Panel,
} from "./bloques/comun";
import { BloqueNegocio } from "./bloques/negocio";
import { BloqueDatos } from "./bloques/datos";
import { BloqueCompetencia } from "./bloques/competencia";
import { BloqueHallazgos } from "./bloques/hallazgos";
import { BloqueOportunidades } from "./bloques/oportunidades";

type Guardadas = Record<string, { estado: string; contenido: unknown }>;

export interface InicialInforme {
  estado: string;
  pasoActual: string | null;
  secciones: Guardadas;
}

/** Secciones del motor que pinta cada bloque: si cambia alguna, el bloque se vuelve a intentar. */
const DEPENDE: Record<ClaveBloque, (keyof InformeVista["porClave"])[]> = {
  negocio: ["anatomia", "resumen", "cobertura"],
  datos: ["datos", "resumen", "rendimiento"],
  competencia: ["competencia"],
  hallazgos: ["diagnostico", "plan", "competencia"],
  oportunidades: ["oportunidades", "diagnostico", "competencia", "plan"],
};

/**
 * Clave del ErrorBoundary: cambia con el estado y el contenido de las secciones, para que un bloque
 * que falló al pintarse se vuelva a intentar cuando el sondeo traiga contenido nuevo.
 */
export function claveContenido(partes: SeccionVista[]): string {
  let json = "";
  try {
    json =
      JSON.stringify(partes.map((s) => [s.clave, s.estado, s.contenido])) ?? "";
  } catch {
    json = "";
  }
  let h = 0;
  for (let i = 0; i < json.length; i++)
    h = (Math.imul(h, 31) + json.charCodeAt(i)) | 0;
  return `${json.length}:${h >>> 0}`;
}

const PILDORA: Record<EstadoInforme, { clave: Clave; clase: string }> = {
  completo: {
    clave: "informe.estadoCompleto",
    clase: "bg-teal-claro text-teal",
  },
  generando: {
    clave: "informe.estadoGenerando",
    clase: "bg-superficie-2 text-grafito border border-borde",
  },
  parcial: { clave: "informe.estadoParcial", clase: "bg-ambar/10 text-ambar" },
};

const PUNTO: Record<EstadoSeccionVista, { clase: string; clave: Clave }> = {
  lista: { clase: "bg-teal", clave: "informe.navLista" },
  pendiente: { clase: "bg-borde", clave: "informe.navPendiente" },
  error: { clase: "bg-rojo", clave: "informe.navError" },
};

const BOTON_SECUNDARIO =
  "inline-flex items-center justify-center gap-2 rounded-full border border-borde bg-superficie px-5 py-2 text-sm font-semibold text-grafito transition-colors hover:bg-superficie-2";

/** "Volver a analizar": lleva al panel con la URL ya escrita; el usuario confirma allí (gasta un crédito). */
export function VolverAnalizar({ dominio }: { dominio: string }) {
  return (
    <Link
      href={`/dashboard?url=${encodeURIComponent(dominio)}`}
      className={BOTON_SECUNDARIO}
    >
      <span aria-hidden="true">↻</span> {t("informe.volverAnalizar")}
    </Link>
  );
}

function Cabecera({
  nombre,
  dominio,
  fecha,
  estado,
}: {
  nombre: string;
  dominio: string;
  fecha: string;
  estado: EstadoInforme;
}) {
  const p = PILDORA[estado];
  return (
    <header className="flex flex-col gap-4 border-b border-borde pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.92] font-extrabold tracking-[-0.005em] break-words text-grafito uppercase">
          {nombre}
        </h1>
        <p className="mt-2 text-sm text-suave">
          <a
            href={`https://${dominio}`}
            rel="noopener noreferrer"
            target="_blank"
            className="underline decoration-borde underline-offset-2 hover:decoration-teal"
          >
            {dominio}
          </a>
          {fecha && <> · {fecha}</>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span
          role="status"
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${p.clase}`}
        >
          {t(p.clave)}
        </span>
        <VolverAnalizar dominio={dominio} />
      </div>
    </header>
  );
}

function irAlBloque(ancla: string) {
  document.getElementById(ancla)?.scrollIntoView({ block: "start" });
}

function Navegacion({
  bloques,
  movil,
}: {
  bloques: BloqueInforme[];
  movil: boolean;
}) {
  const enlace = (b: BloqueInforme, compacto: boolean) => (
    <a
      href={`#${b.ancla}`}
      onClick={(e) => {
        // El hash guarda el filtro: se navega sin tocarlo.
        e.preventDefault();
        irAlBloque(b.ancla);
      }}
      className={
        compacto
          ? "flex shrink-0 items-center gap-2 rounded-full border border-borde bg-superficie px-3 py-1.5 text-sm font-semibold whitespace-nowrap"
          : "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-superficie"
      }
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[b.estado].clase}`}
      />
      <span className="font-display font-extrabold text-suave">{b.numero}</span>
      <span className="font-semibold">{b.titulo}</span>
      <span className="sr-only">({t(PUNTO[b.estado].clave)})</span>
    </a>
  );
  return movil ? (
    <nav
      aria-label={t("informe.navTitulo")}
      className="sticky top-0 z-10 -mx-4 mt-4 overflow-x-auto bg-fondo/95 px-4 py-2 backdrop-blur lg:hidden"
    >
      <ul className="flex gap-2">
        {bloques.map((b) => (
          <li key={b.clave}>{enlace(b, true)}</li>
        ))}
      </ul>
    </nav>
  ) : (
    <nav
      aria-label={t("informe.navTitulo")}
      className="sticky top-6 hidden lg:block"
    >
      <p className="mb-2 px-2 text-xs font-semibold tracking-[0.08em] text-suave uppercase">
        {t("informe.navTitulo")}
      </p>
      <ul className="space-y-0.5">
        {bloques.map((b) => (
          <li key={b.clave}>{enlace(b, false)}</li>
        ))}
      </ul>
    </nav>
  );
}

function Bloque({ b, children }: { b: BloqueInforme; children: ReactNode }) {
  return (
    <section
      id={b.ancla}
      aria-labelledby={`${b.ancla}-titulo`}
      className="scroll-mt-16 lg:scroll-mt-6"
    >
      <div className="mb-3">
        <p className="font-display text-sm font-extrabold tracking-[0.08em] text-teal">
          {b.numero}
        </p>
        <h2
          id={`${b.ancla}-titulo`}
          className="font-display text-[clamp(1.75rem,3.6vw,2.5rem)] leading-none font-extrabold text-grafito uppercase"
        >
          {b.titulo}
        </h2>
        <p className="mt-1 text-[15px] text-suave">{b.pregunta}</p>
      </div>
      <Panel>{children}</Panel>
    </section>
  );
}

export function Informe({
  id,
  createdAt,
  dominio,
  inicial,
}: {
  id: string;
  createdAt: string;
  dominio: string;
  inicial: InicialInforme;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial.estado);
  const [paso, setPaso] = useState(inicial.pasoActual);
  const [secciones, setSecciones] = useState<Guardadas>(
    inicial.secciones ?? {},
  );
  const [ahora, setAhora] = useState(() => new Date());
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltroEstado] = useState<Filtro>("todo");

  const vista = ordenSeccionesV4(secciones, createdAt, ahora);
  const sc = vista.porClave;
  const procesando = estado === "procesando";
  const seguir =
    procesando ||
    vista.bloques.some((b) => b.estado === "pendiente") ||
    Object.values(sc).some((s) => s.estado === "pendiente");

  // ---------- Sondeo ----------
  useEffect(() => {
    if (!seguir) return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallos = 0;

    async function sondear(intento: number) {
      let status = 0;
      let errorApi: string | undefined;
      try {
        const res = await fetch(`/api/analisis/${id}`, { cache: "no-store" });
        status = res.status;
        const d = (await res.json().catch(() => ({}))) as {
          estado?: string;
          pasoActual?: string | null;
          error?: string | null;
          secciones?: Guardadas;
        };
        if (res.ok) {
          if (cancelado) return;
          setEstado(d.estado ?? "procesando");
          setPaso(d.pasoActual ?? null);
          if (d.secciones && typeof d.secciones === "object")
            setSecciones(d.secciones);
          setAhora(new Date());
          if (d.estado === "error") {
            router.refresh();
            return;
          }
        } else if (typeof d.error === "string") {
          errorApi = d.error;
        }
      } catch {
        status = 0;
      }
      if (cancelado) return;

      const dec = decidirSondeo(status, intento, fallos);
      fallos = status >= 200 && status < 300 ? 0 : fallos + 1;
      if (dec.accion === "refrescar") {
        router.refresh();
        return;
      }
      setAviso(
        dec.mensaje
          ? dec.accion === "seguir" && errorApi
            ? errorApi
            : dec.mensaje
          : null,
      );
      if (dec.accion === "parar") return;
      timer = setTimeout(() => void sondear(intento + 1), dec.espera);
    }

    timer = setTimeout(() => void sondear(0), siguienteSondeo(0)!);
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, router, seguir]);

  // El reloj avanza aunque no lleguen respuestas, para que las secciones colgadas pasen a error.
  useEffect(() => {
    if (!seguir) return;
    const timer = setInterval(() => setAhora(new Date()), 10_000);
    return () => clearInterval(timer);
  }, [seguir]);

  // ---------- Filtro en el hash ----------
  useEffect(() => {
    const leer = () => setFiltroEstado(filtroDesdeHash(window.location.hash));
    leer();
    window.addEventListener("hashchange", leer);
    return () => window.removeEventListener("hashchange", leer);
  }, []);

  const setFiltro = useCallback((f: Filtro) => {
    setFiltroEstado(f);
    const { pathname, search } = window.location;
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}${hashDeFiltro(f)}`,
    );
  }, []);

  // ---------- Ver origen ----------
  const irA = useCallback(
    (ancla: string) => {
      const mostrar = (el: HTMLElement) => {
        for (
          let d = el.closest("details");
          d;
          d = d.parentElement?.closest("details") ?? null
        )
          d.open = true;
        if (el instanceof HTMLDetailsElement) el.open = true;
        const suave = !window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches;
        el.scrollIntoView({
          behavior: suave ? "smooth" : "auto",
          block: "center",
        });
        el.classList.remove("resaltado");
        void el.offsetWidth; // reinicia la animación si se pulsa dos veces
        el.classList.add("resaltado");
        window.setTimeout(() => el.classList.remove("resaltado"), 1900);
      };
      const el = document.getElementById(ancla);
      if (el) return mostrar(el);
      // El filtro lo oculta: se quita y se vuelve a buscar tras pintar.
      setFiltro("todo");
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          const otra = document.getElementById(ancla);
          if (otra) mostrar(otra);
        }),
      );
    },
    [setFiltro],
  );

  // ---------- Contenido ----------
  const resumen = sc.resumen.estado === "lista" ? sc.resumen.contenido : null;
  const anatomia =
    sc.anatomia.estado === "lista" ? sc.anatomia.contenido : null;
  const lista = (s: SeccionVista) =>
    s.estado === "lista" ? s.contenido : null;
  const r = (resumen ?? {}) as { nombre?: string; fecha?: string };
  const a = (anatomia ?? {}) as { nombre?: string };
  const nombre =
    (typeof r.nombre === "string" && r.nombre.trim()) ||
    (typeof a.nombre === "string" && a.nombre.trim()) ||
    dominio;
  const fecha = fechaCorta(r.fecha ?? createdAt);

  const cuerpo = (b: BloqueInforme): ReactNode => {
    if (b.estado === "pendiente") return <Esqueleto />;
    if (b.estado === "error") return <Fallida />;
    switch (b.clave) {
      case "negocio":
        return (
          <BloqueNegocio
            anatomia={anatomia}
            resumen={resumen}
            cobertura={lista(sc.cobertura)}
            resumenPendiente={sc.resumen.estado === "pendiente"}
          />
        );
      case "datos":
        return (
          <BloqueDatos
            datos={lista(sc.datos)}
            resumen={resumen}
            rendimiento={lista(sc.rendimiento)}
          />
        );
      case "competencia":
        return (
          <BloqueCompetencia
            competencia={lista(sc.competencia)}
            nombre={nombre === dominio ? undefined : nombre}
          />
        );
      case "hallazgos":
        return (
          <BloqueHallazgos
            diagnostico={lista(sc.diagnostico)}
            plan={lista(sc.plan)} competencia={lista(sc.competencia)} filtro={filtro}
            onFiltro={setFiltro}
          />
        );
      case "oportunidades":
        return (
          <BloqueOportunidades
            oportunidades={lista(sc.oportunidades)}
            diagnostico={lista(sc.diagnostico)}
            competencia={lista(sc.competencia)}
            plan={lista(sc.plan)}
          />
        );
    }
  };

  const sinNada = Object.values(sc).every((s) => s.estado === "pendiente");

  return (
    <IrAContext.Provider value={irA}>
      <Cabecera
        nombre={nombre}
        dominio={dominio}
        fecha={fecha}
        estado={estadoInforme(vista, procesando)}
      />
      {sinNada && procesando && (
        <p role="status" className="mt-4 text-sm text-suave">
          {paso ?? t("informe.preparando")}
        </p>
      )}
      {aviso && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-ambar/10 px-4 py-2 text-sm text-ambar"
        >
          {aviso}
        </p>
      )}
      <Navegacion bloques={vista.bloques} movil />
      <div className="mt-4 grid gap-6 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_210px] lg:gap-10">
        <aside className="hidden lg:order-2 lg:block">
          <Navegacion bloques={vista.bloques} movil={false} />
        </aside>
        <div className="space-y-12 lg:order-1">
          {vista.bloques.map((b) => (
            <Bloque key={b.clave} b={b}>
              <ErrorBoundary
                key={claveContenido(DEPENDE[b.clave].map((k) => sc[k]))}
              >
                {cuerpo(b)}
              </ErrorBoundary>
            </Bloque>
          ))}
        </div>
      </div>
    </IrAContext.Provider>
  );
}
