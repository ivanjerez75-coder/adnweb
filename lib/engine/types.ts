export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type Confidence = "baja" | "media" | "alta";

export type SourceId =
  | "web"
  | "tecnologias"
  | "tranco"
  | "radar"
  | "pagespeed"
  | "rdap"
  | "wayback"
  | "mercado";

export type SignalFamily =
  | "producto"
  | "contenido"
  | "tecnica"
  | "alcance"
  | "traccion"
  | "mercado"
  | "confianza";

export interface Signal {
  id: string;
  family: SignalFamily;
  source: SourceId;
  label: string;
}

export type TechCategory =
  | "ecommerce"
  | "cms"
  | "pagos"
  | "analitica"
  | "publicidad"
  | "chat"
  | "email"
  | "framework";

export interface Technology {
  name: string;
  category: TechCategory;
}

export interface SitePage {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
}

export interface SiteData {
  finalUrl: string;
  pages: SitePage[];
  languages: string[];
  socialLinks: Record<string, string>;
  ctas: string[];
  hasPricingPage: boolean;
  pricesFound: string[];
  hasBlog: boolean;
  hasTestimonials: boolean;
  hasFreePlanOrTrial: boolean;
  hasAppLinks: boolean;
  jsonLdTypes: string[];
  textLength: number;
  technologies: Technology[];
}

export type Trend = "sube" | "estable" | "baja";

export interface TrancoData {
  rank: number | null;
  trend: Trend | null;
}

export interface RadarData {
  /** Franja de popularidad (top N). */
  bucket: number | null;
  /** Posición exacta, solo para los dominios más populares. */
  rank: number | null;
}

export interface PageSpeedData {
  mobile: number | null;
  desktop: number | null;
}

export interface RdapData {
  registeredAt: string | null;
}

export interface WaybackData {
  firstCapture: string | null;
  lastChange: string | null;
  changesLastYear: number;
}

export interface RawData {
  url: string;
  domain: string;
  collectedAt: string;
  site: SiteData | null;
  tranco: TrancoData | null;
  radar: RadarData | null;
  pagespeed: PageSpeedData | null;
  rdap: RdapData | null;
  wayback: WaybackData | null;
  unavailable: SourceId[];
}

export interface Range {
  min: number;
  max: number;
}
