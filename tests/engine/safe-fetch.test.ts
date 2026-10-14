import { describe, it, expect } from "vitest";
import {
  isPrivateAddress,
  createSafeGetter,
  checkReachable,
  BlockedUrlError,
  createValidatingLookup,
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
    "192.0.0.8",
    "192.0.2.1",
    "198.51.100.7",
    "203.0.113.200",
    "0:0:0:0:0:0:0:1",
    "::7f00:1",
    "::127.0.0.1",
    "::ffff:93.184.216.34",
    "::ffff:7f00:1",
    "fc00::1",
    "fdff:ffff::1",
    "fe80::1%eth0",
    "febf::1",
    "fec0::1",
    "ff02::1",
    "64:ff9b::7f00:1",
    "64:ff9b::93.184.216.34",
    "2002:7f00:1::1",
    "2001::1",
    "2001:0:4136:e378::1",
    "2001:db8::1",
    "2001:DB8:0:0:0:0:0:1",
    "100::1",
    "4000::1",
    "no-es-una-ip",
  ])("bloquea %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "192.0.3.1",
    "198.51.101.1",
    "203.0.114.1",
    "2606:4700::1111",
    "2606:4700:4700:0:0:0:0:1111",
    "2001:4860:4860::8888",
    "2a00:1450:4003:80e::200e",
    "2001:1::1",
  ])("permite %s", (ip) => {
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

  it("bloquea hosts que son una IP literal privada, también IPv6", async () => {
    let called = false;
    const get = createSafeGetter({
      resolve: publicResolver,
      fetcher: async () => {
        called = true;
        return new Response("secreto");
      },
    });
    await expect(get("http://[::1]/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(get("http://[::ffff:7f00:1]/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(get("http://127.0.0.1/")).rejects.toBeInstanceOf(BlockedUrlError);
    expect(called).toBe(false);
  });

  it("solo permite los puertos 80 y 443", async () => {
    const get = createSafeGetter({ resolve: publicResolver, fetcher: async () => new Response("ok") });
    await expect(get("https://example.com:8080/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(get("http://example.com:22/")).rejects.toBeInstanceOf(BlockedUrlError);
    expect((await get("https://example.com:443/")).status).toBe(200);
    expect((await get("http://example.com:80/")).status).toBe(200);
    expect((await get("https://example.com:80/")).status).toBe(200);
  });

  it("bloquea redirecciones hacia otro puerto", async () => {
    const fetcher = async (url: string) =>
      url === "https://a.example.com/"
        ? new Response(null, { status: 302, headers: { location: "http://a.example.com:6379/" } })
        : new Response("final");
    await expect(createSafeGetter({ resolve: publicResolver, fetcher })("https://a.example.com/")).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });

  it("bloquea redirecciones hacia protocolos que no son http", async () => {
    for (const location of ["file:///etc/passwd", "ftp://a.example.com/", "gopher://a.example.com/"]) {
      const get = createSafeGetter({
        resolve: publicResolver,
        fetcher: async () => new Response(null, { status: 302, headers: { location } }),
      });
      await expect(get("https://a.example.com/")).rejects.toBeInstanceOf(BlockedUrlError);
    }
  });

  it("falla si se supera el límite de redirecciones", async () => {
    let calls = 0;
    const get = createSafeGetter({
      resolve: publicResolver,
      maxRedirects: 2,
      fetcher: async () => {
        calls++;
        return new Response(null, { status: 302, headers: { location: `https://a.example.com/${calls}` } });
      },
    });
    await expect(get("https://a.example.com/")).rejects.toThrow(/redirecciones/);
    expect(calls).toBe(3);
  });

  it("falla si una redirección no trae Location", async () => {
    const get = createSafeGetter({ resolve: publicResolver, fetcher: async () => new Response(null, { status: 302 }) });
    await expect(get("https://a.example.com/")).rejects.toThrow(/sin destino/);
  });

  it("cancela el cuerpo de la redirección antes de seguirla", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("x"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetcher = async (url: string) =>
      url === "https://a.example.com/"
        ? new Response(body, { status: 301, headers: { location: "https://b.example.com/" } })
        : new Response("final");
    const page = await createSafeGetter({ resolve: publicResolver, fetcher })("https://a.example.com/");
    expect(page.text).toBe("final");
    expect(cancelled).toBe(true);
  });

  it("valida de nuevo la IP al conectar con el fetcher por defecto (DNS rebinding)", async () => {
    // Primera resolución pública (comprobación previa), segunda privada (al conectar).
    let calls = 0;
    const resolve = async () => (calls++ === 0 ? ["93.184.216.34"] : ["127.0.0.1"]);
    const get = createSafeGetter({ resolve, timeoutMs: 2000 });
    await expect(get("http://rebind.example.com/")).rejects.toBeInstanceOf(BlockedUrlError);
    expect(calls).toBe(2);
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

describe("createValidatingLookup", () => {
  type Result = { err: Error | null; address?: unknown; family?: unknown };
  const run = (resolve: (h: string) => Promise<string[]>, options: { all?: boolean; family?: number } = {}) =>
    new Promise<Result>((done) => {
      createValidatingLookup(resolve)("site.example.com", options, (err, address, family) =>
        done({ err, address, family }),
      );
    });

  it("devuelve la dirección pública validada", async () => {
    expect(await run(async () => ["93.184.216.34"])).toEqual({ err: null, address: "93.184.216.34", family: 4 });
    expect(await run(async () => ["2606:4700::1111"])).toEqual({ err: null, address: "2606:4700::1111", family: 6 });
  });

  it("devuelve todas las direcciones cuando se piden con all", async () => {
    const r = await run(async () => ["93.184.216.34", "2606:4700::1111"], { all: true });
    expect(r.err).toBeNull();
    expect(r.address).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700::1111", family: 6 },
    ]);
  });

  it("respeta la familia pedida", async () => {
    const r = await run(async () => ["93.184.216.34", "2606:4700::1111"], { family: 6 });
    expect(r).toEqual({ err: null, address: "2606:4700::1111", family: 6 });
  });

  it.each([["127.0.0.1"], ["10.0.0.5"], ["::1"], ["fd00::1"]])("rechaza %s con BlockedUrlError", async (ip) => {
    const r = await run(async () => [ip]);
    expect(r.err).toBeInstanceOf(BlockedUrlError);
  });

  it("rechaza si alguna de las direcciones es privada (DNS rebinding)", async () => {
    const r = await run(async () => ["93.184.216.34", "127.0.0.1"], { all: true });
    expect(r.err).toBeInstanceOf(BlockedUrlError);
  });

  it("rechaza si no hay direcciones o la resolución falla", async () => {
    expect((await run(async () => [])).err).toBeInstanceOf(BlockedUrlError);
    const failed = await run(async () => {
      throw new Error("ENOTFOUND");
    });
    expect(failed.err?.message).toBe("ENOTFOUND");
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
