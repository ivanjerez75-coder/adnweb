"use client";

import type { Diagnostico } from "@/lib/engine/v3/sections/diagnostico";
import type { Plan } from "@/lib/engine/v3/sections/plan";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { t, type Clave } from "@/lib/i18n";
import {
  anclaHallazgo,
  arr,
  FILTROS,
  filtrarHallazgos,
  tarjetasHallazgos,
  type Filtro,
  type TarjetaHallazgo,
  type TipoTarjeta,
} from "@/lib/shared/informe-view";
import { Clase, Rotulo, Subtitulo, VerPrueba } from "./comun";

const FILTRO: Record<Filtro, Clave> = {
  todo: "informe.filtros.todo",
  fortalezas: "informe.filtros.fortalezas",
  debilidades: "informe.filtros.debilidades",
  riesgos: "informe.filtros.riesgos",
  fricciones: "informe.filtros.fricciones",
};

/** Acento superior de 4 px: rojo y ámbar solo para problemas reales. */
const GRUPO: Record<TipoTarjeta, { titulo: Clave; tipo: Clave; acento: string; texto: string }> = {
  fortaleza: { titulo: "informe.diagnostico.fortalezas", tipo: "informe.hallazgo.fortaleza", acento: "border-t-teal", texto: "text-teal" },
  debilidad: { titulo: "informe.diagnostico.debilidades", tipo: "informe.hallazgo.debilidad", acento: "border-t-rojo", texto: "text-rojo" },
  riesgo: { titulo: "informe.diagnostico.riesgos", tipo: "informe.hallazgo.riesgo", acento: "border-t-ambar", texto: "text-ambar" },
  friccion: { titulo: "informe.diagnostico.fricciones", tipo: "informe.hallazgo.friccion", acento: "border-t-grafito", texto: "text-grafito" },
};
const ORDEN: TipoTarjeta[] = ["fortaleza", "debilidad", "riesgo", "friccion"];
const FRICCION: Record<string, Clave> = {
  que_compra: "informe.friccion.que_compra",
  para_quien: "informe.friccion.para_quien",
  precio: "informe.friccion.precio",
  pasos: "informe.friccion.pasos",
  objeciones: "informe.friccion.objeciones",
  confianza: "informe.friccion.confianza",
};

