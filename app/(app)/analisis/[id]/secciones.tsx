"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Evidence } from "@/lib/engine/v3/evidence";
import type { DnaScore, Indicador } from "@/lib/engine/v3/score";
import type { Metrica } from "@/lib/engine/v3/estimates";
import type { AdnBloque, AdnCanal, Anatomia, ClaveIdentidad, FuenteMonetizacion, LineaAnatomia, TipologiaAnatomia } from "@/lib/engine/v3/sections/anatomia";
import type { AfirmacionCompetidor, Competencia, CompetidorV4, FilaMatriz, GanaPierde, PrecioCompetidor } from "@/lib/engine/v3/sections/competencia";
import type { Debilidad, Diagnostico, Fortaleza, Friccion, Riesgo } from "@/lib/engine/v3/sections/diagnostico";
import type { Rendimiento } from "@/lib/engine/v3/sections/rendimiento";
import type { Oportunidad } from "@/lib/engine/v3/sections/oportunidades";
import { decidirSondeo, siguienteSondeo } from "@/lib/shared/polling";
import { hayPendientes, ordenSecciones, type SeccionVista } from "@/lib/shared/secciones-view";

type Guardadas = Record<string, { estado: string; contenido: unknown }>;

export interface InicialSecciones {
  estado: string;
  pasoActual: string | null;
  secciones: Guardadas;
}

/** Solo se enlazan URLs http(s): el contenido viene de webs ajenas. */
const esHttp = (u: string | null | undefined): u is string => {
  if (!u) return false;
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
};

function Evidencias({ lista }: { lista: Evidence[] | undefined }) {
  if (!lista || lista.length === 0) return null;
  return (
    <ul>
      {arr<Evidence>(lista).map((e) =>
        e.tipo === "pagina" ? (
          <li key={e.id}>
            {esHttp(e.url) ? (
              <a href={e.url} rel="noopener noreferrer" target="_blank">
                «{e.texto}»
              </a>
            ) : (
              <>«{e.texto}»</>
            )}{" "}
            <small>({e.fuente})</small>
          </li>
        ) : (
          <li key={e.id}>
            {e.texto} <small>({e.fuente})</small>
          </li>
        ),
      )}
    </ul>
  );
}

const num = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });

const TIPO: Record<string, string> = { observado: "Observado", fuente_externa: "Fuente externa", inferencia: "Inferencia", hipotesis: "Hipótesis" };
const CONFIANZA: Record<string, string> = {
  alta: "Confianza alta",
  media: "Confianza media",
  baja: "Confianza baja",
  insuficiente: "Confianza insuficiente",
};
const ESTADO: Record<string, string> = {
  disponible: "Disponible",
  insuficiente: "Datos insuficientes",
  error: "Error",
  no_aplica: "No aplica",
};

const TEXTO_ESCENARIO = "Escenario ilustrativo: no son los ingresos de la empresa";

function valorMetrica(m: Metrica): string | null {
  const v = m.valor;
  if (v === null || v === undefined) return null;
  const u = m.unidad ? ` ${m.unidad}` : "";
  if (typeof v === "number") return `${num(v)}${u}`;
  if (typeof v === "string") return `${v}${u}`;
  if (typeof v === "object" && typeof v.min === "number" && typeof v.max === "number") return `${num(v.min)} – ${num(v.max)}${u}`;
  return null;
}

function Lista({ titulo, items }: { titulo: string; items: unknown }) {
  const l = arr<string>(items);
  if (l.length === 0) return null;
  return (
    <>
      <small>{titulo}:</small>
      <ul>
        {l.map((t, i) => (
          <li key={i}>
            <small>{t}</small>
          </li>
        ))}
      </ul>
    </>
  );
}

