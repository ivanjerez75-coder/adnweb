import type { DnsData, EmailProvider, Fetcher, TechCategory, Technology } from "../types";

const DOH = "https://cloudflare-dns.com/dns-query";

interface DohAnswer {
  type: number;
  data: string;
}

const TXT_RULES: { name: string; category: TechCategory; pattern: RegExp }[] = [
  { name: "Salesforce", category: "ventas", pattern: /include:_spf\.salesforce\.com/i },
  { name: "HubSpot", category: "email", pattern: /include:\S*hubspot/i },
  { name: "Mailchimp", category: "email", pattern: /include:servers\.mcsv\.net|include:\S*mandrillapp\.com/i },
  { name: "Klaviyo", category: "email", pattern: /klaviyo/i },
  { name: "Zendesk", category: "chat", pattern: /include:mail\.zendesk\.com|zendeskverification/i },
  { name: "Freshdesk", category: "chat", pattern: /include:\S*freshdesk|include:fdspf/i },
  { name: "Intercom", category: "chat", pattern: /include:\S*intercom/i },
  { name: "Meta Business", category: "publicidad", pattern: /facebook-domain-verification=/i },
  { name: "Stripe", category: "pagos", pattern: /stripe-verification=/i },
  { name: "Atlassian", category: "productividad", pattern: /atlassian-domain-verification=/i },
  { name: "DocuSign", category: "productividad", pattern: /docusign=/i },
  { name: "Adobe", category: "productividad", pattern: /adobe-idp-site-verification=/i },
  { name: "Miro", category: "productividad", pattern: /miro-verification=/i },
];

export function emailProviderFromMx(mxHosts: string[]): EmailProvider {
  if (mxHosts.length === 0) return "Ninguno";
  if (mxHosts.some((h) => /(^|\.)(google\.com|googlemail\.com)$/i.test(h))) return "Google Workspace";
  if (mxHosts.some((h) => /(^|\.)outlook\.com$/i.test(h))) return "Microsoft 365";
  return "Otro";
}

export function toolsFromTxt(txt: string[]): Technology[] {
  const all = txt.join("\n");
  return TXT_RULES.filter((r) => r.pattern.test(all)).map(({ name, category }) => ({ name, category }));
}

async function query(name: string, type: "MX" | "TXT", fetcher: Fetcher): Promise<DohAnswer[]> {
  const res = await fetcher(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`DNS respondió ${res.status}`);
  const json = (await res.json()) as { Status?: number; Answer?: DohAnswer[] };
  if (json.Status !== 0 && json.Status !== 3) throw new Error(`DNS con estado ${json.Status}`);
  return Array.isArray(json.Answer) ? json.Answer : [];
}

export async function fetchDns(domain: string, fetcher: Fetcher): Promise<DnsData> {
  const [mx, txt] = await Promise.all([query(domain, "MX", fetcher), query(domain, "TXT", fetcher)]);
  const mxHosts = mx
    .filter((a) => a.type === 15)
    .map((a) => (a.data.trim().split(/\s+/).pop() ?? "").toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
  const txtValues = txt.filter((a) => a.type === 16).map((a) => a.data.replace(/"\s*"/g, "").replace(/^"|"$/g, ""));
  return { emailProvider: emailProviderFromMx(mxHosts), tools: toolsFromTxt(txtValues) };
}
