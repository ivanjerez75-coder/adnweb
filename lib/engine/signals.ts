import type { RawData, Signal, SignalFamily, SignalPolarity, SourceId, Technology } from "./types";
import { radarRank, validRank } from "./anchors";
import { computeFacts } from "./facts";

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;
const GROWTH_CATEGORIES = new Set(["email", "ventas", "chat", "publicidad"]);
const READABLE_TEXT = 1500;

export function allLanguages(raw: RawData): string[] {
  return Array.from(new Set([...(raw.site?.languages ?? []), ...(raw.sitemap?.languages ?? [])]));
}

export function allTechnologies(raw: RawData): Technology[] {
  const out: Technology[] = [];
  for (const t of [...(raw.site?.technologies ?? []), ...(raw.dns?.tools ?? [])]) {
    if (!out.some((o) => o.name === t.name)) out.push(t);
  }
  return out;
}

export function extractSignals(raw: RawData, now: Date): Signal[] {
  const signals: Signal[] = [];
  const add = (id: string, family: SignalFamily, source: SourceId, label: string, polarity: SignalPolarity = "negativa") =>
    signals.push({ id, family, source, label, polarity });
  const pos = (id: string, family: SignalFamily, source: SourceId, label: string) => add(id, family, source, label, "positiva");

  const facts = computeFacts(raw);
  const site = raw.site;
  const readable = !!site && site.textLength >= READABLE_TEXT;
  const languages = allLanguages(raw);

  // ---------- Negativas ----------
  if (site) {
    const noPrices = site.pricesFound.length === 0;
    if (noPrices) add("sin_precios_publicos", "producto", "web", "No muestra precios públicos");
    if (noPrices && site.ctas.some((c) => /\b(demo|ventas|sales)\b/i.test(c))) {
      add("solo_demo", "producto", "web", "La conversión pasa por pedir una demo o hablar con ventas");
    }
    if (!site.hasFreePlanOrTrial) add("sin_plan_gratuito", "producto", "web", "No ofrece plan gratuito ni prueba");
    if (site.textLength < READABLE_TEXT && !(raw.sitemap && raw.sitemap.urlCount >= 50)) {
      add("contenido_escaso", "contenido", "web", "Muy poco texto indexable en la web");
    }
    if (!site.hasTestimonials) add("sin_testimonios", "confianza", "web", "Sin testimonios, reseñas ni casos de éxito visibles");
    if (readable && !site.technologies.some((t) => t.category === "analitica")) {
      add("sin_analitica", "tecnica", "tecnologias", "No se detecta ninguna herramienta de analítica");
    }
  }
  if (facts.blog === "no") add("sin_blog", "contenido", "web", "No tiene blog ni sección de contenidos");
  if (languages.length === 1) add("un_solo_idioma", "alcance", "web", `Web en un solo idioma (${languages[0]})`);
  if (facts.app === "no") add("sin_app_movil", "alcance", "web", "No tiene app en App Store ni enlaza a ninguna");
  if (readable && facts.redes.length < 2) {
    add("pocas_redes", "alcance", "web", facts.redes.length === 0 ? "No enlaza a ninguna red social" : "Solo enlaza a 1 red social");
  }
  if (facts.chatSoporte === "no") add("sin_chat_soporte", "tecnica", "tecnologias", "No se detecta chat ni soporte en vivo");
  if (facts.emailMarketing === "no") add("sin_captacion_email", "tecnica", "tecnologias", "No se detecta herramienta de email marketing");
  if (facts.empleo === "no") add("sin_empleo", "traccion", "rutas", "No se detecta página de empleo ni ofertas abiertas");

  const mobile = raw.pagespeed?.mobile ?? null;
  if (mobile !== null && mobile < 50) add("pagespeed_movil_bajo", "tecnica", "pagespeed", `Rendimiento móvil bajo: ${mobile}/100`);
  const desktop = raw.pagespeed?.desktop ?? null;
  if (desktop !== null && desktop < 50) add("pagespeed_escritorio_bajo", "tecnica", "pagespeed", `Rendimiento en escritorio bajo: ${desktop}/100`);

  if (raw.tranco?.trend === "baja") add("trafico_en_caida", "traccion", "tranco", "Su posición en el ranking de tráfico está bajando");
  if (raw.tranco && raw.tranco.rank === null && radarRank(raw.radar) === null) add("fuera_top_1m", "traccion", "tranco", "Fuera del top 1 millón de webs más visitadas");
  const radarBucket = validRank(raw.radar?.bucket);
  if (raw.radar && validRank(raw.radar.rank) === null && (radarBucket === null || radarBucket > 200_000)) {
    add("popularidad_baja", "traccion", "radar", "Popularidad baja según Cloudflare Radar");
  }
  if (raw.wayback && raw.wayback.lastChange !== null && raw.wayback.changesLastYear === 0) {
    add("web_sin_cambios_12m", "contenido", "wayback", "No se detectan cambios en la web en el último año");
  }
  const registeredAt = raw.rdap?.registeredAt;
  const domainAgeMs = registeredAt ? now.getTime() - Date.parse(registeredAt) : NaN;
  if (Number.isFinite(domainAgeMs) && domainAgeMs >= 0 && domainAgeMs < 2 * YEAR_MS) add("dominio_reciente", "traccion", "rdap", "Dominio registrado hace menos de 2 años");

  const lastModified = raw.sitemap?.lastModified;
  if (lastModified && now.getTime() - Date.parse(lastModified) > YEAR_MS) {
    add("web_inactiva", "contenido", "sitemap", `La última actualización del sitemap es de ${lastModified}`);
  }
  const app = raw.appstore;
  if (app && app.rating !== null && app.rating < 3.5 && app.ratingCount >= 100) {
    add("app_mal_valorada", "traccion", "appstore", `App mal valorada: ${app.rating}★ (${app.ratingCount} valoraciones)`);
  }
  if (raw.dns?.emailProvider === "Ninguno") {
    add("sin_email_corporativo", "confianza", "dns", "El dominio no tiene email corporativo (sin registros MX)");
  }

  // ---------- Positivas ----------
  const openings = raw.empleo?.openings ?? 0;
  if (openings >= 30) pos("contratacion_fuerte", "traccion", "empleo", `Contratación fuerte: ${openings} ofertas abiertas`);
  else if (openings >= 5) pos("contratando", "traccion", "empleo", `Contratando: ${openings} ofertas abiertas`);
  if (app && app.rating !== null && app.rating >= 4.3 && app.ratingCount >= 1000) {
    pos("app_valorada", "traccion", "appstore", `App bien valorada: ${app.rating}★ (${app.ratingCount} valoraciones)`);
  }
  const recentPosts = raw.sitemap?.recentBlogPosts ?? 0;
  if (recentPosts >= 4) pos("blog_activo", "contenido", "sitemap", `Blog activo: ${recentPosts} publicaciones en los últimos 90 días`);
  if (languages.length >= 3) pos("multi_idioma", "alcance", "web", `Web en ${languages.length} idiomas`);
  const urlCount = raw.sitemap?.urlCount ?? 0;
  if (urlCount >= 500) pos("web_amplia", "contenido", "sitemap", `Web amplia: ${urlCount} páginas en el sitemap`);

  const trancoRank = validRank(raw.tranco?.rank);
  const radarValue = radarRank(raw.radar);
  if (trancoRank !== null && trancoRank <= 10_000) {
    pos("trafico_alto", "traccion", "tranco", `Entre las 10.000 webs más visitadas (puesto ${trancoRank})`);
  } else if (trancoRank === null && radarValue !== null && radarValue <= 10_000) {
    pos("trafico_alto", "traccion", "radar", "Entre las 10.000 webs más populares según Cloudflare Radar");
  }
  if (raw.tranco?.trend === "sube") pos("trafico_en_subida", "traccion", "tranco", "Su posición en el ranking de tráfico está subiendo");

  const inception = raw.wikidata?.inception ?? null;
  if (inception !== null && now.getUTCFullYear() - inception >= 5) {
    pos("empresa_consolidada", "confianza", "wikidata", `Empresa fundada en ${inception}`);
  } else if (inception === null && Number.isFinite(domainAgeMs) && domainAgeMs >= 5 * YEAR_MS) {
    pos("empresa_consolidada", "confianza", "rdap", "Dominio registrado hace más de 5 años");
  }
  const employees = raw.wikidata?.employees ?? null;
  if (employees !== null && employees >= 200) pos("plantilla_grande", "traccion", "wikidata", `Plantilla de ${employees} empleados`);
  const stories = raw.hackernews?.total ?? 0;
  if (stories >= 20) pos("notoriedad_tech", "alcance", "hackernews", `${stories} historias en Hacker News enlazan a la web`);
  const growthTools = allTechnologies(raw).filter((t) => GROWTH_CATEGORIES.has(t.category));
  if (growthTools.length >= 3) pos("stack_crecimiento", "tecnica", "tecnologias", `Usa ${growthTools.length} herramientas de marketing, ventas o soporte`);
  if (mobile !== null && mobile >= 90) pos("web_rapida", "tecnica", "pagespeed", `Web rápida en móvil: ${mobile}/100`);

  return signals;
}