/** sinCifras: el valor ya se muestra en otra parte (la lista del escenario) y no se repite. */
function MetricaVista({ m, sinCifras = false }: { m: Metrica; sinCifras?: boolean }) {
  const valor = valorMetrica(m);
  // R7: la etiqueta de tipo solo se muestra si el dato está disponible.
  const disponible = m.estado === "disponible";
  const limitaciones = sinCifras ? arr<string>(m.limitaciones).filter((l) => l !== TEXTO_ESCENARIO) : m.limitaciones;
  return (
    <li>
      {sinCifras ? <strong>{m.etiqueta}</strong> : <><strong>{m.etiqueta}:</strong> {valor ?? "—"}</>}
      <br />
      <small>
        {disponible ? <>{TIPO[m.tipo] ?? m.tipo} · </> : null}
        {CONFIANZA[m.confianza] ?? m.confianza} · {ESTADO[m.estado] ?? m.estado}
      </small>
      {m.motivoConfianza ? (
        <>
          <br />
          <small>{m.motivoConfianza}</small>
        </>
      ) : null}
      <p>
        <small>
          <strong>Metodología:</strong> {m.metodologia}
          <br />
          Fuente:{" "}
          {esHttp(m.fuenteUrl) ? (
            <a href={m.fuenteUrl} rel="noopener noreferrer" target="_blank">
              {m.fuente}
            </a>
          ) : (
            m.fuente
          )}
          . Obtenido el {m.obtenidoEn}
          {m.periodo ? <>. Periodo: {m.periodo}</> : null}
        </small>
      </p>
      <Lista titulo="Limitaciones" items={limitaciones} />
      <Lista titulo="Supuestos" items={m.supuestos} />
    </li>
  );
}

interface PrecioVista {
  url: string;
  texto: string;
}

