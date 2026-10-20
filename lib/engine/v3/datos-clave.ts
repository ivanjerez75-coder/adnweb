import type { RawData } from "../types";
import type { ClaseDato, Tipologia } from "./clases";
import type { Metrica, PrecioPublicado } from "./estimates";
import type { Evidence } from "./evidence";
import type { Anatomia, Certeza } from "./sections/anatomia";
import type { Competencia } from "./sections/competencia";

/** Dato clave del bloque 2 (sección "Datos clave"): solo se publica con fuente verificable (§11.2). */
export interface DatoClave {
  clave: string;
  etiqueta: string;
  valor: string;
  detalle?: string;
  clase: ClaseDato;
  /** Nombre de la fuente o URL de la página donde se vio. */
  fuente?: string;
  evidencias?: Evidence[];
}

export interface DatosClaveInput {
  tipologias: Tipologia[];
  anatomia: Pick<Anatomia, "lineas" | "monetizacion" | "canales"> & Partial<Pick<Anatomia, "tipologias">>;
  metricas: Metrica[];
  precios: PrecioPublicado[];
  raw: RawData;
  /** Reservado: la comparación con competidores va en el bloque 3. */
  competencia?: Competencia | null;
}

export const MAX_DATOS_CLAVE = 8;
/** Texto mínimo de la home para afirmar que algo no está (igual que en score y diagnóstico). */
const TEXTO_LEGIBLE = 1500;
const MAX_PRECIOS = 4;
const MAX_FUNCIONES = 4;
/** Nunca son datos clave: no hay fuente gratuita fiable (§11.2). */
const PROHIBIDAS = new Set(["visitas_mensuales", "valoracion", "escenario_ingresos"]);

type Regla = (input: DatosClaveInput) => DatoClave | null;

const SIMBOLO: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
const PERIODO: Record<string, string> = { mes: "/mes", año: "/año", unico: " (pago único)" };

const importe = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
const formatoPrecio = (p: PrecioPublicado) => `${importe(p.importe)} ${SIMBOLO[p.moneda] ?? p.moneda}${p.periodicidad ? PERIODO[p.periodicidad] : ""}`;
const legible = (raw: RawData) => !!raw.site && raw.site.textLength >= TEXTO_LEGIBLE;
const conPagina = (evs: Evidence[]) => evs.some((e) => e.tipo === "pagina");
const unicos = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

// ---------- Reglas por tipología (§11.1) ----------

const planesPublicados: Regla = ({ precios }) => {
  if (precios.length === 0) return null;
  const lista = precios.slice(0, MAX_PRECIOS).map((p) => (p.plan ? `${p.plan}: ${formatoPrecio(p)}` : formatoPrecio(p)));
  return {
    clave: "planes_publicados",
    etiqueta: "Planes publicados",
    valor: lista.join(" · "),
    detalle: precios.length > MAX_PRECIOS ? `${precios.length} precios publicados; se muestran ${MAX_PRECIOS}` : undefined,
    clase: "observado",
    fuente: precios[0].url,
  };
};

const pruebaGratuita: Regla = ({ raw, anatomia }) => {
  const canal = anatomia.canales.find((c) => c.tipo === "prueba_gratuita" && conPagina(c.evidencias));
  if (raw.site?.hasFreePlanOrTrial || canal) {
    return {
      clave: "prueba_gratuita",
      etiqueta: "Prueba o plan gratuito",
      valor: "Sí",
      clase: "observado",
      fuente: canal?.evidencias.find((e) => e.tipo === "pagina")?.url ?? raw.site?.finalUrl,
      ...(canal ? { evidencias: canal.evidencias } : {}),
    };
  }
  // Decir "No" exige haber leído bastante texto de la web.
  if (!legible(raw)) return null;
  return { clave: "prueba_gratuita", etiqueta: "Prueba o plan gratuito", valor: "No", detalle: "No se vio en las páginas leídas", clase: "observado", fuente: raw.site!.finalUrl };
};

const funcionalidades: Regla = ({ anatomia }) => {
  const linea = anatomia.lineas[0];
  if (!linea || linea.evidencias.length === 0) return null;
  const funciones = unicos(linea.queOfrece).slice(0, MAX_FUNCIONES);
  if (funciones.length === 0) return null;
  return {
    clave: "funcionalidades",
    etiqueta: "Funcionalidades principales",
    valor: funciones.join(", "),
    detalle: `De la línea principal: ${linea.nombre}`,
    clase: "inferencia",
    evidencias: linea.evidencias,
  };
};

