import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: unknown }) => createElement("a", { href, ...resto }, children as never),
}));
const { Informe, claveContenido } = await import("../../app/(app)/analisis/[id]/informe");

type Secs = Record<string, { estado: string; contenido: unknown }>;
const render = (secciones: Secs, estado = "listo") =>
  renderToStaticMarkup(
    createElement(Informe, { id: "x", createdAt: new Date().toISOString(), dominio: "facturo.example", inicial: { estado, pasoActual: null, secciones } }),
  );
const lista = (contenido: unknown) => ({ estado: "lista", contenido });
const veces = (html: string, t: string) => html.split(t).length - 1;

const ev = { id: "p1-e1", tipo: "pagina", texto: "Cita literal de la web", url: "https://facturo.example/", fuente: "https://facturo.example/" };

const anatomia = {
  nombre: "Facturo",
  fraseResumen: { texto: "Facturo ofrece facturación online a pymes, cobrando cuotas mensuales.", evidencias: [ev] },
  identidad: {
    producto: { declara: { texto: "Software de facturas", evidencias: [ev] }, interpretamos: { texto: "Orientado a pymes", evidencias: [ev], clase: "inferencia" } },
    paraQuien: { declara: null, interpretamos: { texto: "Autónomos y pymes", evidencias: [], clase: "inferencia" } },
  },
  tipologias: [
    { tipo: "saas", certeza: "alta", explicacion: "Cuota", evidencias: [ev] },
    { tipo: "marketplace", certeza: "media", explicacion: "Integraciones", evidencias: [ev] },
  ],
  lineas: [{ nombre: "Facturación", queOfrece: ["facturas"], publico: "pymes", comoSeContrata: "online", evidencias: [ev] }],
  monetizacion: [{ fuente: "Cuota mensual", nivel: "inferido", evidencias: [ev] }],
  cliente: { explicito: null, necesidades: [], sectores: [], mensaje: null, segmentosAlternativos: [{ texto: "Gestorías", clase: "hipotesis" }] },
  canales: [],
  afirmaciones: [],
  modeloEstado: "probable",
};

const diagnostico = {
  fortalezas: [{ id: "f1", texto: "Precio claro. Se ve en la portada.", frenteA: "c1", paraQuien: "pymes", evidencias: [ev], clase: "observado" }],
  debilidades: [{ id: "d1", texto: "No muestra casos de clientes", porQueImporta: "Resta confianza", evidencias: [], clase: "inferencia" }],
  riesgos: [{ id: "r1", texto: "Mucha competencia", evidencias: [], clase: "hipotesis" }],
  fricciones: [],
  integrado: { texto: "Prioridad: generar confianza." },
  comprobaciones: [],
};

const oportunidad = (id: string, prioridad: string, origen: string[]) => ({
  id,
  tipologia: "mejorar",
  titulo: `Oportunidad ${id}`,
  origen,
  ficha: { evidencia: { texto: "No hay casos", evidencias: [ev] }, problema: "Falta confianza", solucion: "Publicar casos", porQuePodria: "Da confianza", faltaComprobar: ["Si hay clientes dispuestos"] },
  estado: "detectada",
  criterios: { impacto: "alto", evidencia: "medio", viabilidad: "medio", diferenciacion: "bajo", facilidadValidacion: "alto" },
  prioridad,
  clase: "hipotesis",
});

const accion = (id: string, origen: string, tarea: string) => ({
  id,
  origen,
  tarea,
  porQue: "",
  recursos: [],
  indicador: `Indicador ${id}`,
  criterio: { continuar: "Si interesa", modificar: "", descartar: "Si nadie responde" },
});
const plan = { comprobar: [accion("a1", "o1", "Preguntar a clientes"), accion("a2", "d1", "Pedir testimonios")], experimentar: [], medir: [accion("a3", "o1", "Contar respuestas")] };

