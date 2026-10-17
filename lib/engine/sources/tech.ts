import * as cheerio from "cheerio";
import type { Technology, TechCategory } from "../types";

interface TechRule {
  name: string;
  category: TechCategory;
  pattern: RegExp;
  /** Solo se prueba contra URLs de recursos (script src, link href, iframe src), nunca contra texto incrustado. */
  urlPattern?: RegExp;
}

const RULES: TechRule[] = [
  { name: "Shopify", category: "ecommerce", pattern: /Shopify\.(?:theme|shop)\b/, urlPattern: /cdn\.shopify\.com/i },
  { name: "WooCommerce", category: "ecommerce", pattern: /wp-content\/plugins\/woocommerce|wc-ajax|woocommerce_params|woocommerce-/i },
  { name: "PrestaShop", category: "ecommerce", pattern: /var prestashop\s*=|prestashop\.(?:urls|static_token)|^generator:\s*prestashop/im },
  { name: "Magento", category: "ecommerce", pattern: /Magento|mage\/cookies/i },
  { name: "WordPress", category: "cms", pattern: /wp-content|wp-includes/i },
  { name: "Wix", category: "cms", pattern: /static\.wixstatic\.com|wix\.com/i },
  { name: "Squarespace", category: "cms", pattern: /squarespace/i },
  { name: "Webflow", category: "cms", pattern: /webflow/i },
  { name: "Stripe", category: "pagos", pattern: /js\.stripe\.com/i },
  { name: "PayPal", category: "pagos", pattern: /paypal\.com\/sdk|paypalobjects\.com/i },
  { name: "Google Analytics", category: "analitica", pattern: /googletagmanager\.com\/gtag|google-analytics\.com|gtag\(/i },
  { name: "Google Tag Manager", category: "analitica", pattern: /googletagmanager\.com\/gtm\.js/i },
  { name: "Plausible", category: "analitica", pattern: /plausible\.io/i },
  { name: "Hotjar", category: "analitica", pattern: /static\.hotjar\.com/i },
  { name: "Mixpanel", category: "analitica", pattern: /cdn\.mxpnl\.com|mixpanel/i },
  { name: "Segment", category: "analitica", pattern: /cdn\.segment\.com/i },
  { name: "Google Ads", category: "publicidad", pattern: /googleadservices\.com|AW-\d{6,}/i },
  { name: "Meta Pixel", category: "publicidad", pattern: /connect\.facebook\.net\/[^"']*fbevents|fbq\(/i },
  { name: "LinkedIn Insight", category: "publicidad", pattern: /snap\.licdn\.com/i },
  { name: "TikTok Pixel", category: "publicidad", pattern: /analytics\.tiktok\.com/i },
  { name: "Intercom", category: "chat", pattern: /widget\.intercom\.io|intercomSettings/i },
  { name: "Crisp", category: "chat", pattern: /client\.crisp\.chat/i },
  { name: "Zendesk", category: "chat", pattern: /zdassets\.com|zopim/i },
  { name: "Drift", category: "chat", pattern: /js\.driftt\.com/i },
  { name: "Tawk.to", category: "chat", pattern: /embed\.tawk\.to/i },
  { name: "HubSpot", category: "email", pattern: /js\.hs-scripts\.com|hs-analytics|hsforms/i },
  { name: "Mailchimp", category: "email", pattern: /list-manage\.com|chimpstatic\.com/i },
  { name: "Klaviyo", category: "email", pattern: /klaviyo/i },
  { name: "ConvertKit", category: "email", pattern: /convertkit|ck\.page/i },
  { name: "Brevo", category: "email", pattern: /sibforms|sendinblue|brevo/i },
  { name: "Next.js", category: "framework", pattern: /\/_next\/static|__NEXT_DATA__|Next\.js/ },
];

// Texto incrustado que son datos (JSON de la página, payloads de Next.js) y no código: contiene copy de marketing.
const DATA_SCRIPT = 'script[type="application/json"], script[type="application/ld+json"], script#__NEXT_DATA__';
const NL = String.fromCharCode(10);
const COPY_META =new Set(["description", "og:description", "twitter:description", "og:title", "twitter:title"]);

function technicalHaystacks(html: string, headers: Record<string, string>): { all: string; urls: string } {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  const text: string[] = [];
  $("script").each((_, el) => {
    const node = $(el);
    urls.push(node.attr("src") ?? "");
    if (node.is(DATA_SCRIPT)) return;
    const inline = node.text();
    if (inline.trim().startsWith("self.__next_f")) return;
    text.push(inline);
  });
  $("link[href]").each((_, el) => void urls.push($(el).attr("href") ?? ""));
  $("iframe[src]").each((_, el) => void urls.push($(el).attr("src") ?? ""));
  $("meta").each((_, el) => {
    const key = ($(el).attr("name") ?? $(el).attr("property") ?? "").toLowerCase();
    if (COPY_META.has(key)) return;
    const content = $(el).attr("content") ?? "";
    text.push(key === "generator" ? `generator: ${content}` : `${key}: ${content}`);
  });
  for (const [k, v] of Object.entries(headers)) text.push(`${k}: ${v}`);
  const urlText = urls.join(NL);
  return { all: [urlText, ...text].join(NL), urls: urlText };
}

export function detectTech(html: string, headers: Record<string, string>): Technology[] {
  const { all, urls } = technicalHaystacks(html, headers);
  return RULES.filter((rule) => rule.pattern.test(all) || rule.urlPattern?.test(urls) === true).map(({ name, category }) => ({ name, category }));
}
