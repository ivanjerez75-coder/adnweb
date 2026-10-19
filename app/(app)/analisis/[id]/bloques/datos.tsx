"use client";

import type { Metrica } from "@/lib/engine/v3/estimates";
import type { DimensionScore, DnaScore, Indicador } from "@/lib/engine/v3/score";
import type { DimensionRendimiento, Rendimiento } from "@/lib/engine/v3/sections/rendimiento";
import { t, type Clave } from "@/lib/i18n";
import { arr, datosClave, fechaCorta, formatoNumero, sinDatosFiables, valorMetrica, type DatoClave } from "@/lib/shared/informe-view";
import { Clase, Desplegable, EnlaceExterno, ListaTextos, Rotulo, Subtitulo, VerPrueba } from "./comun";

const CONFIANZA: Record<string, string> = { alta: "alta", media: "media", baja: "baja", insuficiente: "insuficiente" };
const ESTADO_METRICA: Record<string, Clave> = {
  insuficiente: "informe.metrica.insuficiente",
  error: "informe.metrica.error",
  no_aplica: "informe.metrica.noAplica",
};

function TarjetaDato({ d }: { d: DatoClave }) {
  const largo = d.valor.length > 12;
  return (
    <li className="flex flex-col rounded-xl border border-borde bg-superficie p-4">
      <p className="text-sm font-semibold text-suave">{d.etiqueta || t("informe.datos.precioPublicado")}</p>
      <p className={`mt-1 font-display leading-none font-extrabold text-grafito ${largo ? "text-2xl" : "text-[2.5rem]"}`}>{d.valor}</p>
      {d.detalle && <p className="mt-1 text-sm text-suave">{d.detalle}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-xs text-suave">
        <Clase clase={d.clase} />
        {d.fuente && (
          <span>
            {t("informe.fuente")}: <EnlaceExterno href={d.fuenteUrl}>{d.fuente}</EnlaceExterno>
          </span>
        )}
      </div>
      <VerPrueba evidencias={d.evidencias} />
    </li>
  );
}

function MetricaDetalle({ m }: { m: Metrica }) {
  const valor = m.estado === "disponible" ? valorMetrica(m) : null;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold">{m.etiqueta}</p>
        <p className={valor ? "font-display text-xl font-extrabold" : "text-sm text-suave"}>
          {valor ?? `— ${ESTADO_METRICA[m.estado] ? t(ESTADO_METRICA[m.estado]) : ""}`}
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-suave">
        {m.estado === "disponible" && <Clase clase={m.tipo} />}
        {CONFIANZA[m.confianza] && <span>{t("informe.metrica.confianza", { n: CONFIANZA[m.confianza] })}</span>}
        <span>
          · {t("informe.fuente")}: <EnlaceExterno href={m.fuenteUrl}>{m.fuente}</EnlaceExterno>
        </span>
        {m.periodo && (
          <span>
            · {t("informe.metrica.periodo")}: {m.periodo}
          </span>
        )}
        {m.obtenidoEn && <span>· {t("informe.metrica.obtenido", { fecha: fechaCorta(m.obtenidoEn) })}</span>}
      </div>
      {m.motivoConfianza && <p className="mt-1 text-sm">{m.motivoConfianza}</p>}
      {m.metodologia && (
        <p className="mt-1 text-sm text-suave">
          <span className="font-semibold">{t("informe.metrica.metodo")}:</span> {m.metodologia}
        </p>
      )}
      {arr<string>(m.limitaciones).length > 0 && (
        <div className="mt-1 text-sm text-suave">
          <span className="font-semibold">{t("informe.metrica.limitaciones")}:</span>
          <ListaTextos items={m.limitaciones} />
        </div>
      )}
      {arr<string>(m.supuestos).length > 0 && (
        <div className="mt-1 text-sm text-suave">
          <span className="font-semibold">{t("informe.metrica.supuestos")}:</span>
          <ListaTextos items={m.supuestos} />
        </div>
      )}
    </li>
  );
}