const catalogo: Regla = ({ raw }) => {
  const n = raw.comercio?.catalogoAprox;
  if (n == null || n <= 0) return null;
  return {
    clave: "catalogo_aprox",
    etiqueta: "Catálogo aproximado",
    valor: `≈ ${n.toLocaleString("es-ES")} productos`,
    detalle: raw.sitemap?.complete ? "Según el sitemap (aproximado)" : "Según el sitemap (aproximado; puede haber más)",
    clase: "inferencia",
    fuente: "sitemap",
  };
};

const rangoPrecios: Regla = ({ precios }) => {
  if (precios.length === 0) return null;
  // Solo la moneda más frecuente: no se mezclan euros y dólares.
  const cuenta = new Map<string, number>();
  for (const p of precios) cuenta.set(p.moneda, (cuenta.get(p.moneda) ?? 0) + 1);
  const moneda = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const xs = precios.filter((p) => p.moneda === moneda).map((p) => p.importe);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const s = SIMBOLO[moneda] ?? moneda;
  return {
    clave: "rango_precios",
    etiqueta: "Rango de precios",
    valor: min === max ? `${importe(min)} ${s}` : `${importe(min)} – ${importe(max)} ${s}`,
    detalle: "Precios vistos en las páginas leídas",
    clase: "observado",
    fuente: precios[0].url,
  };
};

const enviosDevoluciones: Regla = ({ raw }) => {
  const c = raw.comercio;
  if (!c) return null;
  const urls = [c.envios, c.devoluciones].filter((u): u is string => !!u);
  const valor =
    c.envios && c.devoluciones
      ? "Publicados"
      : c.envios
        ? "Envíos publicados; no se encontró la página de devoluciones"
        : c.devoluciones
          ? "Devoluciones publicadas; no se encontró la página de envíos"
          : "No se encontró la página";
  return {
    clave: "envios_devoluciones",
    etiqueta: "Envíos y devoluciones",
    valor,
    ...(urls.length > 0 ? { detalle: urls.join(" · ") } : {}),
    clase: "observado",
    fuente: urls[0] ?? raw.site?.finalUrl,
  };
};

const mediosPago: Regla = ({ raw }) => {
  const pagos = raw.comercio?.pagos ?? [];
  if (pagos.length === 0) return null;
  return { clave: "medios_pago", etiqueta: "Medios de pago", valor: pagos.join(", "), clase: "observado", fuente: raw.site?.finalUrl };
};

const confianzaLegal: Regla = ({ raw }) => {
  const lg = raw.legal;
  if (!lg) return null;
  const partes = [lg.avisoLegal && "aviso legal", lg.cif && `CIF ${lg.cif}`, lg.privacidad && "política de privacidad"].filter(
    (x): x is string => !!x,
  );
  if (partes.length === 0) return null;
  return {
    clave: "confianza_legal",
    etiqueta: "Confianza (datos legales)",
    valor: `Publica ${partes.join(", ")}`,
    clase: "observado",
    fuente: lg.avisoLegal ?? lg.fuentes.cif ?? lg.privacidad ?? undefined,
  };
};

const casosExito: Regla = ({ raw }) => {
  if (raw.site?.hasTestimonials) {
    return { clave: "casos_exito", etiqueta: "Casos de éxito y testimonios", valor: "Sí", clase: "observado", fuente: raw.site.finalUrl };
  }
  if (!legible(raw)) return null;
  return {
    clave: "casos_exito",
    etiqueta: "Casos de éxito y testimonios",
    valor: "No",
    detalle: "No se vieron en las páginas leídas",
    clase: "observado",
    fuente: raw.site!.finalUrl,
  };
};

const servicios: Regla = ({ anatomia }) => {
  const conEv = anatomia.lineas.filter((l) => l.evidencias.length > 0);
  const nombres = unicos(conEv.map((l) => l.nombre)).slice(0, MAX_FUNCIONES);
  if (nombres.length === 0) return null;
  return {
    clave: "servicios",
    etiqueta: "Servicios",
    valor: nombres.join(", "),
    clase: "inferencia",
    evidencias: conEv.flatMap((l) => l.evidencias).slice(0, 4),
  };
};

