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
  | "hackernews"
  | "paginas"
  | "legal";

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
  /** Datos de la organización declarados en JSON-LD (schema.org). null si no hay ninguno. */
  jsonLdOrg: JsonLdOrg | null;
  /** Enlaces del menú de la portada, en orden (las páginas que la propia web considera clave). */
  navLinks: string[];
}

export interface JsonLdOrg {
  name?: string;
  legalName?: string;
  address?: string;
  foundingDate?: string;
  sameAs?: string[];
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
  accesibilidad: number | null;
  buenasPracticas: number | null;
  seo: number | null;
  /** Datos reales de usuarios de Chrome (CrUX). null si Google no tiene datos suficientes. */
  campo: {
    fuente: "url" | "origen";
    lcpMs: number | null;
    inpMs: number | null;
    cls: number | null;
    categoria: "FAST" | "AVERAGE" | "SLOW" | null;
  } | null;
  obtenidoEn: string;
  error?: string;
}

/** Identidad legal que las webs españolas deben publicar (aviso legal, CIF, razón social…). */
export interface LegalData {
  avisoLegal: string | null;
  privacidad: string | null;
  cookies: string | null;
  condiciones: string | null;
  cif: string | null;
  razonSocial: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  /** Campo → URL donde se encontró. */
  fuentes: Record<string, string>;
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

/** Pasaje literal de una página (≤ 200 caracteres), citable por id: "p3-e2". */
export interface Extract {
  id: string;
  cita: string;
}

/** Página propia leída en profundidad. Ids "p1"…"p15". */
export interface PageDoc {
  id: string;
  url: string;
  titulo: string;
  /** true si la página tiene meta description no vacía. */
  tieneDescripcion: boolean;
  extractos: Extract[];
}

export interface RawData {
  /** Versión del esquema de datos recogidos. */
  version: 3;
  url: string;
  domain: string;
  /**
   * Dominio registrable usado para rankings, registro, DNS y menciones: el del usuario, o el final
   * tras redirecciones si es la misma empresa (notion.so → notion.com). Nunca el de una plataforma.
   */
  rootDomain: string;
  /** Dominio registrable de la URL final si difiere del escrito por el usuario; si no, null. */
  finalDomain: string | null;
  /** true si el nombre de la empresa salió de la propia web (no de la etiqueta del dominio). */
  companyNameFromPage: boolean;
  collectedAt: string;
  /** Web propia del negocio. null si no se pudo leer o si la página final es de otro (ver foreignSite). */
  site: SiteData | null;
  /**
   * Página final tras una redirección NO adoptada (Instagram, Linktree, otra empresa). Sus apps,
   * idiomas, tecnologías o tableros son de otro: no alimenta hechos ni señales, solo contexto de la IA.
   */
  foreignSite: SiteData | null;
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
  /** Páginas propias leídas en profundidad. null si no aplica o no se pudo. */
  paginas: PageDoc[] | null;
  legal: LegalData | null;
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
  /**
   * true solo si se leyó el sitemap entero (sin hijos pendientes, fallidos, .gz ni cortados por
   * un tope) y tiene URLs. Si es false, urlCount es un mínimo y una sección ausente no prueba nada.
   */
  complete: boolean;
  /** Hasta 100 URLs del dominio propio, con las secciones de negocio primero. */
  candidatas: string[];
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
  /** Año (P585) del dato de empleados, si Wikidata lo da. */
  employeesYear: number | null;
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
