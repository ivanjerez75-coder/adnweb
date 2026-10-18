import {
  FX_TO_EUR,
  publicRevenueAnchor,
  type Anchors,
  type TipoNegocio,
} from "../anchors";
import type { Confidence, Range, RawData } from "../types";
import { buildEvidence } from "./evidence";

export interface Estimacion {
  valor: Range | number | null;
  unidad: string;
  fuente: string;
  metodologia: string;
  confianza: Confidence;
  motivoNoEstimable?: string;
}

/** Tablas de referencia (docs/decisiones/0007-estimaciones-v3.md). Conversión en fracción, múltiplo × ingresos anuales. */
const CONVERSION: Partial<Record<TipoNegocio, Range>> = {
  saas: { min: 0.02, max: 0.05 },
  ecommerce: { min: 0.01, max: 0.03 },
  marketplace: { min: 0.01, max: 0.04 },
  app: { min: 0.01, max: 0.03 },
};
const MULTIPLO: Partial<Record<TipoNegocio, Range>> = {
  saas: { min: 3, max: 8 },
  ecommerce: { min: 1, max: 3 },
  marketplace: { min: 2, max: 5 },
  app: { min: 2, max: 6 },
};

const ORDEN: Confidence[] = ["baja", "media", "alta"];
const minConf = (a: Confidence, b: Confidence): Confidence => (ORDEN.indexOf(a) <= ORDEN.indexOf(b) ? a : b);

const noEstimable = (unidad: string, fuente: string, motivo: string): Estimacion => ({
  valor: null,
  unidad,
  fuente,
  metodologia: "No se calcula una cifra para no inventarla.",
  confianza: "baja",
  motivoNoEstimable: motivo,
});

export function estimarTrafico(anchors: Anchors): Estimacion {
  const unidad = "visitas/mes";
  if (!anchors.visitasMes) {
    return noEstimable(unidad, "Tranco / Cloudflare Radar", "No aparece en ningún ranking de popularidad web, así que no hay base para estimar sus visitas.");
  }
  return {
    valor: anchors.visitasMes,
    unidad,
    fuente: "Ranking de popularidad web (Tranco y Cloudflare Radar)",
    metodologia: "Tabla fija que convierte la posición en el ranking en un rango de visitas mensuales (ver decisión 0003).",
    confianza: anchors.confianzaTrafico,
  };
}

/** Convierte "9 €", "$29", "1.200 €" o "9,99 €" a euros. null si no es un precio. */
export function parsearPrecioEur(texto: string): number | null {
  const moneda = /\$|USD/i.test(texto) ? "USD" : /£|GBP/i.test(texto) ? "GBP" : /€|EUR/i.test(texto) ? "EUR" : null;
  const m = texto.match(/\d[\d.,\s]*/);
  if (!m || !moneda) return null;
  let num = m[0].trim().replace(/\s/g, "");
  const punto = num.lastIndexOf(".");
  const coma = num.lastIndexOf(",");
  if (punto >= 0 && coma >= 0) {
    const dec = Math.max(punto, coma);
    num = num.slice(0, dec).replace(/[.,]/g, "") + "." + num.slice(dec + 1);
  } else if (punto >= 0 || coma >= 0) {
    const sep = punto >= 0 ? "." : ",";
    const partes = num.split(sep);
    num = partes.length > 2 || (partes.length === 2 && partes[1].length === 3) ? partes.join("") : partes.join(".");
  }
  const n = Number(num);
  return Number.isFinite(n) && n > 0 ? n * FX_TO_EUR[moneda] : null;
}

const mediana = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const eur = (n: number) => `${Math.round(n * 100) / 100} €`;

