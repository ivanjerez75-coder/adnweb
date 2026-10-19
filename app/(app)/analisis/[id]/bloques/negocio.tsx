"use client";

import type { AdnBloque, AdnCanal, Anatomia, CampoIdentidad, FuenteMonetizacion, LineaAnatomia, TipologiaAnatomia } from "@/lib/engine/v3/sections/anatomia";
import type { CoberturaInforme, Resumen } from "@/lib/engine/v3/sections/resumen";
import type { EstadoComponente } from "@/lib/engine/v3/cobertura";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { t, type Clave } from "@/lib/i18n";
import { arr, esNegocioHibrido, hechosNegocio, trozosFrase } from "@/lib/shared/informe-view";
import { Clase, Desplegable, ListaTextos, Rotulo, Subtitulo, VerPrueba } from "./comun";

const TIPOLOGIA: Record<string, Clave> = {
  saas: "informe.tipologia.saas",
  ecommerce: "informe.tipologia.ecommerce",
  marketplace: "informe.tipologia.marketplace",
  servicio_profesional: "informe.tipologia.servicio_profesional",
  contenido: "informe.tipologia.contenido",
  freemium: "informe.tipologia.freemium",
  app: "informe.tipologia.app",
  organizacion_social: "informe.tipologia.organizacion_social",
  negocio_local: "informe.tipologia.negocio_local",
  web_informativa: "informe.tipologia.web_informativa",
};
export const nombreTipologia = (tipo: string) => (TIPOLOGIA[tipo] ? t(TIPOLOGIA[tipo]) : tipo);

const CERTEZA: Record<string, Clave> = { alta: "informe.certeza.alta", media: "informe.certeza.media", baja: "informe.certeza.baja" };
const NIVEL: Record<string, Clave> = {
  confirmado: "informe.anatomia.confirmado",
  inferido: "informe.anatomia.inferido",
  desconocido: "informe.anatomia.desconocido",
};
const HECHO: Record<string, Clave> = {
  queOfrece: "informe.negocio.queOfrece",
  paraQuien: "informe.negocio.paraQuien",
  propuesta: "informe.negocio.propuesta",
};
const IDENTIDAD: [keyof Anatomia["identidad"], Clave][] = [
  ["producto", "informe.anatomia.producto"],
  ["problema", "informe.anatomia.problema"],
  ["paraQuien", "informe.anatomia.paraQuien"],
  ["beneficio", "informe.anatomia.beneficio"],
  ["argumento", "informe.anatomia.argumento"],
  ["diferenciacion", "informe.anatomia.diferenciacion"],
];
const CANAL: Record<string, Clave> = {
  prueba_gratuita: "informe.canal.prueba_gratuita",
  demo: "informe.canal.demo",
  contacto: "informe.canal.contacto",
  suscripcion: "informe.canal.suscripcion",
  compra: "informe.canal.compra",
  registro: "informe.canal.registro",
  presupuesto: "informe.canal.presupuesto",
};
const COMPONENTE: [keyof CoberturaInforme, Clave][] = [
  ["identidad", "informe.cobertura.identidad"],
  ["modelo", "informe.cobertura.modelo"],
  ["auditoria", "informe.cobertura.auditoria"],
  ["rendimiento", "informe.cobertura.rendimiento"],
  ["competencia", "informe.cobertura.competencia"],
  ["diagnostico", "informe.cobertura.diagnostico"],
  ["oportunidades", "informe.cobertura.oportunidades"],
  ["plan", "informe.cobertura.plan"],
];

function Frase({ bloque, nombre }: { bloque: AdnBloque; nombre?: string }) {
  return (
    <div>
      <p className="text-[clamp(1.25rem,2.4vw,1.5rem)] leading-snug text-grafito text-pretty">
        {trozosFrase(bloque.texto, nombre).map((p, i) =>
          p.destacado ? (
            <span key={i} className="font-semibold text-teal">
              {p.texto}
            </span>
          ) : (
            <span key={i}>{p.texto}</span>
          ),
        )}
      </p>
      <VerPrueba evidencias={bloque.evidencias} />
    </div>
  );
}

