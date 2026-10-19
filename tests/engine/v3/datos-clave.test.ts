import { describe, it, expect } from "vitest";
import { seleccionarDatosClave, MAX_DATOS_CLAVE, type DatosClaveInput } from "../../../lib/engine/v3/datos-clave";
import { construirMetricas, preciosPublicados } from "../../../lib/engine/v3/estimates";
import type { Tipologia } from "../../../lib/engine/v3/clases";
import type { Anatomia } from "../../../lib/engine/v3/sections/anatomia";
import type { Evidence } from "../../../lib/engine/v3/evidence";
import type { RawData } from "../../../lib/engine/types";
import { makeRaw, makeSite, ps } from "../raw-fixture";
import { anatomiaBase } from "./fixtures-v4";

const NOW = new Date("2026-10-19T00:00:00Z");
const ev: Evidence = { id: "p1-e1", tipo: "pagina", texto: "Facturas y presupuestos", url: "https://facturo.example/", fuente: "https://facturo.example/" };

function input(tipos: Tipologia[], raw: RawData = makeRaw(), over: Partial<Anatomia> = {}): DatosClaveInput {
  const anatomia = anatomiaBase(tipos, {
    lineas: [{ nombre: "Facturación", queOfrece: ["Facturas", "Presupuestos", "Facturas"], publico: "pymes", comoSeContrata: "Suscripción mensual", evidencias: [ev] }],
    ...over,
  });
  return { tipologias: tipos, anatomia, metricas: construirMetricas(raw, NOW), precios: preciosPublicados(raw), raw };
}
const claves = (i: DatosClaveInput) => seleccionarDatosClave(i).map((d) => d.clave);

