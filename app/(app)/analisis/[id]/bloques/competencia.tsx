"use client";

import type { AfirmacionCompetidor, Competencia, CompetidorV4, FilaMatriz, GanaPierde, PrecioCompetidor } from "@/lib/engine/v3/sections/competencia";
import type { Evidence } from "@/lib/engine/v3/evidence";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { t, type Clave } from "@/lib/i18n";
import { ANCLA_MATRIZ, anclaComparacion, arr, fechaCorta } from "@/lib/shared/informe-view";
import { Desplegable, EnlaceExterno, ListaTextos, Rotulo, Subtitulo, VerPrueba } from "./comun";

const TIPO: Record<string, Clave> = {
  directo: "informe.competencia.directo",
  indirecto: "informe.competencia.indirecto",
  emergente: "informe.competencia.emergente",
};
const DIMENSION: Record<string, Clave> = {
  cliente: "informe.competencia.dimension.cliente",
  propuesta: "informe.competencia.dimension.propuesta",
  precio: "informe.competencia.dimension.precio",
  funcionalidades: "informe.competencia.dimension.funcionalidades",
  diferenciacion: "informe.competencia.dimension.diferenciacion",
  oportunidad: "informe.competencia.dimension.oportunidad",
};
const nombreDimension = (d: string) => (DIMENSION[d] ? t(DIMENSION[d]) : d);

/** "Desconocido" / "Sin datos" se pintan apagados: nunca se adivina un precio. */
function Valor({ texto }: { texto: string | undefined }) {
  const v = typeof texto === "string" && texto.trim() ? texto.trim() : "";
  const k = v.toLowerCase();
  if (!v || k === t("informe.sinDatos").toLowerCase() || k === "sin_datos") return <span className="text-suave">{t("informe.sinDatos")}</span>;
  if (k === t("informe.desconocido").toLowerCase()) return <span className="text-suave">{t("informe.desconocido")}</span>;
  return <>{v}</>;
}

function Precios({ precios }: { precios: PrecioCompetidor[] | "desconocido" | undefined }) {
  const lista = precios === "desconocido" ? [] : arr<PrecioCompetidor>(precios);
  if (lista.length === 0) return <span className="text-suave">{t("informe.desconocido")}</span>;
  return (
    <>
      {lista.map((p) => p.texto).join(" · ")}
      <VerPrueba evidencias={lista.map((p) => p.evidencia).filter(Boolean)} />
    </>
  );
}