function Datos({ c }: { c: unknown }) {
  const d = (c ?? {}) as { metricas?: Metrica[]; precios?: PrecioVista[]; escenario?: { clientes: number; ingresosMes: number }[] | null };
  const todas = arr<Metrica>(d.metricas);
  const normales = todas.filter((m) => m.tipo !== "hipotesis");
  const hipoteticas = todas.filter((m) => m.tipo === "hipotesis");
  const escenario = arr<{ clientes: number; ingresosMes: number }>(d.escenario);
  const precios = arr<PrecioVista>(d.precios);
  return (
    <>
      <ul>
        {normales.map((m) => (
          <MetricaVista key={m.clave} m={m} />
        ))}
      </ul>
      {precios.length > 0 && (
        <>
          <h3>Precios publicados</h3>
          <ul>
            {precios.map((p, i) => (
              <li key={i}>
                {p.texto}{" "}
                {esHttp(p.url) && (
                  <small>
                    (
                    <a href={p.url} rel="noopener noreferrer" target="_blank">
                      {p.url}
                    </a>
                    )
                  </small>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {(hipoteticas.length > 0 || escenario.length > 0) && (
        <section aria-labelledby="escenario-hipotetico" style={{ border: "2px dashed currentColor", padding: "1em", margin: "1em 0" }}>
          <h3 id="escenario-hipotetico">Escenario hipotético</h3>
          <p>
            <strong>{TEXTO_ESCENARIO}</strong>
          </p>
          {escenario.length > 0 && (
            <ul>
              {escenario.map((e) => (
                <li key={e.clientes}>
                  {num(e.clientes)} clientes: {num(e.ingresosMes)} €/mes
                </li>
              ))}
            </ul>
          )}
          <ul>
            {hipoteticas.map((m) => (
              <MetricaVista key={m.clave} m={m} sinCifras={escenario.length > 0} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Bloque({ titulo, b }: { titulo: string; b: AdnBloque | null | undefined }) {
  if (!b) return null;
  return (
    <>
      <h3>{titulo}</h3>
      <p>{b.texto}</p>
      <Evidencias lista={b.evidencias} />
    </>
  );
}

const IDENTIDAD: [ClaveIdentidad, string][] = [
  ["producto", "Producto o servicio"],
  ["problema", "Problema que resuelve"],
  ["paraQuien", "Para quién"],
  ["beneficio", "Beneficio prometido"],
  ["argumento", "Argumento de venta"],
  ["diferenciacion", "Diferenciación declarada"],
];
const NIVEL: Record<string, string> = { confirmado: "Confirmado", inferido: "Inferido", desconocido: "Desconocido" };
const CERTEZA: Record<string, string> = { alta: "certeza alta", media: "certeza media", baja: "certeza baja" };

/** Sección 02 (provisional hasta la Tarea 7): lo que la empresa declara frente a lo que ADNweb interpreta. */
function AnatomiaVista({ c }: { c: unknown }) {
  const a = c as Partial<Anatomia>;
  const id = a.identidad;
  const cl = a.cliente;
  return (
    <>
      {a.fraseResumen && <Bloque titulo={a.nombre ?? "Resumen"} b={a.fraseResumen} />}
      {id &&
        IDENTIDAD.map(([k, titulo]) => {
          const campo = id[k];
          if (!campo || (!campo.declara && !campo.interpretamos)) return null;
          return (
            <section key={k}>
              <h3>{titulo}</h3>
              {campo.declara && (
                <>
                  <p>La empresa declara: {campo.declara.texto}</p>
                  <Evidencias lista={campo.declara.evidencias} />
                </>
              )}
              {campo.interpretamos && (
                <>
                  <p>
                    ADNweb interpreta: {campo.interpretamos.texto} <small>({TIPO[campo.interpretamos.clase] ?? campo.interpretamos.clase})</small>
                  </p>
                  <Evidencias lista={campo.interpretamos.evidencias} />
                </>
              )}
            </section>
          );
        })}
      <h3>Modelo de negocio ({a.modeloEstado ?? "desconocido"})</h3>
      <ul>
        {arr<TipologiaAnatomia>(a.tipologias).map((t, i) => (
          <li key={i}>
            {t.tipo} ({CERTEZA[t.certeza] ?? t.certeza}){t.explicacion ? `: ${t.explicacion}` : ""}
            <Evidencias lista={t.evidencias} />
          </li>
        ))}
      </ul>
      {arr<FuenteMonetizacion>(a.monetizacion).length > 0 && (
        <>
          <h3>Monetización</h3>
          <ul>
            {arr<FuenteMonetizacion>(a.monetizacion).map((m, i) => (
              <li key={i}>
                {m.fuente} ({NIVEL[m.nivel] ?? m.nivel})
                {arr<string>(m.precios).length > 0 ? ` · Precios publicados: ${arr<string>(m.precios).join(", ")}` : ""}
                <Evidencias lista={m.evidencias} />
              </li>
            ))}
          </ul>
        </>
      )}
      {arr<LineaAnatomia>(a.lineas).map((l, i) => (
        <section key={i}>
          <h3>{l.nombre}</h3>
          <ul>
            <li>Qué ofrece: {arr<string>(l.queOfrece).join(", ")}</li>
            <li>Público: {l.publico}</li>
            <li>Cómo se contrata: {l.comoSeContrata}</li>
          </ul>
          <Evidencias lista={l.evidencias} />
        </section>
      ))}
      {cl && (
        <>
          <Bloque titulo="Cliente objetivo" b={cl.explicito} />
          {arr<string>(cl.necesidades).length > 0 && <p>Necesidades: {arr<string>(cl.necesidades).join(", ")}</p>}
          {arr<string>(cl.sectores).length > 0 && <p>Sectores prioritarios: {arr<string>(cl.sectores).join(", ")}</p>}
          <Bloque titulo="Mensaje comercial" b={cl.mensaje} />
          {arr<{ texto: string }>(cl.segmentosAlternativos).length > 0 && (
            <>
              <h3>Segmentos alternativos por investigar (hipótesis)</h3>
              <ul>
                {arr<{ texto: string }>(cl.segmentosAlternativos).map((s, i) => (
                  <li key={i}>{s.texto}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {arr<AdnCanal>(a.canales).length > 0 && (
        <>
          <h3>Canales de conversión</h3>
          <ul>
            {arr<AdnCanal>(a.canales).map((k, i) => (
              <li key={i}>
                {k.tipo}
                <Evidencias lista={k.evidencias} />
              </li>
            ))}
          </ul>
        </>
      )}
      {arr<AdnBloque>(a.afirmaciones).length > 0 && (
        <>
          <h3>Lo que la empresa dice de sí misma</h3>
          <ul>
            {arr<AdnBloque>(a.afirmaciones).map((f, i) => (
              <li key={i}>
                La empresa afirma: {f.texto}
                <Evidencias lista={f.evidencias} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** Vista mínima de rendimiento (la Tarea 7 la rehace): interpretaciones, score y qué no se puede saber. */
function RendimientoVista({ c }: { c: unknown }) {
  const r = c as Rendimiento;
  return (
    <>
      {arr<Rendimiento["dimensiones"][number]>(r.dimensiones).map((d) => (
        <div key={d.clave}>
          <h3>{d.nombre}</h3>
          <p>{d.interpretacion}</p>
        </div>
      ))}
      {r.score ? <ScoreVista c={r.score} /> : null}
      <h3>Qué no se puede saber</h3>
      <ul>
        {arr<string>(r.noSePuedeSaber).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </>
  );
}

function IndicadorVista({ i }: { i: Indicador }) {
  return (
    <li>
      {i.nombre}:{" "}
      {i.aplica === false ? (
        <>No aplica a este tipo de negocio</>
      ) : i.evaluado ? (
        <>
          {i.puntos}/{i.maximo} — {i.motivo}
        </>
      ) : (
        <>No evaluado{i.motivo ? ` — ${i.motivo}` : ""}</>
      )}
      <Evidencias lista={i.evidencias} />
    </li>
  );
}

function ScoreVista({ c }: { c: unknown }) {
  const s = c as DnaScore;
  return (
    <>
      <p>
        Puntuación global: <strong>{s.global === null || s.global === undefined ? "DNA Score no disponible" : `${s.global} / 100`}</strong>
      </p>
      <p>
        <small>
          Cobertura global: {Math.round((s.coberturaGlobal ?? 0) * 100)} %. Metodología: {s.metodologia}
        </small>
      </p>
      {arr<DnaScore["dimensiones"][number]>(s.dimensiones).map((k) => (
        <section key={k.clave}>
          <h3>{k.nombre}</h3>
          <p>
            <strong>{k.valor === null ? "No puntuable" : `${k.valor} / 100`}</strong>
            <small>
              {" "}
              (cobertura {Math.round(k.cobertura * 100)} %, peso {Math.round(k.peso * 100)} %)
            </small>
          </p>
          {typeof k.resumen === "string" && k.resumen ? <p>{k.resumen}</p> : null}
          <ul>
            {arr<Indicador>(k.indicadores).map((i) => (
              <IndicadorVista key={i.clave} i={i} />
            ))}
          </ul>
        </section>
      ))}
      {arr<string>(s.avisos).map((a, i) => (
        <p key={i}>
          <small>{a}</small>
        </p>
      ))}
    </>
  );
}

/** Vista mínima del diagnóstico (la Tarea 7 la rehace). */
function DiagnosticoVista({ c }: { c: unknown }) {
  const d = c as Diagnostico;
  const bloque = (titulo: string, items: { id: string; texto: string; evidencias: Evidence[]; clase?: string }[], extra?: (x: never) => ReactNode) => (
    <>
      <h3>{titulo}</h3>
      <ul>
        {items.map((x) => (
          <li key={x.id}>
            {x.texto}
            {x.clase ? <small> · {TIPO[x.clase] ?? x.clase}</small> : null}
            {extra ? extra(x as never) : null}
            <Evidencias lista={x.evidencias} />
          </li>
        ))}
      </ul>
    </>
  );
  return (
    <>
      {bloque("Fortalezas", arr<Fortaleza>(d.fortalezas), (f: Fortaleza) => (
        <>
          <br />
          <small>
            Frente a: {f.frenteA}
            {f.paraQuien ? ` · Para: ${f.paraQuien}` : ""}
          </small>
        </>
      ))}
      {bloque("Debilidades", arr<Debilidad>(d.debilidades), (x: Debilidad) =>
        x.porQueImporta ? (
          <>
            <br />
            <small>Por qué importa: {x.porQueImporta}</small>
          </>
        ) : null,
      )}
      {bloque("Riesgos (hipótesis)", arr<Riesgo>(d.riesgos))}
      {bloque("Fricciones potenciales", arr<Friccion>(d.fricciones))}
      {d.integrado?.texto ? (
        <>
          <h3>Diagnóstico integrado</h3>
          <p>{d.integrado.texto}</p>
        </>
      ) : null}
    </>
  );
}

const TIPO_COMP: Record<string, string> = { directo: "Directo", indirecto: "Indirecto", emergente: "Alternativa emergente" };
const DIMENSION: Record<string, string> = {
  cliente: "Cliente objetivo",
  propuesta: "Propuesta de valor",
  precio: "Precio",
  funcionalidades: "Funcionalidades",
  diferenciacion: "Diferenciación",
  oportunidad: "Oportunidad",
};

function AfirmacionesVista({ titulo, items }: { titulo: string; items: unknown }) {
  const xs = arr<AfirmacionCompetidor>(items);
  if (xs.length === 0) return null;
  return (
    <>
      <p>{titulo}:</p>
      <ul>
        {xs.map((x, i) => (
          <li key={i}>
            {x.texto}
            <Evidencias lista={x.evidencias} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Vista mínima de la sección; la Tarea 7 la rediseña. */
function CompetenciaVista({ c }: { c: unknown }) {
  const comp = (c ?? {}) as Partial<Competencia>;
  const competidores = arr<CompetidorV4>(comp.competidores);
  const nombreDe = (q: string) => (q === "analizada" ? "Empresa analizada" : (competidores.find((k) => k.id === q)?.nombre ?? q));
  const dims = arr<string>(comp.matriz?.dimensiones);
  const filas = arr<FilaMatriz>(comp.matriz?.filas);
  return (
    <>
      <ul>
        {competidores.map((k) => {
          const f = k.ficha;
          return (
            <li key={k.id}>
              <strong>{k.nombre}</strong>
              {esHttp(k.web) && (
                <>
                  {" "}
                  (
                  <a href={k.web} rel="noopener noreferrer" target="_blank">
                    {k.web}
                  </a>
                  )
                </>
              )}{" "}
              <small>{TIPO_COMP[k.tipo] ?? k.tipo}</small>
              {!k.verificado && <em> — sin verificar</em>}
              {k.motivo && <p>Por qué es relevante: {k.motivo}</p>}
              {k.descripcion && <p>{k.descripcion}</p>}
              {f && (
                <>
                  <Bloque titulo="Público" b={f.publico} />
                  <Bloque titulo="Problema que resuelve" b={f.problema} />
                  <Bloque titulo="Propuesta de valor" b={f.propuesta} />
                  <Lista titulo="Funcionalidades" items={f.funcionalidades} />
                  <p>Precios públicos: {f.precios === "desconocido" ? "Desconocido" : arr<PrecioCompetidor>(f.precios).map((p) => p.texto).join(", ")}</p>
                  {f.precios !== "desconocido" && <Evidencias lista={arr<PrecioCompetidor>(f.precios).map((p) => p.evidencia)} />}
                  <AfirmacionesVista titulo="Fortalezas" items={f.fortalezas} />
                  <AfirmacionesVista titulo="Debilidades" items={f.debilidades} />
                </>
              )}
              {arr<string>(k.fuentes).length > 0 && (
                <p>
                  <small>
                    Fuentes: {arr<string>(k.fuentes).join(", ")} · comprobado el {new Date(k.comprobadoEn).toLocaleDateString("es-ES")}
                  </small>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {filas.length > 1 && (
        <table>
          <thead>
            <tr>
              <th />
              {dims.map((d) => (
                <th key={d}>{DIMENSION[d] ?? d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.quien}>
                <th>{nombreDe(f.quien)}</th>
                {dims.map((d) => (
                  <td key={d}>{(f.valores as Record<string, string> | undefined)?.[d] ?? "Sin datos"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {arr<GanaPierde>(comp.ganaPierde).length > 0 && (
        <ul>
          {arr<GanaPierde>(comp.ganaPierde).map((g) => (
            <li key={g.dimension}>
              <strong>{DIMENSION[g.dimension] ?? g.dimension}</strong>:{" "}
              {g.destaca === "sin_datos" ? "Sin datos" : g.destaca === "empate" ? "Empate" : `destaca ${nombreDe(g.destaca)}`}
              {g.porQueImporta && <p>Por qué importa: {g.porQueImporta}</p>}
              {g.aprender && <p>Qué aprender: {g.aprender}</p>}
              {g.diferenciarse && <p>Cómo diferenciarse: {g.diferenciarse}</p>}
              <Evidencias lista={g.evidencia} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const TIPOLOGIA_OPORTUNIDAD: Record<string, string> = {
  mejorar: "Mejorar el negocio",
  diferenciarse: "Diferenciarse",
  complementario: "Producto complementario",
  nuevo_mercado: "Nuevo mercado o segmento",
};

/** Vista mínima (la Tarea 7 la rehace): cada oportunidad es una hipótesis enlazada a un hallazgo. */
function OportunidadesVista({ c }: { c: unknown }) {
  return (
    <ol>
      {arr<Oportunidad>(c).map((o) => (
        <li key={o.id}>
          <article>
            <h3>{o.titulo}</h3>
            <p>
              <small>
                {TIPOLOGIA_OPORTUNIDAD[o.tipologia] ?? o.tipologia} · Hipótesis · {o.estado === "detectada" ? "Detectada" : "Por validar"} · Prioridad {o.prioridad}
              </small>
            </p>
            <p>Sale de: {arr<string>(o.origen).join(", ")}</p>
            <p>Evidencia: {o.ficha?.evidencia?.texto}</p>
            <p>Problema potencial: {o.ficha?.problema}</p>
            <p>Solución posible: {o.ficha?.solucion}</p>
            <p>Por qué podría funcionar: {o.ficha?.porQuePodria}</p>
            {arr<string>(o.ficha?.faltaComprobar).length > 0 && (
              <>
                <p>Qué falta comprobar:</p>
                <ul>
                  {arr<string>(o.ficha?.faltaComprobar).map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            <Evidencias lista={o.ficha?.evidencia?.evidencias} />
          </article>
        </li>
      ))}
    </ol>
  );
}

function Cuerpo({ s }: { s: SeccionVista }) {
  if (s.estado === "pendiente") return <p role="status">Generando…</p>;
  if (s.estado === "error" || s.contenido === null || s.contenido === undefined) {
    return <p>No hemos podido generar esta sección.</p>;
  }
  switch (s.clave) {
    case "datos":
      return <Datos c={s.contenido} />;
    case "anatomia":
      return <AnatomiaVista c={s.contenido} />;
    case "rendimiento":
      return <RendimientoVista c={s.contenido} />;
    case "diagnostico":
      return <DiagnosticoVista c={s.contenido} />;
    case "competencia":
      return <CompetenciaVista c={s.contenido} />;
    case "oportunidades":
      return <OportunidadesVista c={s.contenido} />;
  }
}

/**
 * Clave del ErrorBoundary: cambia con el estado y el contenido, para que una sección que falló al
 * pintarse se vuelva a intentar cuando el sondeo traiga contenido nuevo.
 */
export function claveContenido(s: SeccionVista): string {
  let json = "";
  try {
    json = JSON.stringify(s.contenido) ?? "";
  } catch {
    json = "";
  }
  let h = 0;
  for (let i = 0; i < json.length; i++) h = (Math.imul(h, 31) + json.charCodeAt(i)) | 0;
  return `${s.clave}:${s.estado}:${json.length}:${h >>> 0}`;
}

export function Secciones({ id, createdAt, inicial }: { id: string; createdAt: string; inicial: InicialSecciones }) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial.estado);
  const [paso, setPaso] = useState(inicial.pasoActual);
  const [secciones, setSecciones] = useState<Guardadas>(inicial.secciones);
  const [ahora, setAhora] = useState(() => new Date());
  const [aviso, setAviso] = useState<string | null>(null);

  const vistas = ordenSecciones(secciones, createdAt, ahora);
  const seguir = estado === "procesando" || hayPendientes(vistas);

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
          if (d.secciones && typeof d.secciones === "object") setSecciones(d.secciones);
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
      setAviso(dec.mensaje ? (dec.accion === "seguir" && errorApi ? errorApi : dec.mensaje) : null);
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
    const t = setInterval(() => setAhora(new Date()), 10_000);
    return () => clearInterval(t);
  }, [seguir]);

  const sinNada = vistas.every((s) => s.estado === "pendiente");

  return (
    <div>
      {sinNada && estado === "procesando" && <p role="status">{paso ?? "Preparando el análisis…"}</p>}
      {aviso && <p role="alert">{aviso}</p>}
      {vistas.map((s) => (
        <section key={s.clave} aria-labelledby={`sec-${s.clave}`}>
          <h2 id={`sec-${s.clave}`}>{s.titulo}</h2>
          <ErrorBoundary key={claveContenido(s)}>
            <Cuerpo s={s} />
          </ErrorBoundary>
        </section>
      ))}
    </div>
  );
}

function arr<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

/** Una sección con contenido mal formado no debe tumbar el resto de la página. */
class ErrorBoundary extends Component<{ children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  render() {
    return this.state.fallo ? <p>No hemos podido generar esta sección.</p> : this.props.children;
  }
}
