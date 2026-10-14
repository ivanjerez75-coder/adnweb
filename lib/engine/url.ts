export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUrlError";
  }
}

export interface NormalizedUrl {
  url: string;
  domain: string;
}

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidUrlError("Introduce una URL.");

  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^:/]+:\d+/.test(trimmed);
  const withProtocol = hasProtocol ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new InvalidUrlError("La URL no es válida.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError("Solo se admiten URLs http o https.");
  }
  if (parsed.username || parsed.password) {
    throw new InvalidUrlError("La URL no puede incluir usuario o contraseña.");
  }
  if (parsed.port) {
    throw new InvalidUrlError("No se admiten puertos personalizados.");
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!HOSTNAME_RE.test(host)) {
    throw new InvalidUrlError("Introduce un dominio válido, por ejemplo notion.so.");
  }

  return { url: `https://${host}/`, domain: host.replace(/^www\./, "") };
}
