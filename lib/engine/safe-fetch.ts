import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import type { Fetcher } from "./types";

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export type Resolver = (hostname: string) => Promise<string[]>;

export interface FetchedPage {
  url: string;
  status: number;
  headers: Record<string, string>;
  text: string;
}

export type PageGetter = (url: string) => Promise<FetchedPage>;

export interface SafeFetchOptions {
  fetcher?: Fetcher;
  resolve?: Resolver;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
}

const USER_AGENT = "Mozilla/5.0 (compatible; DNAwebBot/0.1; +https://dnaweb.app)";

export const defaultResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((a) => a.address);

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const octets = parts.map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

function isPrivateV4(ip: string): boolean {
  const octets = parseIPv4(ip);
  if (!octets) return true;
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24 (asignaciones IETF)
    (a === 192 && b === 0 && c === 2) || // 192.0.2.0/24 (TEST-NET-1)
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 (TEST-NET-2)
    (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24 (TEST-NET-3)
    a >= 224
  );
}

/** Convierte una IPv6 (con "::" y/o IPv4 incrustada) en sus 8 grupos de 16 bits. */
export function parseIPv6(input: string): number[] | null {
  let ip = input.toLowerCase();
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);

  // IPv4 incrustada al final (p. ej. ::ffff:1.2.3.4) → dos grupos hexadecimales.
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...new Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function isPrivateV6(ip: string): boolean {
  const g = parseIPv6(ip);
  if (!g) return true;
  // Lista de permitidos: solo el unicast global 2000::/3. Fuera quedan ::, ::1, las IPv4
  // compatibles y mapeadas (::ffff:*), 64:ff9b::/96 (NAT64), fc00::/7, fe80::/10, fec0::/10 y ff00::/8.
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2002) return true; // 2002::/16 (6to4)
  if (g[0] === 0x2001 && g[1] === 0x0000) return true; // 2001::/32 (Teredo)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // 2001:db8::/32 (documentación)
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true;
}

export interface LookupResult {
  address: string;
  family: number;
}

export type ValidatingLookup = (
  hostname: string,
  options: { all?: boolean; family?: number | string },
  callback: (err: Error | null, address?: string | LookupResult[], family?: number) => void,
) => void;

/**
 * Función `lookup` para net/tls.connect: resuelve con el Resolver, rechaza direcciones
 * privadas y devuelve exactamente las direcciones validadas, de modo que la IP comprobada
 * es la IP a la que se conecta (evita el DNS rebinding).
 */
export function createValidatingLookup(resolve: Resolver): ValidatingLookup {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
          callback(new BlockedUrlError(`Dirección no permitida: ${hostname}`));
          return;
        }
        const family = options.family;
        const wanted = family === 4 || family === "IPv4" ? 4 : family === 6 || family === "IPv6" ? 6 : 0;
        const list = addresses
          .map((address) => ({ address, family: isIP(address) }))
          .filter((a) => wanted === 0 || a.family === wanted);
        if (list.length === 0) {
          callback(new BlockedUrlError(`Dirección no permitida: ${hostname}`));
          return;
        }
        if (options.all) callback(null, list);
        else callback(null, list[0].address, list[0].family);
      },
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))),
    );
  };
}

const ALLOWED_PORTS = new Set(["", "80", "443"]);

// Ruta por defecto: undici con un dispatcher cuyo lookup valida la IP en el momento de conectar.
function createDefaultFetcher(resolve: Resolver): Fetcher {
  const dispatcher = new Agent({ connect: { lookup: createValidatingLookup(resolve) as unknown as LookupFunction } });
  return async (url, init) => {
    try {
      return (await undiciFetch(url, { ...(init as UndiciRequestInit), dispatcher })) as unknown as Response;
    } catch (error) {
      // undici envuelve el error de conexión en "fetch failed"; el bloqueo se propaga tal cual.
      const cause = (error as { cause?: unknown })?.cause;
      if (cause instanceof BlockedUrlError) throw cause;
      throw error;
    }
  };
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - total;
    if (value.byteLength >= remaining) {
      chunks.push(value.subarray(0, remaining));
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function createSafeGetter(opts: SafeFetchOptions = {}): PageGetter {
  const resolve = opts.resolve ?? defaultResolver;
  const fetcher: Fetcher = opts.fetcher ?? createDefaultFetcher(resolve);
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? 2_000_000;

  return async (startUrl) => {
    let current = startUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const parsed = new URL(current);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new BlockedUrlError(`Protocolo no permitido: ${parsed.protocol}`);
      }
      if (!ALLOWED_PORTS.has(parsed.port)) {
        throw new BlockedUrlError(`Puerto no permitido: ${parsed.port}`);
      }
      const host = parsed.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(host) ? [host] : await resolve(host);
      if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
        throw new BlockedUrlError(`Dirección no permitida: ${parsed.hostname}`);
      }

      const res = await fetcher(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) throw new Error(`Redirección sin destino en ${current}`);
        current = new URL(location, current).toString();
        continue;
      }

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { url: current, status: res.status, headers, text: await readLimited(res, maxBytes) };
    }
    throw new Error("Demasiadas redirecciones.");
  };
}

export async function checkReachable(url: string, get: PageGetter): Promise<boolean> {
  try {
    const page = await get(url);
    return page.status < 500;
  } catch (error) {
    if (error instanceof BlockedUrlError) throw error;
    return false;
  }
}
