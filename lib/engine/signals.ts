import type { RawData, Signal, SignalFamily, SourceId } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function extractSignals(raw: RawData, now: Date): Signal[] {
  const signals: Signal[] = [];
  const add = (id: string, family: SignalFamily, source: SourceId, label: string) =>
    signals.push({ id, family, source, label });

  const site = raw.site;
  if (site) {
    const noPrices = site.pricesFound.length === 0;
    if (noPrices) add("sin_precios_publicos", "producto", "web", "No muestra precios públicos");
    if (noPrices && site.ctas.some((c) => /demo|ventas|sales/i.test(c))) {
      add("solo_demo", "producto", "web", "La conversión pasa por pedir una demo o hablar con ventas");
    }
    if (!site.hasFreePlanOrTrial) add("sin_plan_gratuito", "producto", "web", "No ofrece plan gratuito ni prueba");
    if (!site.hasBlog) add("sin_blog", "contenido", "web", "No tiene blog ni sección de contenidos");
    if (site.textLength < 1500) add("contenido_escaso", "contenido", "web", "Muy poco texto indexable en la web");
    if (site.languages.length <= 1) {
      const lang = site.languages[0] ? ` (${site.languages[0]})` : "";
      add("un_solo_idioma", "alcance", "web", `Web en un solo idioma${lang}`);
    }
    if (!site.hasAppLinks) add("sin_app_movil", "alcance", "web", "No enlaza a ninguna app en App Store ni Google Play");
    const networks = Object.keys(site.socialLinks).length;
    if (networks < 2) add("pocas_redes", "alcance", "web", `Solo ${networks} red(es) social(es) enlazada(s)`);
    if (!site.hasTestimonials) {
      add("sin_testimonios", "confianza", "web", "Sin testimonios, reseñas ni casos de éxito visibles");
    }

    const categories = new Set(site.technologies.map((t) => t.category));
    if (!categories.has("analitica")) {
      add("sin_analitica", "tecnica", "tecnologias", "No se detecta ninguna herramienta de analítica");
    }
    if (!categories.has("chat")) add("sin_chat_soporte", "tecnica", "tecnologias", "No se detecta chat ni soporte en vivo");
    if (!categories.has("email")) {
      add("sin_captacion_email", "tecnica", "tecnologias", "No se detecta herramienta de email marketing");
    }
  }

  const mobile = raw.pagespeed?.mobile ?? null;
  if (mobile !== null && mobile < 50) add("pagespeed_movil_bajo", "tecnica", "pagespeed", `Rendimiento móvil bajo: ${mobile}/100`);
  const desktop = raw.pagespeed?.desktop ?? null;
  if (desktop !== null && desktop < 50) {
    add("pagespeed_escritorio_bajo", "tecnica", "pagespeed", `Rendimiento en escritorio bajo: ${desktop}/100`);
  }

  if (raw.tranco?.trend === "baja") add("trafico_en_caida", "traccion", "tranco", "Su posición en el ranking de tráfico está bajando");
  if (raw.tranco && raw.tranco.rank === null) {
    add("fuera_top_1m", "traccion", "tranco", "Fuera del top 1 millón de webs más visitadas");
  }
  if (raw.radar && (raw.radar.bucket === null || raw.radar.bucket > 200_000)) {
    add("popularidad_baja", "traccion", "radar", "Popularidad baja según Cloudflare Radar");
  }

  if (raw.wayback && raw.wayback.lastChange !== null && raw.wayback.changesLastYear === 0) {
    add("web_sin_cambios_12m", "contenido", "wayback", "La web no ha cambiado en el último año");
  }

  const registeredAt = raw.rdap?.registeredAt;
  if (registeredAt && now.getTime() - Date.parse(registeredAt) < 2 * 365 * DAY_MS) {
    add("dominio_reciente", "traccion", "rdap", "Dominio registrado hace menos de 2 años");
  }

  return signals;
}