function Dimension({ d, metricas }: { d: DimensionRendimiento; metricas: Map<string, Metrica> }) {
  const propias = arr<string>(d.metricas)
    .map((k) => metricas.get(k))
    .filter((m): m is Metrica => !!m && m.estado === "disponible");
  return (
    <div className="rounded-xl border border-borde p-4">
      <p className="font-semibold">{d.nombre}</p>
      {d.interpretacion && <p className="mt-1 text-[15px] leading-relaxed">{d.interpretacion}</p>}
      {propias.length > 0 && (
        <p className="mt-2 text-sm text-suave">{propias.map((m) => `${m.etiqueta}: ${valorMetrica(m)}`).join(" · ")}</p>
      )}
      {arr<{ id: string; texto: string }>(d.fricciones).length > 0 && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">{t("informe.rendimiento.fricciones")}:</span>
          <ListaTextos items={arr<{ texto: string }>(d.fricciones).map((x) => x.texto)} />
        </div>
      )}
      {arr<{ detalle: string }>(d.canales).length > 0 && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">{t("informe.rendimiento.canales")}:</span>
          <ListaTextos items={arr<{ detalle: string }>(d.canales).map((x) => x.detalle)} />
        </div>
      )}
    </div>
  );
}

function IndicadorScore({ i }: { i: Indicador }) {
  return (
    <li className="text-sm">
      <span className="font-semibold">{i.nombre}</span>:{" "}
      {i.aplica === false ? (
        <span className="text-suave">{t("informe.rendimiento.noAplicaTipo")}</span>
      ) : i.evaluado ? (
        <>
          {i.puntos}/{i.maximo}
          {i.motivo && <span className="text-suave"> — {i.motivo}</span>}
        </>
      ) : (
        <span className="text-suave">
          {t("informe.rendimiento.noEvaluado")}
          {i.motivo ? ` — ${i.motivo}` : ""}
        </span>
      )}
      <VerPrueba evidencias={i.evidencias} />
    </li>
  );
}

