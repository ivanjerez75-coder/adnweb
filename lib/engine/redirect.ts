import { getDomain } from "tldts";
import type { RawData } from "./types";

/**
 * Plataformas a las que redirige un negocio pequeño (redes, enlaces, tiendas, blogs, aparcamiento
 * de dominios). Su ranking, Wikidata o DNS son los de la plataforma, nunca los del negocio.
 * También cuentan sus subdominios (acme.myshopify.com, acme.wixsite.com…).
 */
export const PLATFORM_DENYLIST = [
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "linktr.ee",
  "beacons.ai",
  "carrd.co",
  "google.com",
  "etsy.com",
  "amazon.com",
  "ebay.com",
  "wix.com",
  "wixsite.com",
  "squarespace.com",
  "shopify.com",
  "myshopify.com",
  "wordpress.com",
  "blogspot.com",
  "medium.com",
  "substack.com",
  "sedo.com",
  "hugedomains.com",
  "dan.com",
  "afternic.com",
  "godaddy.com",
  "parkingcrew.net",
  "bodis.com",
];

export const registrableDomain = (host: string): string => {
  const h = host.toLowerCase().replace(/\.$/, "");
  return getDomain(h, { allowPrivateDomains: true }) ?? h.replace(/^www\./, "");
};

const firstLabel = (domain: string) => domain.split(".")[0];

export const isPlatformDomain = (domain: string): boolean =>
  PLATFORM_DENYLIST.some((d) => domain === d || domain.endsWith(`.${d}`));

export interface ResolvedDomains {
  /** Dominio registrable de lo que escribió el usuario. */
  inputRoot: string;
  /** Dominio registrable de la URL final si difiere de inputRoot; si no, null. */
  finalDomain: string | null;
  /** true si el dominio final es de la misma empresa (notion.so → notion.com) y se usa para las fuentes externas. */
  adopted: boolean;
  /** Dominio para rankings, registro, DNS, empleo y menciones. */
  rootDomain: string;
  /** Dominios que identifican a la empresa (App Store, Wikidata). */
  domains: string[];
}

/**
 * Decide si una redirección a otro dominio sigue siendo la misma empresa. Solo se adopta el
 * dominio final si comparte la primera etiqueta (notion.so → notion.com) y no es una plataforma.
 */
export function resolveDomains(inputDomain: string, finalHost: string | null): ResolvedDomains {
  const inputRoot = getDomain(inputDomain, { allowPrivateDomains: true }) ?? inputDomain;
  const finalRoot = finalHost ? registrableDomain(finalHost) : inputRoot;
  const differs = finalRoot !== inputRoot;
  const adopted = differs && firstLabel(finalRoot) === firstLabel(inputRoot) && !isPlatformDomain(finalRoot);
  return {
    inputRoot,
    finalDomain: differs ? finalRoot : null,
    adopted,
    rootDomain: adopted ? finalRoot : inputRoot,
    domains: adopted ? [inputRoot, finalRoot] : [inputRoot],
  };
}

/** Redirección a otro dominio para el informe: a dónde y si se tomó como la misma empresa. */
export function redirectionOf(raw: Pick<RawData, "finalDomain" | "rootDomain">): { a: string; adoptada: boolean } | null {
  return raw.finalDomain ? { a: raw.finalDomain, adoptada: raw.rootDomain === raw.finalDomain } : null;
}