describe("Informe (render)", () => {
  it("pinta los 5 bloques en orden con sus preguntas y la navegación", () => {
    const html = render({});
    const pos = ["El negocio", "Datos clave", "Competencia", "Hallazgos", "Oportunidades"].map((x) => html.indexOf(`>${x}</h2>`));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(html).toContain("¿Qué es y cómo funciona?");
    expect(html).toContain("En este informe");
    expect(veces(html, "Generando…")).toBeGreaterThanOrEqual(5);
  });

  it("bloque 1: síntesis, tipologías con certeza, negocio híbrido, hechos y cobertura", () => {
    const cobertura = { identidad: { estado: "valido", motivo: "Se leyó la web." }, competencia: { estado: "fallido", motivo: "No se pudo analizar." } };
    const html = render({ anatomia: lista(anatomia), cobertura: lista(cobertura) });
    expect(html).toContain(">Facturo</h1>");
    expect(html).toContain("facturación online");
    expect(html).toContain("certeza alta");
    expect(html).toContain("Negocio híbrido");
    expect(html).toContain("Cómo monetiza");
    expect(html).toContain("Cuota mensual");
    expect(html).toContain("Inferido");
    expect(html).toContain("Qué se pudo analizar");
    expect(html).toContain("No se pudo analizar.");
    expect(html).toContain("La empresa declara");
    expect(html).toContain("ADNweb interpreta");
    expect(html).toContain("Gestorías");
  });


  it("bloque 1: 'Lo más importante' enlaza los hallazgos del resumen y la oportunidad principal (task 6b)", () => {
    const resumen = {
      nombre: "Facturo",
      frase: anatomia.fraseResumen,
      hallazgos: [{ tipo: "debilidad", id: "d1", titulo: "No muestra casos de clientes", texto: "x", estado: "comprobado", prioridad: "alta", evidencias: [ev] }],
      oportunidad: { id: "o1", titulo: "Publicar casos de clientes" },
      datosClave: [{ clave: "medios_pago", etiqueta: "Medios de pago", valor: "Visa, PayPal", clase: "observado", fuente: "https://facturo.example/" }],
    };
    const html = render({ anatomia: lista(anatomia), resumen: lista(resumen), datos: lista({ metricas: [], precios: [] }) });
    expect(html).toContain("Lo más importante");
    expect(html).toContain('href="#hallazgo-d1"');
    expect(html).toContain('href="#oportunidad-o1"');
    expect(html).toContain("Publicar casos de clientes");
    expect(html).toContain("Medios de pago");
    expect(html).toContain("Visa, PayPal");
  });
  it("las citas literales van en serif cursiva con su fuente, sin tocar el texto", () => {
    const html = render({ anatomia: lista(anatomia) });
    expect(html).toContain("«Cita literal de la web»");
    expect(html).toContain("font-cita");
    expect(html).toContain("Ver prueba");
  });

  it("bloque 2: indicadores con su clase y fuente; lo no fiable va en una línea, sin cifra", () => {
    const m = (clave: string, etiqueta: string, valor: unknown, estado: string, tipo: string) => ({
      clave,
      etiqueta,
      valor,
      unidad: "/100",
      fuente: "PageSpeed",
      tipo,
      metodologia: "Medición",
      obtenidoEn: "2026-10-19",
      confianza: "alta",
      motivoConfianza: "",
      limitaciones: [],
      supuestos: [],
      estado,
    });
    const datos = {
      metricas: [m("pagespeed_movil", "PageSpeed móvil", 63, "disponible", "observado"), m("visitas_mensuales", "Visitas mensuales", null, "insuficiente", "inferencia")],
      precios: [],
      escenario: null,
    };
    const html = render({ datos: lista(datos) });
    expect(html).toContain("63/100");
    expect(html).toContain("Observado");
    expect(html).toContain("Sin datos fiables: Visitas mensuales.");
  });

  it("el escenario hipotético aparece una vez, con su aviso, dentro del detalle", () => {
    const escenarioMetrica = {
      clave: "escenario_ingresos",
      etiqueta: "Escenario de ingresos",
      valor: { min: 4584, max: 45840 },
      unidad: "€/mes",
      tipo: "hipotesis",
      metodologia: "Clientes × precio",
      fuente: "Precios publicados",
      obtenidoEn: "2026-10-19",
      confianza: "baja",
      motivoConfianza: "",
      limitaciones: ["Escenario ilustrativo: no son los ingresos de la empresa", "Un precio anunciado no es un ingreso medio."],
      supuestos: [],
      estado: "disponible",
    };
    const datos = { metricas: [escenarioMetrica], precios: [], escenario: [{ clientes: 100, ingresosMes: 4584 }, { clientes: 1000, ingresosMes: 45840 }] };
    const html = render({ datos: lista(datos) });
    expect(veces(html, "45.840")).toBe(1);
    expect(veces(html, "Escenario ilustrativo: no son los ingresos de la empresa")).toBe(1);
    expect(html).toContain("Un precio anunciado no es un ingreso medio.");
  });

  it("bloque 3: fichas con precio Desconocido, dónde gana y pierde, y la matriz plegada", () => {
    const comp = {
      competidores: [
        {
          id: "c1",
          nombre: "Holded",
          web: "https://holded.com/",
          descripcion: "",
          tipo: "directo",
          motivo: "Mismo público",
          verificado: true,
          comprobadoEn: "2026-10-19",
          fuentes: ["https://holded.com/"],
          ficha: { publico: null, problema: null, propuesta: null, funcionalidades: [], precios: "desconocido", fortalezas: [], debilidades: [] },
        },
      ],
      matriz: { dimensiones: ["precio"], filas: [{ quien: "analizada", valores: { precio: "9 €/mes" }, evidencias: {} }, { quien: "c1", valores: { precio: "Desconocido" }, evidencias: {} }] },
      ganaPierde: [{ dimension: "precio", destaca: "analizada", evidencia: [], porQueImporta: "Decide la compra", aprender: "", diferenciarse: "" }],
    };
    const html = render({ competencia: lista(comp) });
    expect(html).toContain("Holded");
    expect(html).toContain("Directo");
    expect(html).toContain("Desconocido");
    expect(html).toContain('id="comparacion-precio"');
    expect(html).toContain('id="matriz-comparativa"');
    expect(html.indexOf("Dónde gana y dónde pierde")).toBeLessThan(html.indexOf('id="matriz-comparativa"'));
  });

  it("bloque 4: tarjeta estándar con estado, evidencia, por qué importa y qué hacer del plan", () => {
    const html = render({ diagnostico: lista(diagnostico), plan: lista(plan) });
    expect(html).toContain('id="hallazgo-d1"');
    expect(html).toContain("Precio claro.");
    expect(html).toContain("Comprobado");
    expect(html).toContain("Por comprobar");
    expect(html).toContain("Resta confianza");
    expect(html).toContain("Pedir testimonios");
    expect(html).toContain("Conclusión");
    expect(html).toContain("Prioridad: generar confianza.");
    expect(html).toContain('aria-pressed="true"');
  });

  it("bloque 5: por prioridad, hipótesis, ver origen y cómo validarlo agrupado", () => {
    const os = [oportunidad("o2", "media", ["d1"]), oportunidad("o1", "alta", ["d1", "d9"])];
    const html = render({ oportunidades: lista(os), diagnostico: lista(diagnostico), plan: lista(plan) });
    expect(html.indexOf("Oportunidad o1")).toBeLessThan(html.indexOf("Oportunidad o2"));
    expect(html).toContain("Prioridad alta");
    expect(html).toContain("Detectada");
    expect(html).toContain('href="#hallazgo-d1"');
    expect(html).not.toContain("hallazgo-d9");
    expect(html).toContain("Cómo validarlo");
    expect(html.indexOf("Preguntar a clientes")).toBeLessThan(html.indexOf("Contar respuestas"));
    expect(html).toContain("Indicador a1");
    expect(html).toContain("Si nadie responde");
    expect(html).toContain("Qué falta comprobar");
  });

  it("una sección fallida muestra su aviso", () => {
    const html = render({ anatomia: lista(anatomia), competencia: { estado: "error", contenido: null } });
    expect(html).toContain("No hemos podido generar esta sección.");
  });

  it("contenido mal formado o de v3 no rompe la vista", () => {
    const raro: Secs = {
      anatomia: lista({ nombre: "X" }),
      datos: lista({ metricas: "x" }),
      competencia: lista({ competidores: [null], matriz: null }),
      diagnostico: lista({ fortalezas: [{ id: "f1" }], debilidades: "x" }),
      oportunidades: lista([{ id: "o1" }]),
      plan: lista({ medir: "x" }),
      adn: lista({ viejo: true }),
    };
    expect(() => render(raro)).not.toThrow();
  });
});

describe("claveContenido", () => {
  it("cambia cuando cambia el contenido o el estado", () => {
    const s = (estado: "lista" | "error", x: number) => ({ clave: "anatomia" as const, titulo: "", estado, contenido: { x } });
    const a = claveContenido([s("lista", 1)]);
    expect(claveContenido([s("lista", 1)])).toBe(a);
    expect(claveContenido([s("lista", 2)])).not.toBe(a);
    expect(claveContenido([s("error", 1)])).not.toBe(a);
  });
});
