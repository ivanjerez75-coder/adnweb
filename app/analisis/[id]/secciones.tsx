"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Evidence } from "@/lib/engine/v3/evidence";
import type { DnaScore, Indicador } from "@/lib/engine/v3/score";
import type { Metrica } from "@/lib/engine/v3/estimates";
import type { Adn, AdnBloque } from "@/lib/engine/v3/sections/adn";
import type { Competidor } from "@/lib/engine/v3/sections/competidores";
import type { Revision } from "@/lib/engine/v3/sections/revision";
import type { ItemAprender } from "@/lib/engine/v3/sections/aprender";
import type { Cierre } from "@/lib/engine/v3/sections/cierre";
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

const TIPO: Record<string, string> = { observado: "Observado", estimado: "Estimado", hipotetico: "Hipotético" };
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

function MetricaVista({ m }: { m: Metrica }) {
  const valor = valorMetrica(m);
  // R7: la etiqueta de tipo solo se muestra si el dato está disponible.
  const disponible = m.estado === "disponible";
  return (
    <li>
      <strong>{m.etiqueta}:</strong> {valor ?? "—"}
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
      <Lista titulo="Limitaciones" items={m.limitaciones} />
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
  const normales = todas.filter((m) => m.tipo !== "hipotetico");
  const hipoteticas = todas.filter((m) => m.tipo === "hipotetico");
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
              <MetricaVista key={m.clave} m={m} />
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

function AdnVista({ c }: { c: unknown }) {
  const a = c as Adn;
  return (
    <>
      <Bloque titulo="Qué es" b={a.queEs} />
      <Bloque titulo="Propuesta de valor" b={a.propuestaValor} />
      <p>
        Modelo de negocio: {a.tipoNegocio} ({a.modeloEstado ?? "desconocido"})
      </p>
      {arr<Adn["lineas"][number]>(a.lineas).map((l, i) => (
        <section key={i}>
          <h3>{l.nombre}</h3>
          <ul>
            <li>Qué ofrece: {arr<string>(l.queOfrece).join(", ")}</li>
            <li>Público: {l.publico}</li>
            <li>Cómo se contrata: {l.comoSeContrata}</li>
            <li>Ingresos: {l.ingresos}</li>
          </ul>
          <Evidencias lista={l.evidencias} />
        </section>
      ))}
      <Bloque titulo="Cómo funciona" b={a.comoFunciona} />
      {arr<Adn["canales"][number]>(a.canales).length > 0 && (
        <>
          <h3>Canales de conversión</h3>
          <ul>
            {arr<Adn["canales"][number]>(a.canales).map((k, i) => (
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

function Saber({ c }: { c: unknown }) {
  return (
    <ul>
      {arr<string>(c).map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function IndicadorVista({ i }: { i: Indicador }) {
  return (
    <li>
      {i.nombre}:{" "}
      {i.evaluado ? (
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

function ScoreVista({ c, cierre }: { c: unknown; cierre: unknown }) {
  const s = c as DnaScore;
  const motivos = (cierre as Cierre | null)?.motivos ?? {};
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
          {arr<string>((motivos as Record<string, unknown>)[k.clave]).map((m, i) => (
            <p key={i}>{m}</p>
          ))}
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

const CONF_REV: Record<string, string> = { alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" };

function Ficha({ x }: { x: { relevancia?: string; confianza?: string; limitaciones?: string[] } }) {
  return (
    <>
      {x.relevancia ? (
        <>
          <br />
          <small>Relevancia: {x.relevancia}</small>
        </>
      ) : null}
      {x.confianza ? (
        <>
          <br />
          <small>{CONF_REV[x.confianza] ?? x.confianza}</small>
        </>
      ) : null}
      {arr<string>(x.limitaciones).length > 0 && (
        <ul>
          {arr<string>(x.limitaciones).map((l, i) => (
            <li key={i}>
              <small>Limitación: {l}</small>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RevisionVista({ c }: { c: unknown }) {
  const r = c as Revision;
  return (
    <>
      <h3>Qué hace bien</h3>
      <ul>
        {arr<Revision["bien"][number]>(r.bien).map((b, i) => (
          <li key={i}>
            {b.texto}
            <Ficha x={b} />
            <Evidencias lista={b.evidencias} />
          </li>
        ))}
      </ul>
      <h3>Problemas</h3>
      <ul>
        {arr<Revision["problemas"][number]>(r.problemas).map((p, i) => (
          <li key={i}>
            <strong>{p.linea}:</strong> {p.problema}
            <br />
            Mejora: {p.mejora}
            <Ficha x={p} />
            <Evidencias lista={p.evidencias} />
          </li>
        ))}
      </ul>
    </>
  );
}

function CompetidoresVista({ c }: { c: unknown }) {
  return (
    <ul>
      {arr<Competidor>(c).map((k, i) => (
        <li key={i}>
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
          )}
          {!k.verificado && <em> — sin verificar</em>}
          <p>{k.ofrece}</p>
          {arr(k.diferencias).length > 0 && (
            <ul>
              {arr<string>(k.diferencias).map((d, j) => (
                <li key={j}>{d}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function AprenderVista({ c }: { c: unknown }) {
  return (
    <ul>
      {arr<ItemAprender>(c).map((i, n) => (
        <li key={n}>
          {i.texto}
          <Evidencias lista={i.evidencias} />
        </li>
      ))}
    </ul>
  );
}

function CierreVista({ c }: { c: unknown }) {
  const acciones = arr<Cierre["oportunidades"][number]>((c as Cierre | null)?.oportunidades);
  return (
    <ol>
      {acciones.map((a, i) => (
        <li key={i}>
          <article>
            <h3>{a.hallazgo}</h3>
            <p>
              <small>{a.confianza === "comprobado" ? "Comprobado" : "Hipótesis"}</small>
            </p>
            <p>Impacto esperado: {a.impacto}</p>
            <p>Acción: {a.accion}</p>
            <p>
              Prioridad: {a.prioridad}. Impacto: {a.impactoNivel}. Esfuerzo: {a.esfuerzo}. Riesgo: {a.riesgo}.
            </p>
            <p>Cómo validarlo: {a.validacion}</p>
            {arr<string>(a.supuestos).length > 0 && (
              <>
                <p>Supuestos:</p>
                <ul>
                  {arr<string>(a.supuestos).map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            <Evidencias lista={a.evidencias} />
          </article>
        </li>
      ))}
    </ol>
  );
}

function Cuerpo({ s, todas }: { s: SeccionVista; todas: SeccionVista[] }) {
  if (s.estado === "pendiente") return <p role="status">Generando…</p>;
  if (s.estado === "error" || s.contenido === null || s.contenido === undefined) {
    return <p>No hemos podido generar esta sección.</p>;
  }
  switch (s.clave) {
    case "datos":
      return <Datos c={s.contenido} />;
    case "adn":
      return <AdnVista c={s.contenido} />;
    case "saber":
      return <Saber c={s.contenido} />;
    case "score":
      return <ScoreVista c={s.contenido} cierre={todas.find((x) => x.clave === "cierre" && x.estado === "lista")?.contenido} />;
    case "revision":
      return <RevisionVista c={s.contenido} />;
    case "competidores":
      return <CompetidoresVista c={s.contenido} />;
    case "aprender":
      return <AprenderVista c={s.contenido} />;
    case "cierre":
      return <CierreVista c={s.contenido} />;
  }
}

const AVISO = "Resume indicadores públicos; no es una valoración financiera.";

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
          <ErrorBoundary><Cuerpo s={s} todas={vistas} /></ErrorBoundary>
          {s.clave === "score" && <p>{AVISO}</p>}
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