function Afirmaciones({ titulo, items }: { titulo: string; items: unknown }) {
  const xs = arr<AfirmacionCompetidor>(items);
  if (xs.length === 0) return null;
  return (
    <div>
      <Rotulo>{titulo}</Rotulo>
      <ul className="mt-1 space-y-2">
        {xs.map((x, i) => (
          <li key={i} className="text-[15px]">
            {x.texto}
            <VerPrueba evidencias={x.evidencias} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ficha({ k }: { k: CompetidorV4 }) {
  const f = k.ficha;
  return (
    <li className="flex flex-col rounded-xl border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display text-xl leading-tight font-extrabold uppercase">{k.nombre}</p>
        {TIPO[k.tipo] && <Etiqueta tono="neutro">{t(TIPO[k.tipo])}</Etiqueta>}
        {!k.verificado && <Etiqueta tono="hipotesis">{t("informe.competencia.sinVerificar")}</Etiqueta>}
      </div>
      {k.web && (
        <p className="text-sm text-suave">
          <EnlaceExterno href={k.web}>{k.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</EnlaceExterno>
        </p>
      )}
      {k.motivo && (
        <p className="mt-2 text-[15px]">
          <span className="font-semibold">{t("informe.competencia.motivo")}:</span> {k.motivo}
        </p>
      )}
      <p className="mt-2 text-[15px]">
        <span className="font-semibold">{t("informe.competencia.precios")}:</span> <Precios precios={f?.precios ?? "desconocido"} />
      </p>
      {f && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-teal">{t("informe.competencia.verFicha")}</summary>
          <div className="mt-3 space-y-3">
            {k.descripcion && <p className="text-[15px]">{k.descripcion}</p>}
            {(["publico", "problema", "propuesta"] as const).map((campo) =>
              f[campo] ? (
                <div key={campo}>
                  <Rotulo>{t(`informe.competencia.${campo}`)}</Rotulo>
                  <p className="mt-1 text-[15px]">{f[campo]!.texto}</p>
                  <VerPrueba evidencias={f[campo]!.evidencias} />
                </div>
              ) : null,
            )}
            {arr<string>(f.funcionalidades).length > 0 && (
              <div>
                <Rotulo>{t("informe.competencia.funcionalidades")}</Rotulo>
                <ListaTextos items={f.funcionalidades} className="mt-1 text-[15px]" />
              </div>
            )}
            <Afirmaciones titulo={t("informe.competencia.fortalezas")} items={f.fortalezas} />
            <Afirmaciones titulo={t("informe.competencia.debilidades")} items={f.debilidades} />
          </div>
        </details>
      )}
      {arr<string>(k.fuentes).length > 0 && (
        <p className="mt-auto pt-3 text-xs text-suave">
          {t("informe.competencia.fuentes")}:{" "}
          {arr<string>(k.fuentes).map((u, i) => (
            <span key={u}>
              {i > 0 && ", "}
              <EnlaceExterno href={u}>{u.replace(/^https?:\/\/(www\.)?/, "")}</EnlaceExterno>
            </span>
          ))}
          {k.comprobadoEn && <> · {t("informe.competencia.comprobado", { fecha: fechaCorta(k.comprobadoEn) })}</>}
        </p>
      )}
    </li>
  );
}

function GanaPierdeFila({ g, nombreDe }: { g: GanaPierde; nombreDe: (q: string) => string }) {
  const destaca = g.destaca === "sin_datos" ? t("informe.sinDatos") : g.destaca === "empate" ? t("informe.competencia.empate") : nombreDe(g.destaca);
  return (
    <li id={anclaComparacion(g.dimension)} className="scroll-mt-24 rounded-xl border border-borde p-4">
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-display text-lg font-extrabold uppercase">{nombreDimension(g.dimension)}</span>
        <span className="text-sm">
          {t("informe.competencia.destaca")}: <span className={g.destaca === "analizada" ? "font-semibold text-teal" : "font-semibold"}>{destaca}</span>
        </span>
      </p>
      {g.destaca !== "sin_datos" && (
      <dl className="mt-2 grid gap-3 text-[15px] md:grid-cols-3">
        {g.porQueImporta && (
          <div>
            <dt className="text-xs font-semibold text-suave">{t("informe.competencia.porQueImporta")}</dt>
            <dd>{g.porQueImporta}</dd>
          </div>
        )}
        {g.aprender && (
          <div>
            <dt className="text-xs font-semibold text-suave">{t("informe.competencia.aprender")}</dt>
            <dd>{g.aprender}</dd>
          </div>
        )}
        {g.diferenciarse && (
          <div>
            <dt className="text-xs font-semibold text-suave">{t("informe.competencia.diferenciarse")}</dt>
            <dd>{g.diferenciarse}</dd>
          </div>
        )}
      </dl>
      )}
      {g.destaca !== "sin_datos" && <VerPrueba evidencias={g.evidencia} />}
    </li>
  );
}

/** Matriz: tabla en escritorio (la empresa analizada en la primera columna) y fichas apiladas en móvil. */
function Matriz({ dims, filas, nombreDe }: { dims: string[]; filas: FilaMatriz[]; nombreDe: (q: string) => string }) {
  const ordenadas = [...filas.filter((f) => f.quien === "analizada"), ...filas.filter((f) => f.quien !== "analizada")];
  const valor = (f: FilaMatriz, d: string) => (f.valores as Record<string, string> | undefined)?.[d];
  const pruebas = (f: FilaMatriz, d: string) => arr<Evidence>((f.evidencias as Record<string, Evidence[]> | undefined)?.[d]);
  return (
    <>
      <div className="hidden overflow-x-auto min-[760px]:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-36 border-b border-borde p-2.5" />
              {ordenadas.map((f) => (
                <th
                  key={f.quien}
                  scope="col"
                  className={`border-b border-borde p-2.5 align-bottom font-display text-base font-extrabold uppercase ${f.quien === "analizada" ? "bg-teal-claro text-teal" : ""}`}
                >
                  {nombreDe(f.quien)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dims.map((d) => (
              <tr key={d}>
                <th scope="row" className="border-b border-borde p-2.5 align-top text-xs font-semibold tracking-[0.06em] text-suave uppercase">
                  {nombreDimension(d)}
                </th>
                {ordenadas.map((f) => (
                  <td key={f.quien} className={`border-b border-borde p-2.5 align-top ${f.quien === "analizada" ? "bg-teal-claro/50" : ""}`}>
                    <Valor texto={valor(f, d)} />
                    <VerPrueba evidencias={pruebas(f, d)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 min-[760px]:hidden">
        {ordenadas.map((f) => (
          <li key={f.quien} className={`rounded-xl border p-4 ${f.quien === "analizada" ? "border-teal bg-teal-claro/50" : "border-borde"}`}>
            <p className={`font-display text-lg font-extrabold uppercase ${f.quien === "analizada" ? "text-teal" : ""}`}>{nombreDe(f.quien)}</p>
            <dl className="mt-2 space-y-2 text-[15px]">
              {dims.map((d) => (
                <div key={d}>
                  <dt className="text-xs font-semibold text-suave uppercase">{nombreDimension(d)}</dt>
                  <dd>
                    <Valor texto={valor(f, d)} />
                    <VerPrueba evidencias={pruebas(f, d)} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Bloque 03: con quién compite y qué diferencias importan. */
export function BloqueCompetencia({ competencia, nombre }: { competencia: unknown; nombre?: string }) {
  const c = (competencia ?? {}) as Partial<Competencia>;
  const competidores = arr<CompetidorV4>(c.competidores).filter((k) => k && typeof k === "object");
  const analizada = nombre?.trim() || t("informe.competencia.analizada");
  const nombreDe = (q: string) => (q === "analizada" ? analizada : (competidores.find((k) => k.id === q)?.nombre ?? q));
  const dims = arr<string>(c.matriz?.dimensiones);
  const filas = arr<FilaMatriz>(c.matriz?.filas).filter((f) => f && typeof f.quien === "string");
  const gp = arr<GanaPierde>(c.ganaPierde).filter((g) => g && typeof g.dimension === "string");
  return (
    <>
      {competidores.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {competidores.map((k) => (
            <Ficha key={k.id} k={k} />
          ))}
        </ul>
      ) : (
        <p className="text-suave">{t("informe.competencia.sinCompetidores")}</p>
      )}
      {gp.length > 0 && (
        <section className="mt-8">
          <Subtitulo>{t("informe.competencia.ganaPierde")}</Subtitulo>
          <ul className="mt-3 space-y-3">
            {gp.map((g) => (
              <GanaPierdeFila key={g.dimension} g={g} nombreDe={nombreDe} />
            ))}
          </ul>
        </section>
      )}
      {filas.length > 1 && dims.length > 0 && (
        <Desplegable id={ANCLA_MATRIZ} titulo={t("informe.competencia.verMatriz")}>
          <Matriz dims={dims} filas={filas} nombreDe={nombreDe} />
        </Desplegable>
      )}
    </>
  );
}
