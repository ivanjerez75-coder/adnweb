"use client";

import type { Competencia } from "@/lib/engine/v3/sections/competencia";
import type { Diagnostico } from "@/lib/engine/v3/sections/diagnostico";
import type { Criterios, Oportunidad } from "@/lib/engine/v3/sections/oportunidades";
import type { Accion, Plan } from "@/lib/engine/v3/sections/plan";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { t, type Clave } from "@/lib/i18n";
import { accionesDeOportunidad, anclaOportunidad, arr, ordenarOportunidades, resolverOrigen, tipoOrigen } from "@/lib/shared/informe-view";
import { Clase, Rotulo, VerOrigen, VerPrueba } from "./comun";

const PRIORIDAD: Record<string, { clave: Clave; clase: string }> = {
  alta: { clave: "informe.oportunidades.prioridadAlta", clase: "bg-teal text-white" },
  media: { clave: "informe.oportunidades.prioridadMedia", clase: "bg-teal-claro text-teal" },
  baja: { clave: "informe.oportunidades.prioridadBaja", clase: "bg-superficie-2 text-suave" },
};
const TIPOLOGIA: Record<string, Clave> = {
  mejorar: "informe.oportunidades.mejorar",
  diferenciarse: "informe.oportunidades.diferenciarse",
  complementario: "informe.oportunidades.complementario",
  nuevo_mercado: "informe.oportunidades.nuevo_mercado",
};
const ESTADO: Record<string, Clave> = { detectada: "informe.oportunidades.detectada", por_validar: "informe.oportunidades.por_validar" };
const CRITERIOS: [keyof Criterios, Clave][] = [
  ["impacto", "informe.oportunidades.impacto"],
  ["evidencia", "informe.oportunidades.evidenciaCriterio"],
  ["viabilidad", "informe.oportunidades.viabilidad"],
  ["diferenciacion", "informe.oportunidades.diferenciacion"],
  ["facilidadValidacion", "informe.oportunidades.facilidadValidacion"],
];
const NIVEL: Record<string, { n: number; clave: Clave }> = {
  alto: { n: 3, clave: "informe.oportunidades.alto" },
  medio: { n: 2, clave: "informe.oportunidades.medio" },
  bajo: { n: 1, clave: "informe.oportunidades.bajo" },
};
const GRUPO: Record<string, Clave> = { comprobar: "informe.plan.comprobar", experimentar: "informe.plan.experimentar", medir: "informe.plan.medir" };

