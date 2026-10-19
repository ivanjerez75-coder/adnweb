import type { RawData, Signal } from "../types";
import type { Facts } from "../facts";
import { allTechnologies } from "../signals";
import { radarRank, validRank } from "../anchors";
import type { Evidence } from "./evidence";
import type { Metrica } from "./estimates";
import type { Adn } from "./sections/adn";
import type { Revision } from "./sections/revision";

export const METODOLOGIA_DNA = "dna-score-1.0" as const;
export const AVISO_SCORE = "Resume indicadores públicos; no es una valoración financiera." as const;
export const AVISO_PESOS = "Pesos provisionales, pendientes de validación." as const;

export type DimensionClave = "propuesta" | "oferta" | "experiencia" | "adquisicion" | "confianza";

/** Pesos provisionales y versionados con la metodología. */
export const PESOS_DNA: Record<DimensionClave, number> = {
  propuesta: 0.2,
  oferta: 0.2,
  experiencia: 0.2,
  adquisicion: 0.2,
  confianza: 0.2,
};

/** Cobertura mínima de una dimensión para ser puntuable (< 50 % = "No puntuable"). */
export const COBERTURA_MIN_DIMENSION = 0.5;
/** Cobertura global mínima (< 60 % = "DNA Score no disponible"). */
export const COBERTURA_MIN_GLOBAL = 0.6;
/** Dimensiones puntuables mínimas para dar una puntuación global. */
export const DIMENSIONES_MIN = 3;

