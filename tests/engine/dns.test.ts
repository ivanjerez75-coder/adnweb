import { describe, it, expect } from "vitest";
import { emailProviderFromMx, toolsFromTxt, fetchDns } from "../../lib/engine/sources/dns";

describe("emailProviderFromMx", () => {
  it.each([
    [["aspmx.l.google.com"], "Google Workspace"],
    [["acme-com.mail.protection.outlook.com"], "Microsoft 365"],
    [["mx1.ovh.net"], "Otro"],
    [[], "Ninguno"],
  ])("%j → %s", (mx, expected) => {
    expect(emailProviderFromMx(mx)).toBe(expected);
  });
});

describe("toolsFromTxt", () => {
  it("detecta herramientas por SPF y verificaciones", () => {
    const txt = [
      "v=spf1 include:_spf.google.com include:_spf.salesforce.com include:servers.mcsv.net include:mail.zendesk.com ~all",
      "facebook-domain-verification=abc",
      "atlassian-domain-verification=xyz",
    ];
    expect(toolsFromTxt(txt).map((t) => t.name)).toEqual(["Salesforce", "Mailchimp", "Zendesk", "Meta Business", "Atlassian"]);
  });
  it("no inventa nada sin registros", () => {
    expect(toolsFromTxt([])).toEqual([]);
  });
  it("no reporta remitentes transaccionales (SES, SendGrid, Mailgun)", () => {
    expect(toolsFromTxt(["v=spf1 include:amazonses.com include:sendgrid.net include:mailgun.org ~all"])).toEqual([]);
  });
});

describe("fetchDns", () => {
  it("consulta MX y TXT por DoH y une los trozos de TXT", async () => {
    const urls: string[] = [];
    const data = await fetchDns("acme.example", async (url, init) => {
      urls.push(url);
      expect(new Headers(init?.headers).get("accept")).toBe("application/dns-json");
      if (url.includes("type=MX")) return Response.json({ Status: 0, Answer: [{ type: 15, data: "1 aspmx.l.google.com." }] });
      return Response.json({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 include:_spf.hub" "spot.com ~all"' }] });
    });
    expect(urls).toEqual([
      "https://cloudflare-dns.com/dns-query?name=acme.example&type=MX",
      "https://cloudflare-dns.com/dns-query?name=acme.example&type=TXT",
    ]);
    expect(data).toEqual({ emailProvider: "Google Workspace", tools: [{ name: "HubSpot", category: "email" }] });
  });

  it("dominio inexistente (NXDOMAIN) → sin email ni herramientas", async () => {
    expect(await fetchDns("x.example", async () => Response.json({ Status: 3 }))).toEqual({ emailProvider: "Ninguno", tools: [] });
  });

  it("lanza error si DoH falla", async () => {
    await expect(fetchDns("x.example", async () => Response.json({ Status: 2 }))).rejects.toThrow();
  });
});
