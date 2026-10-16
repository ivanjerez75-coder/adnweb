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
  | "mercado"
  | "sitemap"
  | "rutas"
  | "empleo"
  | "appstore"
  | "wikidata"
  | "dns"
  | "hackernews";

export type SignalPolarity = "positiva" | "negativa";

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
  polarity: SignalPolarity;
}

export type TechCategory =
  | "ecommerce"
  | "cms"
  | "pagos"
  | "analitica"
  | "publicidad"
  | "chat"
  | "email"
  | "framework"
  | "ventas"
  | "productividad";

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
  companyName: string | null;
  jobBoards: JobBoardRef[];
  appStoreIds: string[];
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

export type CollectedSource = Exclude<SourceId, "mercado">;

export interface RawData {
  url: string;
  domain: string;
  /** Dominio registrable de la URL final (tras redirecciones), usado para rankings y registros. */
  rootDomain: string;
  collectedAt: string;
  site: SiteData | null;
  tranco: TrancoData | null;
  radar: RadarData | null;
  pagespeed: PageSpeedData | null;
  rdap: RdapData | null;
  wayback: WaybackData | null;
  sitemap: SitemapData | null;
  rutas: PathProbeData | null;
  empleo: JobsData | null;
  appstore: AppStoreData | null;
  wikidata: WikidataData | null;
  dns: DnsData | null;
  hackernews: HackerNewsData | null;
  fuentes: Record<CollectedSource, SourceStatus>;
  /** Fuentes con estado "fallo". */
  unavailable: CollectedSource[];
}

export interface Range {
  min: number;
  max: number;
}

export type Presence = "si" | "no" | "desconocido";

export type SourceStatus = "ok" | "fallo" | "no_aplica";

export type ProbeKind = "blog" | "precios" | "empleo" | "about";

export type SitemapSection = "blog" | "ayuda" | "precios" | "empleo" | "docs";

export type JobPlatform = "greenhouse" | "lever" | "ashby";

export interface JobBoardRef {
  platform: JobPlatform;
  token: string;
}

export interface SitemapData {
  urlCount: number;
  sections: SitemapSection[];
  languages: string[];
  /** Fecha YYYY-MM-DD del lastmod más reciente. */
  lastModified: string | null;
  /** URLs de blog con lastmod en los últimos 90 días. */
  recentBlogPosts: number;
}

export interface PathProbeData {
  /** Secciones que existen. */
  found: ProbeKind[];
  /** Secciones comprobadas (al menos una petición respondió). */
  checked: ProbeKind[];
}

export interface JobsData {
  platform: JobPlatform;
  token: string;
  openings: number;
  byArea: Record<string, number>;
  linkedFromSite: boolean;
}

export interface AppStoreData {
  name: string;
  rating: number | null;
  ratingCount: number;
  url: string;
  linkedFromSite: boolean;
}

export interface WikidataData {
  id: string;
  description: string | null;
  /** Año de fundación. */
  inception: number | null;
  founders: string[];
  headquarters: string | null;
  employees: number | null;
  revenue: { amount: number; currency: string; year: number | null } | null;
}

export type EmailProvider = "Google Workspace" | "Microsoft 365" | "Otro" | "Ninguno";

export interface DnsData {
  emailProvider: EmailProvider;
  tools: Technology[];
}

export interface HackerNewsData {
  total: number;
  lastYear: number;
  top: { title: string; points: number } | null;
}
