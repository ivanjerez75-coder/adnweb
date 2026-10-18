"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Evidence } from "@/lib/engine/v3/evidence";
import type { Estimacion } from "@/lib/engine/v3/estimates";
import type { DnaScore } from "@/lib/engine/v3/score";
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

function Cifra({ titulo, e }: { titulo: string; e: Estimacion | undefined }) {
  if (!e) return null;
  const v = e.valor;
  const cifra =
    v === null || v === undefined ? null : typeof v === "number" ? `${num(v)} ${e.unidad}` : `${num(v.min)} – ${num(v.max)} ${e.unidad}`;
  return (
    <li>
      <strong>{titulo}:</strong> {cifra ?? "—"}
      {cifra === null && e.motivoNoEstimable ? <> No estimable: {e.motivoNoEstimable}</> : null}
      <br />
      <small>
        Fuente: {e.fuente}. {e.metodologia} Confianza: {e.confianza}.
      </small>
    </li>
  );
}

function Datos({ c }: { c: unknown }) {
  const d = (c ?? {}) as {
    trafico?: Estimacion;
    ingresos?: Estimacion;
    valoracion?: Estimacion;
    seo?: {
      paginasSitemap: number | null;
      pagespeedMovil: number | null;
      titulosYDescripciones: { conTitulo: number; conDescripcion: number; total: number };
      idiomas: string[];
      blogActivo: boolean | null;
    };
    publicados?: { etiqueta: string; valor: string; fuente: string; evidencia: string }[];
  };
  const seo = d.seo;
  return (
    <>
      <ul>
        <Cifra titulo="Tráfico" e={d.trafico} />
        <Cifra titulo="Ingresos" e={d.ingresos} />
        <Cifra titulo="Valoración" e={d.valoracion} />
      </ul>
      {seo && (
        <>
          <h3>SEO</h3>
          <ul>
            <li>Páginas en el sitemap: {seo.paginasSitemap ?? "—"}</li>
            <li>PageSpeed móvil: {seo.pagespeedMovil ?? "—"}</li>
            <li>
              Páginas analizadas con título: {seo.titulosYDescripciones.conTitulo} de {seo.titulosYDescripciones.total}; con descripción:{" "}
              {seo.titulosYDescripciones.conDescripcion}
            </li>
            <li>Idiomas: {arr(seo.idiomas).length ? arr<string>(seo.idiomas).join(", ") : "—"}</li>
            <li>Blog activo: {seo.blogActivo === null ? "—" : seo.blogActivo ? "Sí" : "No"}</li>
          </ul>
        </>
      )}
      {d.publicados && d.publicados.length > 0 && (
        <>
          <h3>Datos publicados</h3>
          <ul>
            {arr<NonNullable<typeof d.publicados>[number]>(d.publicados).map((p, n) => (
              <li key={`${p.evidencia}-${n}`}>
                {p.etiqueta}: {p.valor} <small>({p.fuente})</small>
              </li>
            ))}
          </ul>
        </>
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
      <p>Tipo de negocio: {a.tipoNegocio}</p>
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

function ScoreVista({ c, cierre }: { c: unknown; cierre: unknown }) {
  const s = c as DnaScore;
  const motivos = (cierre as Cierre | null)?.motivos ?? {};
  return (
    <>
      <p>
        Puntuación global: <strong>{s.global === null ? "No puntuable" : `${s.global} / 100`}</strong>
      </p>
      <ul>
        {arr<DnaScore["criterios"][number]>(s.criterios).map((k) => (
          <li key={k.clave}>
            <strong>{k.nombre}:</strong> {k.valor === null ? "No puntuable" : `${k.valor} / 100`}
            {arr(k.motivos).length > 0 && <small> ({arr<string>(k.motivos).join("; ")})</small>}
            {arr<string>(motivos[k.clave]).map((m, i) => (
              <p key={i}>{m}</p>
            ))}
            <Evidencias lista={k.evidencias} />
          </li>
        ))}
      </ul>
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
  const acciones = arr<Cierre["acciones"][number]>((c as Cierre | null)?.acciones);
  return (
    <ol>
      {acciones.map((a, i) => (
        <li key={i}>
          <strong>{a.que}</strong>
          <p>{a.porque}</p>
          <p>
            Impacto: {a.impacto}. Esfuerzo: {a.esfuerzo}.
          </p>
          {arr(a.datosQueFaltan).length > 0 && <p>Datos que faltan: {arr<string>(a.datosQueFaltan).join("; ")}</p>}
          <Evidencias lista={a.evidencias} />
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