function CriteriosFila({ c }: { c: Partial<Criterios> | undefined }) {
  if (!c) return null;
  return (
    <div className="mt-4">
      <Rotulo>{t("informe.oportunidades.criterios")}</Rotulo>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {CRITERIOS.map(([k, clave]) => {
          const nivel = NIVEL[c[k] ?? ""];
          if (!nivel) return null;
          return (
            <li key={k} className="flex items-center gap-1.5">
              <span>{t(clave)}</span>
              <span aria-hidden="true" className="flex gap-0.5">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={`h-2 w-2 rounded-full ${i <= nivel.n ? "bg-teal" : "bg-borde"}`} />
                ))}
              </span>
              <span className="sr-only">{t(nivel.clave)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AccionVista({ a }: { a: Accion }) {
  return (
    <li className="rounded-lg bg-superficie-2 p-3 text-[15px]">
      <p className="font-semibold">{a.tarea}</p>
      {a.porQue && <p className="mt-1 text-sm">{a.porQue}</p>}
      {arr<string>(a.recursos).length > 0 && (
        <p className="mt-1 text-sm text-suave">
          {t("informe.plan.recursos")}: {arr<string>(a.recursos).join(", ")}
        </p>
      )}
      {a.indicador && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">{t("informe.plan.indicador")}:</span> {a.indicador}
        </p>
      )}
      {a.criterio && (
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          {(
            [
              ["continuar", "informe.plan.continuar"],
              ["modificar", "informe.plan.modificar"],
              ["descartar", "informe.plan.descartar"],
            ] as const
          ).map(([k, clave]) =>
            a.criterio[k] ? (
              <div key={k}>
                <dt className="text-xs font-semibold text-suave">{t(clave)}</dt>
                <dd>{a.criterio[k]}</dd>
              </div>
            ) : null,
          )}
        </dl>
      )}
    </li>
  );
}

function ComoValidar({ plan, id }: { plan: Partial<Plan> | null; id: string }) {
  const grupos = accionesDeOportunidad(plan, id);
  return (
    <div className="mt-5 border-t border-borde pt-4">
      <Rotulo>{t("informe.oportunidades.comoValidar")}</Rotulo>
      {grupos.length === 0 ? (
        <p className="mt-1 text-sm text-suave">{t("informe.oportunidades.sinAcciones")}</p>
      ) : (
        <ol className="mt-2 space-y-4">
          {grupos.map((g, i) => (
            <li key={g.grupo}>
              <p className="font-display text-base font-extrabold tracking-[0.02em] uppercase">
                <span className="text-suave">{i + 1}.</span> {t(GRUPO[g.grupo])}
              </p>
              <ul className="mt-1.5 space-y-2">
                {g.acciones.map((a) => (
                  <AccionVista key={a.id} a={a} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Tarjeta({
  o,
  diagnostico,
  competencia,
  plan,
}: {
  o: Oportunidad;
  diagnostico: Partial<Diagnostico> | null;
  competencia: Partial<Competencia> | null;
  plan: Partial<Plan> | null;
}) {
  const p = PRIORIDAD[o.prioridad];
  const f = o.ficha ?? ({} as Partial<Oportunidad["ficha"]>);
  const origenes = arr<string>(o.origen)
    .map((id) => ({ id, ancla: resolverOrigen(id, diagnostico, competencia), tipo: tipoOrigen(id) }))
    .filter((x): x is { id: string; ancla: string; tipo: Clave | null } => x.ancla !== null);
  return (
    <article id={anclaOportunidad(o.id)} className="scroll-mt-24 rounded-[14px] border border-borde bg-superficie p-5">
      <div className="flex flex-wrap items-center gap-2">
        {p && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.clase}`}>{t(p.clave)}</span>}
        {TIPOLOGIA[o.tipologia] && <span className="text-xs font-semibold tracking-[0.08em] text-suave uppercase">{t(TIPOLOGIA[o.tipologia])}</span>}
        <span className="ml-auto flex items-center gap-2">
          {ESTADO[o.estado] && <Etiqueta tono="neutro">{t(ESTADO[o.estado])}</Etiqueta>}
          <Clase clase="hipotesis" />
        </span>
      </div>
      <h4 className="mt-2 text-lg leading-snug font-semibold">{o.titulo}</h4>
      <dl className="mt-3 space-y-2.5 text-[15px] leading-relaxed">
        {f.evidencia?.texto && (
          <div>
            <dt className="text-xs font-semibold text-suave">1. {t("informe.oportunidades.evidencia")}</dt>
            <dd>
              {f.evidencia.texto}
              <VerPrueba evidencias={f.evidencia.evidencias} />
            </dd>
          </div>
        )}
        {f.problema && (
          <div>
            <dt className="text-xs font-semibold text-suave">2. {t("informe.oportunidades.problema")}</dt>
            <dd>{f.problema}</dd>
          </div>
        )}
        {f.solucion && (
          <div>
            <dt className="text-xs font-semibold text-suave">3. {t("informe.oportunidades.solucion")}</dt>
            <dd>{f.solucion}</dd>
          </div>
        )}
        {f.porQuePodria && (
          <div>
            <dt className="text-xs font-semibold text-suave">4. {t("informe.oportunidades.porQuePodria")}</dt>
            <dd>{f.porQuePodria}</dd>
          </div>
        )}
        {arr<string>(f.faltaComprobar).length > 0 && (
          <div>
            <dt className="text-xs font-semibold text-suave">5. {t("informe.oportunidades.faltaComprobar")}</dt>
            <dd>
              <ul className="list-disc space-y-1 pl-5">
                {arr<string>(f.faltaComprobar).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
      <CriteriosFila c={o.criterios} />
      {origenes.length > 0 && (
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
          {origenes.map((x) => (
            <VerOrigen key={x.id} ancla={x.ancla} etiqueta={`${t("informe.verOrigen")}${x.tipo ? `: ${t(x.tipo).toLowerCase()}` : ""}`} />
          ))}
        </p>
      )}
      <ComoValidar plan={plan} id={o.id} />
    </article>
  );
}

/** Bloque 05: qué podemos mejorar, construir o investigar. */
export function BloqueOportunidades({
  oportunidades,
  diagnostico,
  competencia,
  plan,
}: {
  oportunidades: unknown;
  diagnostico: unknown;
  competencia: unknown;
  plan: unknown;
}) {
  const lista = ordenarOportunidades(oportunidades);
  if (lista.length === 0) return <p className="text-suave">{t("informe.oportunidades.vacio")}</p>;
  const d = (diagnostico ?? null) as Partial<Diagnostico> | null;
  const c = (competencia ?? null) as Partial<Competencia> | null;
  const p = (plan ?? null) as Partial<Plan> | null;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {lista.map((o) => (
        <Tarjeta key={o.id} o={o} diagnostico={d} competencia={c} plan={p} />
      ))}
    </div>
  );
}