const modeloContratacion: Regla = ({ anatomia }) => {
  const conEv = anatomia.lineas.filter((l) => l.comoSeContrata.trim() !== "" && l.evidencias.length > 0);
  const modos = unicos(conEv.map((l) => l.comoSeContrata)).slice(0, 3);
  if (modos.length === 0) return null;
  return {
    clave: "modelo_contratacion",
    etiqueta: "Modelo de contratación",
    valor: modos.join(" · "),
    clase: "inferencia",
    evidencias: conEv.flatMap((l) => l.evidencias).slice(0, 4),
  };
};

const monetizacion = (clave: string, etiqueta: string): Regla => ({ anatomia }) => {
  const fuentes = anatomia.monetizacion.filter((m) => m.nivel !== "desconocido" && m.evidencias.length > 0);
  if (fuentes.length === 0) return null;
  const confirmado = fuentes.every((m) => m.nivel === "confirmado");
  return {
    clave,
    etiqueta,
    valor: unicos(fuentes.map((m) => m.fuente)).join(", "),
    detalle: fuentes.map((m) => `${m.fuente}: ${m.nivel}`).join(" · "),
    clase: confirmado && fuentes.some((m) => conPagina(m.evidencias)) ? "observado" : "inferencia",
    evidencias: fuentes.flatMap((m) => m.evidencias).slice(0, 4),
  };
};

const categorias: Regla = ({ anatomia }) => {
  const conEv = anatomia.lineas.filter((l) => l.evidencias.length > 0);
  const nombres = unicos(conEv.map((l) => l.nombre)).slice(0, 6);
  if (nombres.length < 1) return null;
  return { clave: "categorias", etiqueta: "Categorías", valor: nombres.join(", "), clase: "inferencia", evidencias: conEv.flatMap((l) => l.evidencias).slice(0, 4) };
};

const legalCampo =
  (campo: "direccion" | "telefono" | "email", clave: string, etiqueta: string): Regla =>
  ({ raw }) => {
    const v = raw.legal?.[campo];
    if (!v) return null;
    return { clave, etiqueta, valor: v, clase: "observado", fuente: raw.legal!.fuentes[campo] };
  };

const horario: Regla = ({ raw }) => {
  const h = raw.local?.horario;
  if (!h) return null;
  return { clave: "horario", etiqueta: "Horario", valor: h, clase: "observado", fuente: raw.site?.finalUrl };
};

const transparencia: Regla = ({ raw }) => {
  const lg = raw.legal;
  if (!lg) return null;
  const partes = [lg.avisoLegal && "aviso legal", lg.cif && `CIF ${lg.cif}`, lg.razonSocial && `razón social ${lg.razonSocial}`].filter(
    (x): x is string => !!x,
  );
  if (partes.length === 0) return null;
  return { clave: "transparencia", etiqueta: "Transparencia", valor: `Publica ${partes.join(", ")}`, clase: "observado", fuente: lg.avisoLegal ?? lg.fuentes.cif ?? undefined };
};

const contacto: Regla = ({ raw }) => {
  const lg = raw.legal;
  const partes = [lg?.email, lg?.telefono].filter((x): x is string => !!x);
  if (!lg || partes.length === 0) return null;
  return { clave: "contacto", etiqueta: "Contacto", valor: partes.join(" · "), clase: "observado", fuente: lg.fuentes.email ?? lg.fuentes.telefono };
};

const valoracionApp: Regla = ({ raw }) => {
  const a = raw.appstore;
  if (!a || a.rating == null || a.ratingCount <= 0) return null;
  return {
    clave: "valoracion_app",
    etiqueta: "Valoración en la App Store",
    valor: `${a.rating.toLocaleString("es-ES", { maximumFractionDigits: 1 })} / 5`,
    detalle: `${a.ratingCount.toLocaleString("es-ES")} valoraciones`,
    clase: "fuente_externa",
    fuente: a.url,
  };
};

/** Indicadores por tipología, en orden de importancia (§11.1). */
export const REGLAS_TIPOLOGIA: Record<Tipologia, Regla[]> = {
  saas: [planesPublicados, pruebaGratuita, funcionalidades],
  freemium: [pruebaGratuita, planesPublicados, funcionalidades],
  app: [valoracionApp, planesPublicados, funcionalidades],
  ecommerce: [catalogo, rangoPrecios, enviosDevoluciones, mediosPago, confianzaLegal],
  marketplace: [categorias, monetizacion("monetizacion", "Modelo de monetización")],
  servicio_profesional: [servicios, modeloContratacion, casosExito],
  negocio_local: [legalCampo("direccion", "ubicacion", "Ubicación"), legalCampo("telefono", "telefono", "Teléfono"), horario, legalCampo("email", "email", "Correo")],
  organizacion_social: [monetizacion("financiacion", "Financiación declarada"), transparencia, contacto],
  contenido: [funcionalidades],
  web_informativa: [contacto],
};

