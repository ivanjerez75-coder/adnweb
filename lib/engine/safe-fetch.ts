import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  if (lower.startsWith("::ffff:")) return true;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 (ULA)
    (first & 0xffc0) === 0xfe80 || // fe80::/10 (link-local)
    (first & 0xff00) === 0xff00 // ff00::/8 (multicast)
  );
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true;
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
  const fetcher: Fetcher = opts.fetcher ?? fetch;
  const resolve = opts.resolve ?? defaultResolver;
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