/** Chips de filtro; el estado vive en el hash de la URL (lo gestiona la página). */
export function Filtros({ filtro, onCambio }: { filtro: Filtro; onCambio: (f: Filtro) => void }) {
  return (
    <div role="group" aria-label={t("informe.filtros.etiqueta")} className="flex flex-wrap gap-2">
      {FILTROS.map((f) => {
        const activo = f === filtro;
        return (
          <button
            key={f}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(f)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              activo ? "border-teal bg-teal text-white" : "border-borde bg-superficie text-grafito hover:bg-superficie-2"
            }`}
          >
            {t(FILTRO[f])}
          </button>
        );
      })}
    </div>
  );
}

function Fila({ titulo, children }: { titulo: Clave; children: React.ReactNode }) {
  return (
    <div className="border-t border-borde pt-2.5">
      <dt>
        <Rotulo>{t(titulo)}</Rotulo>
      </dt>
      <dd className="mt-1 text-[15px] leading-relaxed">{children}</dd>
    </div>
  );
}

/** La tarjeta estándar: título + estado, hallazgo, evidencia, por qué importa y qué hacer. */
function Tarjeta({ h, nombreDe }: { h: TarjetaHallazgo; nombreDe: (id: string) => string }) {
  const g = GRUPO[h.tipo];
  const mostrarTexto = h.texto && h.texto !== h.titulo;
  return (
    <article id={anclaHallazgo(h.id)} className={`scroll-mt-24 rounded-xl border border-borde border-t-4 bg-superficie p-4 ${g.acento}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={`text-xs font-semibold tracking-[0.08em] uppercase ${g.texto}`}>
            {t(g.tipo)}
            {h.tipoFriccion && FRICCION[h.tipoFriccion] && <span className="text-suave"> · {t(FRICCION[h.tipoFriccion])}</span>}
          </p>
          <h4 className="mt-1 text-[17px] leading-snug font-semibold">{h.titulo}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {h.prioridad && <span className="text-xs font-semibold text-suave">{t(`informe.tarjeta.prioridad_${h.prioridad}`)}</span>}
          <Etiqueta tono={h.estado === "comprobado" ? "observado" : "hipotesis"}>{t(`informe.tarjeta.${h.estado}`)}</Etiqueta>
        </div>
      </header>
      <dl className="mt-3 space-y-2.5">
        {mostrarTexto && <Fila titulo="informe.tarjeta.hallazgo">{h.texto}</Fila>}
        {(h.frenteA || h.paraQuien) && (
          <p className="text-sm text-suave">
            {h.frenteA && (
              <>
                {t("informe.diagnostico.frenteA")}: {nombreDe(h.frenteA)}
              </>
            )}
            {h.frenteA && h.paraQuien && " · "}
            {h.paraQuien && (
              <>
                {t("informe.diagnostico.paraQuien")}: {h.paraQuien}
              </>
            )}
          </p>
        )}
        <Fila titulo="informe.tarjeta.evidencia">
          <span className="flex flex-wrap items-center gap-2">
            <Clase clase={h.clase ?? (h.tipo === "friccion" ? "inferencia" : null)} />
            {h.evidencias.length === 0 && <span className="text-sm text-suave">{t("informe.tarjeta.sinEvidencia")}</span>}
          </span>
          <VerPrueba evidencias={h.evidencias} />
        </Fila>
        {h.porQueImporta && <Fila titulo="informe.tarjeta.porQueImporta">{h.porQueImporta}</Fila>}
        {h.queHacer.length > 0 && (
          <Fila titulo="informe.tarjeta.queHacer">
            {h.queHacer.length === 1 ? (
              h.queHacer[0]
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {h.queHacer.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
          </Fila>
        )}
      </dl>
    </article>
  );
}

/** Bloque 04: qué deberíamos saber. */
export function BloqueHallazgos({
  diagnostico,
  plan,
  competencia,
  filtro,
  onFiltro,
}: {
  diagnostico: unknown;
  competencia?: unknown;
  plan: unknown;
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
}) {
  const d = (diagnostico ?? {}) as Partial<Diagnostico>;
  const tarjetas = tarjetasHallazgos(filtrarHallazgos(d, filtro), (plan ?? null) as Partial<Plan> | null);
  // "Frente a" puede ser el id de un competidor ("c1"): se muestra su nombre.
  const competidores = arr<{ id?: string; nombre?: string }>((competencia as { competidores?: unknown } | null)?.competidores);
  const nombreDe = (id: string) => competidores.find((k) => k && k.id === id)?.nombre ?? id;
  const total = tarjetasHallazgos(filtrarHallazgos(d, "todo"), null).length;
  return (
    <>
      <Filtros filtro={filtro} onCambio={onFiltro} />
      <div className="mt-6 space-y-8">
        {total === 0 && <p className="text-suave">{t("informe.tarjeta.vacio")}</p>}
        {total > 0 && tarjetas.length === 0 && <p className="text-suave">{t("informe.filtros.vacio")}</p>}
        {ORDEN.map((tipo) => {
          const delGrupo = tarjetas.filter((x) => x.tipo === tipo);
          if (delGrupo.length === 0) return null;
          return (
            <section key={tipo} aria-label={t(GRUPO[tipo].titulo)}>
              <Subtitulo>{t(GRUPO[tipo].titulo)}</Subtitulo>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {delGrupo.map((h) => (
                  <Tarjeta key={h.id} h={h} nombreDe={nombreDe} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {filtro === "todo" && d.integrado?.texto && (
        <section className="mt-8 border-t border-borde pt-6">
          <Subtitulo>{t("informe.tarjeta.conclusion")}</Subtitulo>
          <p className="mt-2 max-w-[70ch] text-[17px] leading-relaxed">{d.integrado.texto}</p>
        </section>
      )}
    </>
  );
}