/** Lo que el diagnóstico debe mirar según la tipología (§11.1), para el prompt. */
export const FOCO_TIPOLOGIA: Record<Tipologia, string> = {
  saas: "planes y precios publicados, prueba o plan gratuito, funcionalidades principales, diferencias funcionales frente a competidores, claridad de la oferta y de la contratación",
  freemium: "qué incluye el plan gratuito, el paso al plan de pago, precios publicados y claridad de la oferta",
  app: "valoraciones en las tiendas de apps, qué hace la app, cómo se descarga y cómo se paga",
  ecommerce: "catálogo, rango de precios, envíos y devoluciones publicados, medios de pago visibles y confianza (aviso legal, CIF, opiniones)",
  marketplace: "qué conecta (los dos lados), categorías y modelo de monetización (comisión, suscripción) si se publica",
  servicio_profesional: "servicios y especialización, modelo de contratación o precios si los hay, casos de éxito, testimonios y clientes citados",
  negocio_local: "actividad, ubicación, teléfono, contacto y horario, presencia digital y facilidad para pedir el servicio",
  organizacion_social: "actividad, fuentes de financiación declaradas, transparencia (aviso legal, memoria) y contacto",
  contenido: "temática y frecuencia de publicación, cómo se financia el contenido y cómo se suscribe el lector",
  web_informativa: "qué ofrece, a quién y cómo se contacta",
};

/** Indicadores generales: van tras los de la tipología. Nunca visitas ni valoración. */
const GENERALES = ["pagespeed_movil", "accesibilidad"] as const;

const PESO_CERTEZA: Record<Certeza, number> = { alta: 0, media: 1, baja: 2 };

/** Tipologías ordenadas por certeza (alta primero); a igualdad, en su orden. */
function ordenarTipologias(input: DatosClaveInput): Tipologia[] {
  const peso = (t: Tipologia) => {
    const c = input.anatomia.tipologias?.find((a) => a.tipo === t)?.certeza;
    return c ? PESO_CERTEZA[c] : 1;
  };
  return input.tipologias.map((tipo, i) => ({ tipo, i })).sort((a, b) => peso(a.tipo) - peso(b.tipo) || a.i - b.i).map((x) => x.tipo);
}

function datoMetrica(m: Metrica): DatoClave | null {
  if (m.estado !== "disponible" || typeof m.valor !== "number" || PROHIBIDAS.has(m.clave)) return null;
  return { clave: m.clave, etiqueta: m.etiqueta, valor: `${m.valor}${m.unidad}`, clase: m.tipo, fuente: m.fuente };
}

/**
 * Datos clave según la tipología (§11.1), solo con fuente verificable (§11.2). Un negocio híbrido usa
 * la unión, sin repetir, empezando por la tipología de mayor certeza. Hasta 8: los de la tipología
 * primero, luego los generales (PageSpeed móvil, accesibilidad). Nunca visitas.
 */
export function seleccionarDatosClave(input: DatosClaveInput): DatoClave[] {
  const out: DatoClave[] = [];
  const vistas = new Set<string>();
  const add = (d: DatoClave | null) => {
    if (!d || vistas.has(d.clave) || PROHIBIDAS.has(d.clave) || out.length >= MAX_DATOS_CLAVE) return;
    // Sin fuente verificable (ni fuente ni evidencias) no se publica.
    if (!d.fuente && (!d.evidencias || d.evidencias.length === 0)) return;
    if (!d.valor.trim()) return;
    vistas.add(d.clave);
    const limpio: DatoClave = { ...d };
    if (limpio.detalle === undefined) delete limpio.detalle;
    if (limpio.fuente === undefined) delete limpio.fuente;
    if (limpio.evidencias === undefined) delete limpio.evidencias;
    out.push(limpio);
  };
  for (const tipo of ordenarTipologias(input)) {
    for (const regla of REGLAS_TIPOLOGIA[tipo] ?? []) add(regla(input));
  }
  for (const clave of GENERALES) {
    const m = input.metricas.find((x) => x.clave === clave);
    if (m) add(datoMetrica(m));
  }
  return out;
}
