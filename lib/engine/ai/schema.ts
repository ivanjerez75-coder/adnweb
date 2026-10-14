import { z } from "zod";

const confidence = z.enum(["baja", "media", "alta"]);
const subscore = z.object({ valor: z.number().min(0).max(100), senales: z.array(z.string()) });

export const aiOutputSchema = z.object({
  resumen: z.object({
    queHace: z.string(),
    paraQuien: z.string(),
    tipoNegocio: z.enum(["saas", "ecommerce", "marketplace", "contenido_ads", "servicios", "app", "otro"]),
    comoGanaDinero: z.string(),
    precios: z.array(z.string()),
  }),
  trafico: z.object({ comentario: z.string() }),
  ingresos: z.object({
    anualMin: z.number().nullable(),
    anualMax: z.number().nullable(),
    valoracionMin: z.number().nullable(),
    valoracionMax: z.number().nullable(),
    confianza: confidence,
    suposiciones: z.array(z.string()),
  }),
  senalesMercado: z.array(z.object({ id: z.string().regex(/^mercado_[a-z0-9_]+$/), etiqueta: z.string() })),
  oportunidades: z.array(
    z.object({ titulo: z.string(), paraQuien: z.enum(["competir", "mejorar"]), senales: z.array(z.string()) }),
  ),
  veredicto: z.object({
    puntuaciones: z.object({
      mercado: subscore,
      traccion: subscore,
      monetizacion: subscore,
      diferenciacion: subscore,
    }),
    fortalezas: z.array(z.string()),
    debilidades: z.array(z.string()),
    competidores: z.array(z.object({ nombre: z.string(), dominio: z.string().nullable() })),
    conclusion: z.string(),
  }),
});

export type AiOutput = z.infer<typeof aiOutputSchema>;