function Score({ s }: { s: DnaScore }) {
  const dims = arr<DimensionScore>(s.dimensiones);
  return (
    <section>
      <Subtitulo>{t("informe.rendimiento.score")}</Subtitulo>
      <p className="mt-2">
        <span className="font-display text-3xl font-extrabold">
          {typeof s.global === "number" ? `${s.global}/100` : t("informe.rendimiento.scoreNoDisponible")}
        </span>
        {typeof s.coberturaGlobal === "number" && (
          <span className="ml-2 text-sm text-suave">{t("informe.rendimiento.coberturaGlobal", { n: Math.round(s.coberturaGlobal * 100) })}</span>
        )}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {dims.map((k) => (
          <div key={k.clave} className="rounded-xl border border-borde p-4">
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{k.nombre}</span>
              <span className="font-display text-xl font-extrabold">{typeof k.valor === "number" ? `${k.valor}/100` : t("informe.rendimiento.noPuntuable")}</span>
            </p>
            <p className="text-xs text-suave">
              {t("informe.rendimiento.coberturaPeso", { c: Math.round((k.cobertura ?? 0) * 100), p: Math.round((k.peso ?? 0) * 100) })}
            </p>
            {k.resumen && <p className="mt-2 text-[15px]">{k.resumen}</p>}
            {arr<Indicador>(k.indicadores).length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-teal">{t("informe.rendimiento.indicadores")}</summary>
                <ul className="mt-2 space-y-2">
                  {arr<Indicador>(k.indicadores).map((i) => (
                    <IndicadorScore key={i.clave} i={i} />
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-suave">
        <span className="font-semibold">{t("informe.rendimiento.metodologia")}:</span> {s.metodologia}
      </p>
      {arr<string>(s.avisos).map((a, i) => (
        <p key={i} className="mt-1 text-xs text-suave">
          {a}
        </p>
      ))}
    </section>
  );
}

function Escenario({ hipoteticas, escenario }: { hipoteticas: Metrica[]; escenario: { clientes: number; ingresosMes: number }[] }) {
  if (hipoteticas.length === 0 && escenario.length === 0) return null;
  return (
    <section aria-labelledby="escenario-hipotetico" className="rounded-xl border-2 border-dashed border-borde p-4">
      <p className="flex items-center gap-2">
        <span id="escenario-hipotetico" className="font-semibold">
          {t("informe.anatomia.escenario")}
        </span>
        <Clase clase="hipotesis" />
      </p>
      <p className="mt-1 font-semibold">{t("informe.anatomia.escenarioAviso")}</p>
      {escenario.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {escenario.map((e) => (
            <li key={e.clientes}>{t("informe.anatomia.escenarioFila", { clientes: formatoNumero(e.clientes), importe: formatoNumero(e.ingresosMes) })}</li>
          ))}
        </ul>
      )}
      {hipoteticas.map((m) => (
        <div key={m.clave} className="mt-2 text-sm text-suave">
          <p>{m.metodologia}</p>
          <ListaTextos items={arr<string>(m.supuestos)} />
        </div>
      ))}
    </section>
  );
}

/** Bloque 02: qué sabemos realmente. */
export function BloqueDatos({ datos, resumen, rendimiento }: { datos: unknown; resumen: unknown; rendimiento: unknown }) {
  const lista = datosClave(resumen, datos);
  const faltan = sinDatosFiables(datos);
  const d = (datos ?? {}) as { metricas?: unknown; escenario?: unknown };
  const metricas = arr<Metrica>(d.metricas).filter((m) => m && typeof m === "object");
  const normales = metricas.filter((m) => m.tipo !== "hipotesis");
  const hipoteticas = metricas.filter((m) => m.tipo === "hipotesis");
  const escenario = arr<{ clientes: number; ingresosMes: number }>(d.escenario);
  const r = (rendimiento ?? null) as Partial<Rendimiento> | null;
  const porClave = new Map(metricas.map((m) => [m.clave, m]));
  return (
    <>
      {lista.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {lista.map((x) => (
            <TarjetaDato key={x.clave} d={x} />
          ))}
        </ul>
      ) : (
        <p className="text-suave">{t("informe.datos.vacio")}</p>
      )}
      {faltan.length > 0 && <p className="mt-4 text-sm text-suave">{t("informe.datos.sinFiables", { lista: faltan.join(", ") })}</p>}

      <Desplegable titulo={t("informe.datos.detalle")}>
        <div className="space-y-8">
          {normales.length > 0 && (
            <section>
              <Subtitulo>{t("informe.datos.metricas")}</Subtitulo>
              <ul className="mt-1 divide-y divide-borde">
                {normales.map((m) => (
                  <MetricaDetalle key={m.clave} m={m} />
                ))}
              </ul>
            </section>
          )}
          {r && arr<DimensionRendimiento>(r.dimensiones).length > 0 && (
            <section>
              <Subtitulo>{t("informe.datos.dimensiones")}</Subtitulo>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {arr<DimensionRendimiento>(r.dimensiones).map((x) => (
                  <Dimension key={x.clave} d={x} metricas={porClave} />
                ))}
              </div>
            </section>
          )}
          {r?.score && <Score s={r.score} />}
          <Escenario hipoteticas={hipoteticas} escenario={escenario} />
          {r && arr<string>(r.noSePuedeSaber).length > 0 && (
            <section>
              <Rotulo>{t("informe.rendimiento.noSePuede")}</Rotulo>
              <ListaTextos items={r.noSePuedeSaber} className="mt-2 text-[15px]" />
            </section>
          )}
        </div>
      </Desplegable>
    </>
  );
}