describe("seleccionarDatosClave", () => {
  it("saas: planes, prueba gratuita, funcionalidades y luego los generales", () => {
    const raw = makeRaw({ pagespeed: { ...ps(90, 95), accesibilidad: 88 } });
    const datos = seleccionarDatosClave(input(["saas"], raw));
    expect(datos.map((d) => d.clave)).toEqual(["planes_publicados", "prueba_gratuita", "funcionalidades", "pagespeed_movil", "accesibilidad"]);
    expect(datos[0]).toMatchObject({ etiqueta: "Planes publicados", clase: "observado", valor: "9 €" });
    expect(datos[1]).toMatchObject({ valor: "Sí", clase: "observado" });
    expect(datos[2]).toMatchObject({ valor: "Facturas, Presupuestos", clase: "inferencia", evidencias: [ev] });
    expect(datos[3]).toMatchObject({ valor: "90/100" });
    expect(datos[4]).toMatchObject({ valor: "88/100", clase: "observado" });
  });

  it("ecommerce: catálogo aproximado, rango de precios, envíos y devoluciones, medios de pago", () => {
    const raw = makeRaw({
      site: makeSite({ pricesFound: ["12,50 €", "49 €", "20 €"] }),
      comercio: { envios: "https://facturo.example/envios", devoluciones: null, pagos: ["Visa", "PayPal"], catalogoAprox: 340 },
      sitemap: null,
    });
    const datos = seleccionarDatosClave(input(["ecommerce"], raw));
    const por = Object.fromEntries(datos.map((d) => [d.clave, d]));
    expect(datos.slice(0, 4).map((d) => d.clave)).toEqual(["catalogo_aprox", "rango_precios", "envios_devoluciones", "medios_pago"]);
    expect(por.catalogo_aprox).toMatchObject({ valor: "≈ 340 productos", clase: "inferencia" });
    expect(por.catalogo_aprox.detalle).toMatch(/Según el sitemap/);
    expect(por.rango_precios).toMatchObject({ valor: "12,5 – 49 €", clase: "observado" });
    expect(por.envios_devoluciones.valor).toMatch(/Envíos publicados/);
    expect(por.envios_devoluciones.fuente).toBe("https://facturo.example/envios");
    expect(por.medios_pago).toMatchObject({ valor: "Visa, PayPal", clase: "observado" });
  });

  it("ecommerce sin páginas de envíos ni devoluciones: 'No se encontró la página'", () => {
    const raw = makeRaw({ comercio: { envios: null, devoluciones: null, pagos: [], catalogoAprox: 0 } });
    const datos = seleccionarDatosClave(input(["ecommerce"], raw));
    expect(datos.find((d) => d.clave === "envios_devoluciones")?.valor).toBe("No se encontró la página");
    // Catálogo 0 y sin medios de pago: se omiten.
    expect(datos.some((d) => d.clave === "catalogo_aprox" || d.clave === "medios_pago")).toBe(false);
  });

  it("servicio_profesional: servicios, modelo de contratación y casos de éxito", () => {
    const datos = seleccionarDatosClave(input(["servicio_profesional"]));
    const por = Object.fromEntries(datos.map((d) => [d.clave, d]));
    expect(datos.slice(0, 3).map((d) => d.clave)).toEqual(["servicios", "modelo_contratacion", "casos_exito"]);
    expect(por.modelo_contratacion).toMatchObject({ valor: "Suscripción mensual", clase: "inferencia" });
    expect(por.casos_exito).toMatchObject({ valor: "Sí", clase: "observado" });
  });

  it("negocio_local: ubicación, teléfono y horario, observados", () => {
    const raw = makeRaw({
      legal: {
        avisoLegal: null, privacidad: null, cookies: null, condiciones: null, cif: null, razonSocial: null, email: null,
        telefono: "+34911222333", direccion: "Calle Mayor 1, 28013 Madrid",
        fuentes: { telefono: "https://facturo.example/contacto", direccion: "https://facturo.example/contacto" },
      },
      local: { horario: "Lun-Vie 09:00-18:00" },
    });
    const datos = seleccionarDatosClave(input(["negocio_local"], raw));
    expect(datos.slice(0, 3).map((d) => [d.clave, d.valor, d.clase])).toEqual([
      ["ubicacion", "Calle Mayor 1, 28013 Madrid", "observado"],
      ["telefono", "+34911222333", "observado"],
      ["horario", "Lun-Vie 09:00-18:00", "observado"],
    ]);
  });

  it("organizacion_social: financiación declarada con su nivel", () => {
    const datos = seleccionarDatosClave(
      input(["organizacion_social"], makeRaw(), { monetizacion: [{ fuente: "Donaciones", nivel: "confirmado", evidencias: [ev] }] }),
    );
    expect(datos[0]).toMatchObject({ clave: "financiacion", etiqueta: "Financiación declarada", valor: "Donaciones", clase: "observado" });
    expect(datos[0].detalle).toBe("Donaciones: confirmado");
  });

  it("híbrido saas + marketplace: unión sin repetir, primero la tipología de mayor certeza", () => {
    const i = input(["saas", "marketplace"], makeRaw(), {
      monetizacion: [{ fuente: "Comisión por venta", nivel: "inferido", evidencias: [ev] }],
    });
    i.anatomia.tipologias = [
      { tipo: "saas", certeza: "media", explicacion: "", evidencias: [] },
      { tipo: "marketplace", certeza: "alta", explicacion: "", evidencias: [] },
    ];
    const ks = claves(i);
    expect(ks.slice(0, 2)).toEqual(["categorias", "monetizacion"]);
    expect(ks).toContain("planes_publicados");
    expect(new Set(ks).size).toBe(ks.length);
  });

  it("un dato sin fuente se omite (prueba gratuita sin señal y con poco texto)", () => {
    const raw = makeRaw({ site: makeSite({ hasFreePlanOrTrial: false, textLength: 200, pricesFound: [] }) });
    const ks = claves(input(["saas"], raw, { lineas: [{ nombre: "X", queOfrece: ["Y"], publico: "", comoSeContrata: "", evidencias: [] }] }));
    expect(ks).not.toContain("prueba_gratuita");
    expect(ks).not.toContain("planes_publicados");
    expect(ks).not.toContain("funcionalidades");
  });

  it("las visitas nunca aparecen", () => {
    for (const t of ["saas", "ecommerce", "contenido", "web_informativa"] as Tipologia[]) {
      expect(claves(input([t]))).not.toContain("visitas_mensuales");
    }
  });

  it("como mucho 8", () => {
    const raw = makeRaw({
      comercio: { envios: "https://facturo.example/envios", devoluciones: "https://facturo.example/dev", pagos: ["Visa"], catalogoAprox: 10 },
      legal: {
        avisoLegal: "https://facturo.example/legal", privacidad: null, cookies: null, condiciones: null, cif: "B12345674", razonSocial: null,
        email: "hola@facturo.example", telefono: "+34911222333", direccion: "Calle Mayor 1, 28013 Madrid", fuentes: {},
      },
    });
    const ks = claves(input(["ecommerce", "saas", "servicio_profesional", "negocio_local"], raw));
    expect(ks).toHaveLength(MAX_DATOS_CLAVE);
    expect(ks.slice(0, 5)).toEqual(["catalogo_aprox", "rango_precios", "envios_devoluciones", "medios_pago", "confianza_legal"]);
  });
});
