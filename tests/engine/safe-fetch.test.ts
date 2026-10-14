import { describe, it, expect } from "vitest";
import {
  isPrivateAddress,
  createSafeGetter,
  checkReachable,
  BlockedUrlError,
} from "../../lib/engine/safe-fetch";

const publicResolver = async () => ["93.184.216.34"];

describe("isPrivateAddress", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "192.168.1.20",
    "172.20.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("bloquea %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700::1111"])("permite %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("createSafeGetter", () => {
  it("devuelve el HTML y las cabeceras de una web pública", async () => {
    const get = createSafeGetter({
      resolve: publicResolver,
      fetcher: async () =>
        new Response("<html>ok</html>", { status: 200, headers: { "x-powered-by": "Next.js" } }),
    });
    const page = await get("https://example.com/");
    expect(page).toMatchObject({ url: "https://example.com/", status: 200, text: "<html>ok</html>" });
    expect(page.headers["x-powered-by"]).toBe("Next.js");
  });

  it("bloquea dominios que resuelven a IPs privadas", async () => {
    const get = createSafeGetter({
      resolve: async () => ["10.0.0.5"],
      fetcher: async () => new Response("secreto"),
    });
    await expect(get("https://intranet.example.com/")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("bloquea redirecciones hacia direcciones internas", async () => {
    const resolve = async (host: string) =>
      host === "evil.example.com" ? ["93.184.216.34"] : ["127.0.0.1"];
    const get = createSafeGetter({
      resolve,
      fetcher: async () =>
        new Response(null, { status: 302, headers: { location: "http://internal.example.com/admin" } }),
    });
    await expect(get("https://evil.example.com/")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("sigue redirecciones públicas", async () => {
    const fetcher = async (url: string) =>
      url === "https://a.example.com/"
        ? new Response(null, { status: 301, headers: { location: "https://www.a.example.com/" } })
        : new Response("final", { status: 200 });
    const page = await createSafeGetter({ resolve: publicResolver, fetcher })("https://a.example.com/");
    expect(page.url).toBe("https://www.a.example.com/");
    expect(page.text).toBe("final");
  });

  it("corta respuestas demasiado grandes", async () => {
    const get = createSafeGetter({
      resolve: publicResolver,
      maxBytes: 10,
      fetcher: async () => new Response("x".repeat(100)),
    });
    expect((await get("https://example.com/")).text).toBe("x".repeat(10));
  });
});

describe("checkReachable", () => {
  it("es true si la web responde aunque sea con 403", async () => {
    const get = createSafeGetter({ resolve: publicResolver, fetcher: async () => new Response("", { status: 403 }) });
    expect(await checkReachable("https://example.com/", get)).toBe(true);
  });

  it("es false si la petición falla", async () => {
    const get = createSafeGetter({
      resolve: publicResolver,
      fetcher: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(await checkReachable("https://example.com/", get)).toBe(false);
  });

  it("propaga el bloqueo de direcciones internas", async () => {
    const get = createSafeGetter({ resolve: async () => ["127.0.0.1"], fetcher: async () => new Response("") });
    await expect(checkReachable("https://example.com/", get)).rejects.toBeInstanceOf(BlockedUrlError);
  });
});
