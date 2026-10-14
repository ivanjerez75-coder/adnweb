import type { Technology, TechCategory } from "../types";

interface TechRule {
  name: string;
  category: TechCategory;
  pattern: RegExp;
}

const RULES: TechRule[] = [
  { name: "Shopify", category: "ecommerce", pattern: /cdn\.shopify\.com|Shopify\.theme/i },
  { name: "WooCommerce", category: "ecommerce", pattern: /woocommerce/i },
  { name: "PrestaShop", category: "ecommerce", pattern: /prestashop/i },
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

export function detectTech(html: string, headers: Record<string, string>): Technology[] {
  const haystack = `${html}\n${Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}`;
  return RULES.filter((rule) => rule.pattern.test(haystack)).map(({ name, category }) => ({ name, category }));
}