export function estimarIngresosMensuales(
  raw: RawData,
  anchors: Anchors,
  tipo: TipoNegocio,
  precios: string[],
): Estimacion {
  const unidad = "€/mes";
  const ancla = anchors.ingresosPublicos ?? publicRevenueAnchor(raw.wikidata);
  if (ancla) {
    return {
      valor: { min: Math.round(ancla.range.min / 12), max: Math.round(ancla.range.max / 12) },
      unidad,
      fuente: "Wikidata (ingresos públicos)",
      metodologia: `${ancla.base}, dividido entre 12 meses.`,
      confianza: ancla.confianza,
    };
  }

  const fuente = "Estimación propia: visitas × conversión de referencia × precio medio";
  const conv = CONVERSION[tipo];
  if (!conv) {
    return noEstimable(unidad, fuente, `Para un negocio de tipo "${tipo}" no hay una conversión de referencia fiable y no hay ingresos públicos, así que no se estima.`);
  }
  if (!anchors.visitasMes) {
    return noEstimable(unidad, fuente, "No hay dato de tráfico (no aparece en los rankings), así que no se puede estimar.");
  }
  const parseados = precios.map(parsearPrecioEur).filter((p): p is number => p !== null);
  if (parseados.length === 0) {
    return noEstimable(unidad, fuente, "No se detectaron precios en la web, así que no hay base para calcular ingresos.");
  }
  const precio = mediana(parseados);
  const v = anchors.visitasMes;
  return {
    valor: { min: v.min * conv.min * precio, max: v.max * conv.max * precio },
    unidad,
    fuente,
    metodologia:
      `Visitas mensuales (${v.min}–${v.max}) × conversión de referencia del tipo ${tipo} ` +
      `(${Math.round(conv.min * 100)}–${Math.round(conv.max * 100)} %) × precio medio de ${eur(precio)} (mediana de ${parseados.length} precio(s) detectados). Se asume que los precios detectados son mensuales.`,
    confianza: "baja",
  };
}

export function estimarValoracion(ingresos: Estimacion, tipo: TipoNegocio): Estimacion {
  const unidad = "€";
  const fuente = "Múltiplo de ingresos anuales de referencia por tipo de negocio";
  const mult = MULTIPLO[tipo];
  const r = ingresos.valor;
  if (r === null || typeof r === "number") {
    return noEstimable(unidad, fuente, "Sin una estimación de ingresos no se puede calcular una valoración.");
  }
  if (!mult) {
    return noEstimable(unidad, fuente, `No hay un múltiplo de referencia para negocios de tipo "${tipo}".`);
  }
  return {
    valor: { min: r.min * 12 * mult.min, max: r.max * 12 * mult.max },
    unidad,
    fuente,
    metodologia: `Ingresos anuales estimados × múltiplo de referencia ${mult.min}–${mult.max} (tipo ${tipo}).`,
    // Un múltiplo genérico nunca da más de confianza "media", aunque los ingresos sean públicos.
    confianza: minConf(ingresos.confianza, "media"),
  };
}

export function metricasSeo(raw: RawData): {
  paginasSitemap: number | null;
  sitemapCompleto: boolean;
  pagespeedMovil: number | null;
  titulosYDescripciones: { conTitulo: number; conDescripcion: number; total: number };
  idiomas: string[];
  blogActivo: boolean | null;
} {
  const paginas = raw.paginas ?? [];
  return {
    paginasSitemap: raw.sitemap ? raw.sitemap.urlCount : null,
    sitemapCompleto: raw.sitemap?.complete ?? false,
    pagespeedMovil: raw.pagespeed?.mobile ?? null,
    titulosYDescripciones: {
      conTitulo: paginas.filter((p) => p.titulo.trim().length > 0).length,
      conDescripcion: paginas.filter((p) => p.tieneDescripcion).length,
      total: paginas.length,
    },
    idiomas: Array.from(new Set([...(raw.site?.languages ?? []), ...(raw.sitemap?.languages ?? [])])),
    blogActivo: raw.sitemap ? raw.sitemap.recentBlogPosts > 0 : null,
  };
}

const ETIQUETAS: [clave: string, etiqueta: string][] = [
  ["fundacion", "Fundación"],
  ["empleados", "Empleados"],
  ["ingresos", "Ingresos anuales"],
  ["sede", "Sede"],
  ["empleo", "Ofertas de empleo"],
  ["app", "App móvil"],
  ["email", "Correo corporativo"],
  ["trafico", "Popularidad web"],
  ["paginas_sitemap", "Páginas en el sitemap"],
  ["idiomas", "Idiomas"],
];

/** Datos publicados por fuentes externas, cada uno con el id `dato:*` del registro de evidencias. */
export function datosPublicados(raw: RawData): { etiqueta: string; valor: string; fuente: string; evidencia: string }[] {
  const reg = buildEvidence(raw, []);
  const out: { etiqueta: string; valor: string; fuente: string; evidencia: string }[] = [];
  for (const [clave, etiqueta] of ETIQUETAS) {
    const e = reg.get(`dato:${clave}`);
    if (e) out.push({ etiqueta, valor: e.texto, fuente: e.fuente, evidencia: e.id });
  }
  return out;
}