function Tipologias({ tipologias }: { tipologias: TipologiaAnatomia[] }) {
  if (tipologias.length === 0) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {tipologias.map((x, i) => (
        <span key={`${x.tipo}-${i}`} className="inline-flex items-baseline gap-1.5 rounded-full border border-borde bg-superficie-2 px-3 py-1 text-sm">
          <span className="font-semibold text-grafito">{nombreTipologia(x.tipo)}</span>
          {CERTEZA[x.certeza] && <span className="text-xs text-suave">{t(CERTEZA[x.certeza])}</span>}
        </span>
      ))}
      {esNegocioHibrido(tipologias) && <Etiqueta tono="observado">{t("informe.negocio.hibrido")}</Etiqueta>}
    </div>
  );
}

function Monetizacion({ fuentes }: { fuentes: FuenteMonetizacion[] }) {
  if (fuentes.length === 0) return <p className="text-suave">{t("informe.negocio.sinDato")}</p>;
  return (
    <ul className="space-y-2">
      {fuentes.map((m, i) => (
        <li key={i}>
          <span className="mr-1.5">{m.fuente}</span>
          <Etiqueta tono={m.nivel === "confirmado" ? "observado" : "neutro"}>{t(NIVEL[m.nivel] ?? "informe.anatomia.desconocido")}</Etiqueta>
          {arr<string>(m.precios).length > 0 && <p className="mt-0.5 text-sm text-suave">{arr<string>(m.precios).join(" · ")}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Los 4 hechos clave en fila, separados por reglas finas. */
function Hechos({ anatomia }: { anatomia: Partial<Anatomia> }) {
  const hechos = hechosNegocio(anatomia);
  const celda = "py-4 md:px-5 md:py-0 first:md:pl-0 last:md:pr-0";
  return (
    <dl className="mt-7 grid divide-y divide-borde border-y border-borde py-1 md:grid-cols-4 md:divide-x md:divide-y-0 md:border-y-0 md:py-0">
      {hechos.slice(0, 2).map((h) => (
        <Hecho key={h.clave} titulo={t(HECHO[h.clave])} className={celda}>
          {h.texto ? <p>{h.texto}</p> : <p className="text-suave">{t("informe.negocio.sinDato")}</p>}
          {h.texto && (
            <div className="mt-1.5">
              <Clase clase={h.clase} />
            </div>
          )}
          <VerPrueba evidencias={h.evidencias} />
        </Hecho>
      ))}
      <Hecho titulo={t("informe.negocio.comoMonetiza")} className={celda}>
        <Monetizacion fuentes={arr<FuenteMonetizacion>(anatomia.monetizacion)} />
      </Hecho>
      {hechos.slice(2).map((h) => (
        <Hecho key={h.clave} titulo={t(HECHO[h.clave])} className={celda}>
          {h.texto ? <p>{h.texto}</p> : <p className="text-suave">{t("informe.negocio.sinDato")}</p>}
          {h.texto && (
            <div className="mt-1.5">
              <Clase clase={h.clase} />
            </div>
          )}
          <VerPrueba evidencias={h.evidencias} />
        </Hecho>
      ))}
    </dl>
  );
}

function Hecho({ titulo, children, className }: { titulo: string; children: React.ReactNode; className: string }) {
  return (
    <div className={className}>
      <dt>
        <Rotulo>{titulo}</Rotulo>
      </dt>
      <dd className="mt-1.5 text-[15px] leading-relaxed">{children}</dd>
    </div>
  );
}

const MARCA: Record<EstadoComponente["estado"], { simbolo: string; color: string; clave: Clave }> = {
  valido: { simbolo: "✓", color: "text-teal", clave: "informe.cobertura.valido" },
  parcial: { simbolo: "◐", color: "text-ambar", clave: "informe.cobertura.parcial" },
  fallido: { simbolo: "✕", color: "text-rojo", clave: "informe.cobertura.fallido" },
};

/** "Qué se pudo analizar": la cobertura, compacta. */
export function Cobertura({ cobertura }: { cobertura: Partial<CoberturaInforme> | null | undefined }) {
  if (!cobertura || typeof cobertura !== "object") return null;
  const filas = COMPONENTE.filter(([k]) => cobertura[k] && MARCA[cobertura[k]!.estado]);
  if (filas.length === 0) return null;
  return (
    <div className="mt-8 border-t border-borde pt-5">
      <Rotulo>{t("informe.negocio.cobertura")}</Rotulo>
      <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {filas.map(([k, clave]) => {
          const c = cobertura[k]!;
          const m = MARCA[c.estado];
          return (
            <li key={k} className="flex gap-2 text-sm">
              <span aria-hidden="true" className={`w-4 shrink-0 font-semibold ${m.color}`}>
                {m.simbolo}
              </span>
              <span>
                <span className="font-semibold">{t(clave)}</span>
                <span className="sr-only"> ({t(m.clave)})</span>
                {c.motivo && <span className="text-suave"> — {c.motivo}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Campo({ titulo, campo }: { titulo: string; campo: Partial<CampoIdentidad> | undefined }) {
  if (!campo || (!campo.declara && !campo.interpretamos)) return null;
  return (
    <div className="py-4">
      <Rotulo>{titulo}</Rotulo>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        {campo.declara && (
          <div>
            <p className="text-xs font-semibold text-suave">{t("informe.anatomia.declara")}</p>
            <p className="mt-1">{campo.declara.texto}</p>
            <VerPrueba evidencias={campo.declara.evidencias} />
          </div>
        )}
        {campo.interpretamos && (
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-suave">
              {t("informe.anatomia.interpreta")} <Clase clase={campo.interpretamos.clase} />
            </p>
            <p className="mt-1">{campo.interpretamos.texto}</p>
            <VerPrueba evidencias={campo.interpretamos.evidencias} />
          </div>
        )}
      </div>
    </div>
  );
}

function AnatomiaCompleta({ a }: { a: Partial<Anatomia> }) {
  const id = (a.identidad ?? {}) as Partial<Anatomia["identidad"]>;
  const cl = a.cliente;
  const lineas = arr<LineaAnatomia>(a.lineas);
  const canales = arr<AdnCanal>(a.canales);
  const afirmaciones = arr<AdnBloque>(a.afirmaciones);
  const segmentos = arr<{ texto: string }>(cl?.segmentosAlternativos);
  return (
    <div className="space-y-8">
      <section>
        <Subtitulo>{t("informe.anatomia.identidad")}</Subtitulo>
        <div className="mt-2 divide-y divide-borde">
          {IDENTIDAD.map(([k, clave]) => (
            <Campo key={k} titulo={t(clave)} campo={id[k]} />
          ))}
        </div>
      </section>

      {arr<TipologiaAnatomia>(a.tipologias).length > 0 && (
        <section>
          <Subtitulo>{t("informe.anatomia.modelo")}</Subtitulo>
          <ul className="mt-3 space-y-3">
            {arr<TipologiaAnatomia>(a.tipologias).map((x, i) => (
              <li key={i}>
                <p>
                  <span className="font-semibold">{nombreTipologia(x.tipo)}</span>
                  {CERTEZA[x.certeza] && <span className="text-sm text-suave"> · {t(CERTEZA[x.certeza])}</span>}
                </p>
                {x.explicacion && <p className="text-[15px]">{x.explicacion}</p>}
                <VerPrueba evidencias={x.evidencias} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {arr<FuenteMonetizacion>(a.monetizacion).length > 0 && (
        <section>
          <Subtitulo>{t("informe.anatomia.monetizacion")}</Subtitulo>
          <ul className="mt-3 space-y-3">
            {arr<FuenteMonetizacion>(a.monetizacion).map((m, i) => (
              <li key={i}>
                <span className="mr-1.5">{m.fuente}</span>
                <Etiqueta tono={m.nivel === "confirmado" ? "observado" : "neutro"}>{t(NIVEL[m.nivel] ?? "informe.anatomia.desconocido")}</Etiqueta>
                {arr<string>(m.precios).length > 0 && (
                  <p className="text-sm">
                    {t("informe.anatomia.preciosPublicados")}: {arr<string>(m.precios).join(" · ")}
                  </p>
                )}
                <VerPrueba evidencias={m.evidencias} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {lineas.length > 0 && (
        <section>
          <Subtitulo>{t("informe.anatomia.lineas")}</Subtitulo>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {lineas.map((l, i) => (
              <div key={i} className="rounded-xl border border-borde p-4">
                <p className="font-semibold">{l.nombre}</p>
                <dl className="mt-2 space-y-1.5 text-[15px]">
                  {arr<string>(l.queOfrece).length > 0 && (
                    <div>
                      <dt className="inline text-suave">{t("informe.anatomia.queOfrece")}: </dt>
                      <dd className="inline">{arr<string>(l.queOfrece).join(", ")}</dd>
                    </div>
                  )}
                  {l.publico && (
                    <div>
                      <dt className="inline text-suave">{t("informe.anatomia.publico")}: </dt>
                      <dd className="inline">{l.publico}</dd>
                    </div>
                  )}
                  {l.comoSeContrata && (
                    <div>
                      <dt className="inline text-suave">{t("informe.anatomia.comoSeContrata")}: </dt>
                      <dd className="inline">{l.comoSeContrata}</dd>
                    </div>
                  )}
                </dl>
                <VerPrueba evidencias={l.evidencias} />
              </div>
            ))}
          </div>
        </section>
      )}

      {cl && (
        <section>
          <Subtitulo>{t("informe.anatomia.cliente")}</Subtitulo>
          <div className="mt-3 space-y-4">
            {cl.explicito && (
              <div>
                <Rotulo>{t("informe.anatomia.publicoExplicito")}</Rotulo>
                <p className="mt-1">{cl.explicito.texto}</p>
                <VerPrueba evidencias={cl.explicito.evidencias} />
              </div>
            )}
            {arr<string>(cl.necesidades).length > 0 && (
              <div>
                <Rotulo>{t("informe.anatomia.necesidades")}</Rotulo>
                <ListaTextos items={cl.necesidades} className="mt-1" />
              </div>
            )}
            {arr<string>(cl.sectores).length > 0 && (
              <div>
                <Rotulo>{t("informe.anatomia.sectores")}</Rotulo>
                <p className="mt-1">{arr<string>(cl.sectores).join(", ")}</p>
              </div>
            )}
            {cl.mensaje && (
              <div>
                <Rotulo>{t("informe.anatomia.mensaje")}</Rotulo>
                <p className="mt-1">{cl.mensaje.texto}</p>
                <VerPrueba evidencias={cl.mensaje.evidencias} />
              </div>
            )}
            {segmentos.length > 0 && (
              <div>
                <p className="flex items-center gap-2">
                  <Rotulo>{t("informe.anatomia.segmentos")}</Rotulo> <Clase clase="hipotesis" />
                </p>
                <ListaTextos items={segmentos.map((s) => s.texto)} className="mt-1" />
              </div>
            )}
          </div>
        </section>
      )}

      {canales.length > 0 && (
        <section>
          <Subtitulo>{t("informe.anatomia.canales")}</Subtitulo>
          <ul className="mt-3 space-y-2">
            {canales.map((k, i) => (
              <li key={i}>
                <span className="font-semibold">{CANAL[k.tipo] ? t(CANAL[k.tipo]) : k.tipo}</span>
                <VerPrueba evidencias={k.evidencias} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {afirmaciones.length > 0 && (
        <section>
          <Subtitulo>{t("informe.anatomia.afirmaciones")}</Subtitulo>
          <ul className="mt-3 space-y-3">
            {afirmaciones.map((f, i) => (
              <li key={i}>
                <p>{f.texto}</p>
                <VerPrueba evidencias={f.evidencias} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Bloque 01: qué es el negocio y cómo funciona. */
export function BloqueNegocio({
  anatomia,
  resumen,
  cobertura,
  resumenPendiente,
}: {
  anatomia: unknown;
  resumen: unknown;
  cobertura: unknown;
  resumenPendiente: boolean;
}) {
  const a = (anatomia ?? {}) as Partial<Anatomia>;
  const r = (resumen ?? null) as Partial<Resumen> | null;
  const frase = r?.frase?.texto ? r.frase : a.fraseResumen?.texto ? a.fraseResumen : null;
  const tipologias = arr<TipologiaAnatomia>(r?.modelo?.tipologias).length > 0 ? arr<TipologiaAnatomia>(r?.modelo?.tipologias) : arr<TipologiaAnatomia>(a.tipologias);
  const cob = (r?.cobertura ?? cobertura) as Partial<CoberturaInforme> | null;
  return (
    <>
      <Rotulo>{t("informe.negocio.sintesis")}</Rotulo>
      <div className="mt-2">{frase && <Frase bloque={frase} nombre={r?.nombre ?? a.nombre} />}</div>
      {resumenPendiente && <p className="mt-2 text-sm text-suave">{t("informe.negocio.provisional")}</p>}
      <Tipologias tipologias={tipologias} />
      <Hechos anatomia={a} />
      <Desplegable titulo={t("informe.negocio.detalle")}>
        <AnatomiaCompleta a={a} />
      </Desplegable>
      <Cobertura cobertura={cob} />
    </>
  );
}
