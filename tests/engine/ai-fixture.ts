import type { AiOutput } from "../../lib/engine/ai/schema";

export const validAiOutput: AiOutput = {
  resumen: {
    queHace: "Software de facturación online para autónomos.",
    paraQuien: "Autónomos y pequeñas empresas en España.",
    tipoNegocio: "saas",
    comoGanaDinero: "Suscripción mensual con dos planes.",
    precios: ["Básico 9 €/mes", "Pro 29 €/mes"],
  },
  trafico: { comentario: "Tráfico medio y en ligera caída." },
  ingresos: {
    anualMin: 300000,
    anualMax: 1200000,
    valoracionMin: 1500000,
    valoracionMax: 6000000,
    confianza: "baja",
    suposiciones: ["500.000–5.000.000 visitas/mes × 0,5 % registro × 20 % pago × 15 €/mes"],
  },
  senalesMercado: [{ id: "mercado_competidores_con_app", etiqueta: "Sus competidores principales tienen app móvil" }],
  oportunidades: [
    { titulo: "App móvil para facturar desde el móvil", paraQuien: "competir", senales: ["sin_app_movil", "mercado_competidores_con_app", "pagespeed_movil_bajo"] },
    { titulo: "Inventada sin datos", paraQuien: "mejorar", senales: ["no_existe"] },
  ],
  veredicto: {
    puntuaciones: {
      mercado: { valor: 70, senales: ["mercado_competidores_con_app"] },
      traccion: { valor: 50, senales: ["trafico_en_caida", "no_existe"] },
      monetizacion: { valor: 80, senales: [] },
      diferenciacion: { valor: 41, senales: [] },
    },
    fortalezas: ["Precios claros", "Plan gratuito", "Marca en español"],
    debilidades: ["Web lenta en móvil", "Sin app", "Tráfico en caída"],
    competidores: [{ nombre: "Holded", dominio: "holded.com" }],
    conclusion: "Negocio consolidado con margen de mejora en móvil.",
  },
};