export interface Indicador {
  clave: string;
  nombre: string;
  /** false = no aplica a este tipo de negocio: no puntúa ni cuenta en la cobertura. */
  aplica: boolean;
  evaluado: boolean;
  puntos: number;
  maximo: number;
  motivo: string;
  evidencias: Evidence[];
}
export interface DimensionScore {
  clave: DimensionClave;
  nombre: string;
  peso: number;
  /** 0-100, o null = "No puntuable". */
  valor: number | null;
  /** 0-1: indicadores evaluados / indicadores aplicables. */
  cobertura: number;
  indicadores: Indicador[];
  /** Resumen en lenguaje llano construido en código a partir de los indicadores evaluados. */
  resumen: string;
}
export interface DnaScore {
  metodologia: typeof METODOLOGIA_DNA;
  dimensiones: DimensionScore[];
  /** null = "DNA Score no disponible". */
  global: number | null;
  coberturaGlobal: number;
  avisos: [typeof AVISO_SCORE, typeof AVISO_PESOS];
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
/** Texto mínimo de la home para afirmar que algo no está (igual que en facts). */
const TEXTO_LEGIBLE = 1500;

type Reg = Map<string, Evidence>;

function ev(reg: Reg, ids: (string | null | undefined | false)[]): Evidence[] {
  const out: Evidence[] = [];
  for (const id of ids) {
    const e = id ? reg.get(id) : undefined;
    if (e && !out.some((o) => o.id === e.id)) out.push(e);
  }
  return out;
}
function unicas(...grupos: Evidence[][]): Evidence[] {
  const out: Evidence[] = [];
  for (const g of grupos) for (const e of g) if (!out.some((o) => o.id === e.id)) out.push(e);
  return out;
}

/** Indicador con dato: puntos acotados a [0, máximo]. */
function ind(clave: string, nombre: string, puntos: number, maximo: number, motivo: string, evidencias: Evidence[] = []): Indicador {
  return { clave, nombre, aplica: true, evaluado: true, puntos: Math.max(0, Math.min(maximo, Math.round(puntos))), maximo, motivo, evidencias };
}
/** Indicador sin datos: no puntúa, no cuenta en la cobertura. */
function sinDato(clave: string, nombre: string, maximo: number, motivo: string): Indicador {
  return { clave, nombre, aplica: true, evaluado: false, puntos: 0, maximo, motivo, evidencias: [] };
}
export const MOTIVO_NO_APLICA = "No aplica a este tipo de negocio";
/** Indicador que no aplica al tipo de negocio: ni puntúa ni cuenta en la cobertura. */
function noAplica(clave: string, nombre: string, maximo: number): Indicador {
  return { clave, nombre, aplica: false, evaluado: false, puntos: 0, maximo, motivo: MOTIVO_NO_APLICA, evidencias: [] };
}

type TipoNegocio = Adn["tipoNegocio"];
/** Tipos de negocio a los que aplica cada indicador de monetización (el resto siempre aplica). */
const APLICA_A: Record<string, readonly TipoNegocio[]> = {
  plan_gratuito: ["saas", "app"],
  pagos: ["ecommerce", "saas", "marketplace", "app"],
  pagina_precios: ["saas", "ecommerce", "marketplace", "app"],
};
const aplicaA = (clave: string, tipo: TipoNegocio) => APLICA_A[clave]?.includes(tipo) ?? true;

function metrica(metricas: Metrica[], clave: string): Metrica | undefined {
  return metricas.find((m) => m.clave === clave);
}
/** Valor numérico de una métrica solo si está disponible. */
function numero(metricas: Metrica[], clave: string): number | null {
  const m = metrica(metricas, clave);
  return m && m.estado === "disponible" && typeof m.valor === "number" && Number.isFinite(m.valor) ? m.valor : null;
}
function motivoMetrica(metricas: Metrica[], clave: string, defecto: string): string {
  return metrica(metricas, clave)?.motivoConfianza || defecto;
}

const legible = (raw: RawData) => !!raw.site && raw.site.textLength >= TEXTO_LEGIBLE;

// ---------- Propuesta de valor ----------

function bloque(clave: string, nombre: string, b: Adn["queEs"], raw: RawData, maximo: number): Indicador {
  if (!raw.site) return sinDato(clave, nombre, maximo, "No se pudo leer la web, así que no se evalúa.");
  if (b && b.texto.trim() !== "" && b.evidencias.length > 0) return ind(clave, nombre, maximo, maximo, "Se explica y está respaldado por citas de la web.", b.evidencias);
  return ind(clave, nombre, 0, maximo, "La web se leyó pero no se encontró una explicación citable.");
}

function propuesta(raw: RawData, adn: Adn, revision: Revision | null): Indicador[] {
  let si = 0;
  let validos = 0;
  const evCheck: Evidence[][] = [];
  for (const l of revision?.lineas ?? []) {
    for (const k of ["propuestaClara", "diceAQuien"] as const) {
      const v = l.checks[k];
      if (v === "no_aplica") continue;
      validos++;
      if (v === "si") si++;
    }
    evCheck.push(l.evidenciasChecks);
  }
  const claridad =
    revision && validos > 0
      ? ind("claridad_web", "La web deja claro qué es y para quién", (30 * si) / validos, 30, `${si} de ${validos} comprobaciones de claridad cumplidas (propuesta clara y a quién se dirige).`, unicas(...evCheck))
      : sinDato("claridad_web", "La web deja claro qué es y para quién", 30, "No hay revisión de la web con comprobaciones aplicables.");

  // El estado del modelo lo calcula el código al generar el adn (confirmado exige respaldo en la web).
  const evContratacion = unicas(...adn.lineas.filter((l) => l.comoSeContrata.trim() !== "").map((l) => l.evidencias.filter((e) => e.tipo === "pagina")));
  const NOMBRE_MODELO = "Se entiende cómo gana dinero";
  const modelo = !raw.site
    ? sinDato("modelo_negocio", NOMBRE_MODELO, 20, "No se pudo leer la web, así que no se evalúa.")
    : adn.modeloEstado === "confirmado"
      ? ind("modelo_negocio", NOMBRE_MODELO, 20, 20, "El modelo de negocio está confirmado: se explica cómo se contrata y hay precio o canal visible en la web.", evContratacion)
      : adn.modeloEstado === "probable"
        ? ind("modelo_negocio", NOMBRE_MODELO, 10, 20, "El modelo de negocio se deduce de la web pero no está confirmado.", evContratacion)
        : ind("modelo_negocio", NOMBRE_MODELO, 0, 20, "No se pudo determinar cómo gana dinero el negocio a partir de la web.");

  return [
    bloque("que_es", "Se explica qué es el negocio", adn.queEs, raw, 25),
    bloque("propuesta_valor", "Se explica la propuesta de valor", adn.propuestaValor, raw, 25),
    claridad,
    modelo,
  ];
}

// ---------- Oferta y monetización ----------

function ofertaIndicadores(raw: RawData, facts: Facts, adn: Adn, reg: Reg): Indicador[] {
  const site = raw.site;
  const fin = legible(raw);
  const out: Indicador[] = [];

  const evPrecios = [...reg.keys()].filter((k) => k.startsWith("dato:precio:")).map((k) => reg.get(k)!);
  if (!site) {
    out.push(sinDato("precios_publicados", "Precios publicados", 25, "No se pudo leer la web."));
  } else if (site.pricesFound.length > 0 || evPrecios.length > 0) {
    out.push(ind("precios_publicados", "Precios publicados", 25, 25, `Se detectaron ${Math.max(site.pricesFound.length, evPrecios.length)} precio(s) publicados.`, evPrecios.slice(0, 3)));
  } else if (fin) {
    out.push(ind("precios_publicados", "Precios publicados", 0, 25, "La web se leyó y no muestra precios."));
  } else {
    out.push(sinDato("precios_publicados", "Precios publicados", 25, "Se leyó poco texto de la web: no se puede afirmar que no haya precios."));
  }

  out.push(
    facts.paginaPrecios === "si"
      ? ind("pagina_precios", "Página de precios", 15, 15, "Existe una página o ruta de precios.")
      : facts.paginaPrecios === "no"
        ? ind("pagina_precios", "Página de precios", 0, 15, "Se comprobó por varias vías y no hay página de precios.")
        : sinDato("pagina_precios", "Página de precios", 15, "No se pudo comprobar si hay página de precios."),
  );

  // Un canal puede venir de un extracto de página o del dato de contacto publicado (respaldo del adn).
  const canales = adn.canales.filter((c) => c.evidencias.length > 0);
  if (!site) {
    out.push(sinDato("canal_conversion", "Canal de conversión evidenciado", 20, "No se pudo leer la web."));
  } else if (canales.length > 0) {
    out.push(
      ind(
        "canal_conversion",
        "Canal de conversión evidenciado",
        20,
        20,
        `La web ofrece ${canales.length === 1 ? "un canal" : `${canales.length} canales`} para convertirse en cliente (${canales.map((c) => c.tipo.replace("_", " ")).join(", ")}), con evidencia de la web.`,
        unicas(...canales.map((c) => c.evidencias)),
      ),
    );
  } else if (fin) {
    out.push(ind("canal_conversion", "Canal de conversión evidenciado", 0, 20, "No se encontró ninguna forma clara de contratar o contactar."));
  } else {
    out.push(sinDato("canal_conversion", "Canal de conversión evidenciado", 20, "Se leyó poco texto de la web."));
  }

  if (!site) out.push(sinDato("plan_gratuito", "Plan gratuito o prueba", 15, "No se pudo leer la web."));
  else if (site.hasFreePlanOrTrial) out.push(ind("plan_gratuito", "Plan gratuito o prueba", 15, 15, "La web ofrece un plan gratuito o una prueba."));
  else if (fin) out.push(ind("plan_gratuito", "Plan gratuito o prueba", 0, 15, "La web se leyó y no ofrece plan gratuito ni prueba."));
  else out.push(sinDato("plan_gratuito", "Plan gratuito o prueba", 15, "Se leyó poco texto de la web."));

  if (!site) out.push(sinDato("pagos", "Cobra en línea (tecnología de pagos)", 25, "No se pudo leer la web."));
  else {
    const pagos = allTechnologies(raw).filter((t) => t.category === "pagos");
    if (pagos.length > 0) out.push(ind("pagos", "Cobra en línea (tecnología de pagos)", 25, 25, `Tecnología de pagos detectada: ${pagos.map((t) => t.name).join(", ")}.`));
    else if (fin) out.push(ind("pagos", "Cobra en línea (tecnología de pagos)", 0, 25, "No se detectó tecnología de pagos en la web."));
    else out.push(sinDato("pagos", "Cobra en línea (tecnología de pagos)", 25, "Se leyó poco texto de la web."));
  }
  return out;
}

/** Los indicadores que no aplican al tipo de negocio se sustituyen por "no aplica". */
function oferta(raw: RawData, facts: Facts, adn: Adn, reg: Reg): Indicador[] {
  return ofertaIndicadores(raw, facts, adn, reg).map((i) => (aplicaA(i.clave, adn.tipoNegocio) ? i : noAplica(i.clave, i.nombre, i.maximo)));
}

// ---------- Experiencia y rendimiento ----------

function experiencia(raw: RawData, metricas: Metrica[], reg: Reg): Indicador[] {
  const evPs = ev(reg, ["dato:pagespeed"]);
  const puntuacion = (clave: string, nombre: string, mclave: string, max: number): Indicador => {
    const v = numero(metricas, mclave);
    return v === null
      ? sinDato(clave, nombre, max, motivoMetrica(metricas, mclave, "PageSpeed no devolvió este dato."))
      : ind(clave, nombre, (max * v) / 100, max, `${v} sobre 100 en PageSpeed (Lighthouse).`, evPs);
  };
  const campo = raw.pagespeed?.campo ?? null;
  const cruxOk = metrica(metricas, "usuarios_reales_crux")?.estado === "disponible" && campo?.categoria;
  const crux = cruxOk
    ? ind(
        "crux",
        "Experiencia de usuarios reales (CrUX)",
        campo!.categoria === "FAST" ? 20 : campo!.categoria === "AVERAGE" ? 10 : 0,
        20,
        `Veredicto de Google sobre usuarios reales de Chrome: ${campo!.categoria}.`,
        ev(reg, ["dato:crux"]),
      )
    : sinDato("crux", "Experiencia de usuarios reales (CrUX)", 20, motivoMetrica(metricas, "usuarios_reales_crux", "Chrome no tiene datos de usuarios reales."));
  return [
    puntuacion("pagespeed_movil", "Velocidad en móvil", "pagespeed_movil", 35),
    puntuacion("accesibilidad", "Accesibilidad", "accesibilidad", 25),
    puntuacion("buenas_practicas", "Buenas prácticas web", "buenas_practicas", 20),
    crux,
  ];
}

// ---------- Adquisición y visibilidad ----------

function adquisicion(raw: RawData, facts: Facts, metricas: Metrica[], reg: Reg): Indicador[] {
  const out: Indicador[] = [];

  const seo = numero(metricas, "seo_tecnico");
  out.push(
    seo === null
      ? sinDato("seo_tecnico", "SEO técnico", 20, motivoMetrica(metricas, "seo_tecnico", "PageSpeed no devolvió este dato."))
      : ind("seo_tecnico", "SEO técnico", (20 * seo) / 100, 20, `${seo} sobre 100 en la auditoría SEO de Lighthouse.`, ev(reg, ["dato:pagespeed"])),
  );

  const paginas = raw.paginas ?? [];
  if (metrica(metricas, "titulos_descripciones")?.estado === "disponible" && paginas.length > 0) {
    const t = paginas.filter((p) => p.titulo.trim().length > 0).length;
    const d = paginas.filter((p) => p.tieneDescripcion).length;
    out.push(ind("titulos_descripciones", "Títulos y descripciones", (15 * (t + d)) / (2 * paginas.length), 15, `${t} de ${paginas.length} páginas con título y ${d} con descripción.`));
  } else out.push(sinDato("titulos_descripciones", "Títulos y descripciones", 15, motivoMetrica(metricas, "titulos_descripciones", "No se leyeron páginas en profundidad.")));

  const n = numero(metricas, "paginas_sitemap");
  out.push(
    n === null
      ? sinDato("sitemap", "Sitemap con contenido", 15, motivoMetrica(metricas, "paginas_sitemap", "No se encontró un sitemap legible."))
      : ind("sitemap", "Sitemap con contenido", n >= 50 ? 15 : n >= 10 ? 10 : 5, 15, `El sitemap declara ${n} página(s).`, ev(reg, ["dato:paginas_sitemap"])),
  );

  const blog = metrica(metricas, "blog_activo");
  out.push(
    blog?.estado === "disponible"
      ? ind("blog_activo", "Blog activo", blog.valor === "Sí" ? 15 : 0, 15, blog.valor === "Sí" ? "Hay entradas de blog de los últimos 90 días." : "No hay entradas de blog recientes en el sitemap.")
      : sinDato("blog_activo", "Blog activo", 15, motivoMetrica(metricas, "blog_activo", "Sin sitemap no se puede saber si el blog está activo.")),
  );

  const nRedes = facts.redes.length;
  if (!raw.site) out.push(sinDato("redes", "Redes sociales", 15, "No se pudo leer la web."));
  else if (nRedes > 0) out.push(ind("redes", "Redes sociales", nRedes >= 3 ? 15 : 8, 15, `${nRedes} red(es) social(es) enlazadas desde la web.`));
  else if (legible(raw)) out.push(ind("redes", "Redes sociales", 0, 15, "La web se leyó y no enlaza redes sociales."));
  else out.push(sinDato("redes", "Redes sociales", 15, "Se leyó poco texto de la web."));

  // Popularidad: solo con datos de ranking. "No aparece" puntúa bajo solo si Tranco respondió bien.
  const tr = numero(metricas, "popularidad_tranco");
  const ra = numero(metricas, "popularidad_radar");
  const rank = tr !== null ? validRank(tr) : ra !== null ? radarRank(raw.radar) : null;
  if (rank !== null) {
    const p = rank <= 10_000 ? 20 : rank <= 100_000 ? 15 : rank <= 1_000_000 ? 10 : 5;
    out.push(ind("popularidad", "Popularidad en rankings públicos", p, 20, `Aparece en rankings públicos (puesto o franja ${rank}). No equivale a visitas.`, ev(reg, ["dato:trafico"])));
  } else if (raw.fuentes.tranco === "ok" && metrica(metricas, "popularidad_tranco")?.estado === "insuficiente") {
    out.push(ind("popularidad", "Popularidad en rankings públicos", 3, 20, "No aparece en el ranking Tranco (que respondió correctamente)."));
  } else out.push(sinDato("popularidad", "Popularidad en rankings públicos", 20, "No hay datos de rankings de popularidad."));
  return out;
}

// ---------- Confianza y transparencia ----------

export const MOTIVO_NO_ES = "Requisito legal español: no aplica a esta web";
const MOTIVO_ILEGIBLE_LEGAL = "Se leyó poco texto de la web (posible web con JavaScript): no se puede afirmar que falte.";

/**
 * Web española: algún idioma es/ca (también es-ES, ca-ES…) o dominio .es/.cat.
 * Sin idiomas conocidos (no se leyó la web) no se puede descartar: se trata como española.
 */
export function esWebEspanola(raw: RawData): boolean {
  const dominio = (raw.rootDomain || raw.domain || "").toLowerCase();
  if (/\.(?:es|cat)$/.test(dominio)) return true;
  const idiomas = [...(raw.site?.languages ?? []), ...(raw.sitemap?.languages ?? [])].map((l) => l.toLowerCase().split(/[-_]/)[0]);
  if (idiomas.length === 0) return !raw.site;
  return idiomas.includes("es") || idiomas.includes("ca");
}

function confianza(raw: RawData, revision: Revision | null, reg: Reg): Indicador[] {
  const lg = raw.legal;
  const leida = legible(raw);
  const espanola = esWebEspanola(raw);
  const sinLegal = (clave: string, nombre: string, max: number) => sinDato(clave, nombre, max, "No se analizaron las páginas legales.");
  // Lo encontrado puntúa siempre; lo que falta solo puntúa 0 si la home se leyó bien (igual que el resto de dimensiones).
  const falta = (clave: string, nombre: string, max: number, motivo: string) =>
    leida ? ind(clave, nombre, 0, max, motivo) : sinDato(clave, nombre, max, MOTIVO_ILEGIBLE_LEGAL);
  const soloEs = (clave: string, nombre: string, max: number, i: () => Indicador): Indicador =>
    espanola ? i() : { clave, nombre, aplica: false, evaluado: false, puntos: 0, maximo: max, motivo: MOTIVO_NO_ES, evidencias: [] };
  const out: Indicador[] = [];

  out.push(
    soloEs("aviso_legal", "Aviso legal", 15, () =>
      !lg
        ? sinLegal("aviso_legal", "Aviso legal", 15)
        : lg.avisoLegal
          ? ind("aviso_legal", "Aviso legal", 15, 15, "Publica un aviso legal.", ev(reg, ["dato:aviso_legal"]))
          : falta("aviso_legal", "Aviso legal", 15, "No se encontró un aviso legal."),
    ),
  );
  out.push(
    !lg
      ? sinLegal("privacidad", "Política de privacidad", 15)
      : lg.privacidad
        ? ind("privacidad", "Política de privacidad", 15, 15, "Publica una política de privacidad.", ev(reg, ["dato:privacidad"]))
        : falta("privacidad", "Política de privacidad", 15, "No se encontró una política de privacidad."),
  );
  out.push(
    soloEs("identidad_legal", "CIF y razón social", 15, () =>
      !lg
        ? sinLegal("identidad_legal", "CIF y razón social", 15)
        : lg.cif && lg.razonSocial
          ? ind("identidad_legal", "CIF y razón social", 15, 15, "Publica CIF y razón social.", ev(reg, ["dato:cif", "dato:razon_social"]))
          : lg.cif || lg.razonSocial
            ? ind("identidad_legal", "CIF y razón social", 8, 15, lg.cif ? "Publica el CIF pero no la razón social." : "Publica la razón social pero no el CIF.", ev(reg, ["dato:cif", "dato:razon_social"]))
            : falta("identidad_legal", "CIF y razón social", 15, "No se encontró CIF ni razón social."),
    ),
  );
  if (!lg) out.push(sinLegal("contacto", "Contacto visible", 15));
  else {
    const n = [lg.email, lg.telefono, lg.direccion].filter(Boolean).length;
    out.push(
      n >= 2
        ? ind("contacto", "Contacto visible", 15, 15, `Publica ${n} vías de contacto (correo, teléfono o dirección).`, ev(reg, ["dato:contacto"]))
        : n === 1
          ? ind("contacto", "Contacto visible", 8, 15, "Publica una sola vía de contacto.", ev(reg, ["dato:contacto"]))
          : falta("contacto", "Contacto visible", 15, "No se encontró ningún dato de contacto."),
    );
  }

  const casosSi = revision?.lineas.some((l) => l.checks.muestraCasos === "si") ?? false;
  if (!raw.site) out.push(sinDato("testimonios", "Testimonios o casos de éxito", 10, "No se pudo leer la web."));
  else if (raw.site.hasTestimonials || casosSi) out.push(ind("testimonios", "Testimonios o casos de éxito", 10, 10, "La web muestra testimonios o casos de éxito."));
  else if (legible(raw)) out.push(ind("testimonios", "Testimonios o casos de éxito", 0, 10, "La web se leyó y no muestra testimonios ni casos."));
  else out.push(sinDato("testimonios", "Testimonios o casos de éxito", 10, "Se leyó poco texto de la web."));

  const reg0 = raw.rdap?.registeredAt ? Date.parse(raw.rdap.registeredAt) : NaN;
  const ref = Date.parse(raw.collectedAt);
  if (Number.isFinite(reg0) && Number.isFinite(ref) && ref >= reg0) {
    const anios = (ref - reg0) / YEAR_MS;
    out.push(ind("dominio_antiguo", "Antigüedad del dominio", anios >= 5 ? 15 : anios >= 2 ? 8 : 0, 15, `Dominio registrado hace ${Math.floor(anios)} año(s). No indica la edad de la empresa.`));
  } else out.push(sinDato("dominio_antiguo", "Antigüedad del dominio", 15, "No hay fecha de registro del dominio (RDAP)."));

  out.push(
    !raw.dns
      ? sinDato("email_corporativo", "Correo corporativo", 15, "No se pudo consultar el DNS del dominio.")
      : raw.dns.emailProvider !== "Ninguno"
        ? ind("email_corporativo", "Correo corporativo", 15, 15, `El dominio tiene correo propio (${raw.dns.emailProvider}).`, ev(reg, ["dato:email"]))
        : ind("email_corporativo", "Correo corporativo", 0, 15, "El dominio no tiene correo propio configurado."),
  );
  return out;
}

// ---------- Agregación ----------

export const RESUMEN_NO_PUNTUABLE = "No hay datos suficientes para puntuar esta dimensión.";
const MAX_RESUMEN = 2;

/** "Puntos fuertes: A (x/y), B (x/y). A mejorar: C (x/y)." Solo indicadores aplicables y evaluados, por puntos/máximo. */
export function resumenDimension(valor: number | null, indicadores: Indicador[]): string {
  if (valor === null) return RESUMEN_NO_PUNTUABLE;
  const ratio = (i: Indicador) => (i.maximo > 0 ? i.puntos / i.maximo : 0);
  const evaluados = indicadores.filter((i) => i.aplica && i.evaluado && i.maximo > 0);
  const fmt = (i: Indicador) => `${i.nombre} (${i.puntos}/${i.maximo})`;
  // sort es estable: a igual proporción se conserva el orden de la metodología.
  const fuertes = [...evaluados].sort((a, b) => ratio(b) - ratio(a)).filter((i) => ratio(i) > 0).slice(0, MAX_RESUMEN);
  const mejorar = [...evaluados].filter((i) => !fuertes.includes(i) && ratio(i) < 1).sort((a, b) => ratio(a) - ratio(b)).slice(0, MAX_RESUMEN);
  const partes: string[] = [];
  if (fuertes.length) partes.push(`Puntos fuertes: ${fuertes.map(fmt).join(", ")}.`);
  if (mejorar.length) partes.push(`A mejorar: ${mejorar.map(fmt).join(", ")}.`);
  return partes.join(" ");
}

function dimension(clave: DimensionClave, nombre: string, indicadores: Indicador[]): DimensionScore {
  const aplicables = indicadores.filter((i) => i.aplica);
  const evaluados = aplicables.filter((i) => i.evaluado);
  const cobertura = aplicables.length === 0 ? 0 : evaluados.length / aplicables.length;
  const maximo = evaluados.reduce((a, i) => a + i.maximo, 0);
  const puntos = evaluados.reduce((a, i) => a + i.puntos, 0);
  const valor = cobertura >= COBERTURA_MIN_DIMENSION && maximo > 0 ? Math.round((100 * puntos) / maximo) : null;
  return { clave, nombre, peso: PESOS_DNA[clave], valor, cobertura, indicadores, resumen: resumenDimension(valor, indicadores) };
}

/** DNA Score v1.0: reglas publicadas y reproducibles. Lo que falta es "no evaluado", nunca 0. */
export function calcularScore(
  raw: RawData,
  facts: Facts,
  signals: Signal[],
  adn: Adn,
  revision: Revision | null,
  metricas: Metrica[],
  reg: Reg = new Map(),
): DnaScore {
  void signals; // v1.0 no usa señales: todo sale de datos y métricas.
  const dimensiones: DimensionScore[] = [
    dimension("propuesta", "Propuesta de valor", propuesta(raw, adn, revision)),
    dimension("oferta", "Oferta y monetización", oferta(raw, facts, adn, reg)),
    dimension("experiencia", "Experiencia y rendimiento", experiencia(raw, metricas, reg)),
    dimension("adquisicion", "Adquisición y visibilidad", adquisicion(raw, facts, metricas, reg)),
    dimension("confianza", "Confianza y transparencia", confianza(raw, revision, reg)),
  ];
  const coberturaGlobal = dimensiones.reduce((a, d) => a + d.cobertura, 0) / dimensiones.length;
  const puntuables = dimensiones.filter((d): d is DimensionScore & { valor: number } => d.valor !== null);
  const pesoTotal = puntuables.reduce((a, d) => a + d.peso, 0);
  const global =
    coberturaGlobal >= COBERTURA_MIN_GLOBAL && puntuables.length >= DIMENSIONES_MIN && pesoTotal > 0
      ? Math.round(puntuables.reduce((a, d) => a + d.valor * d.peso, 0) / pesoTotal)
      : null;
  return { metodologia: METODOLOGIA_DNA, dimensiones, global, coberturaGlobal, avisos: [AVISO_SCORE, AVISO_PESOS] };
}
