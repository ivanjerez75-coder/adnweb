# 0007 — Estimaciones calculadas por código (informe v3)

- **Fecha:** 2026-10-18
- **Decisión:** Las cifras del informe (tráfico, ingresos, valoración) las calcula el código, no la IA. Cada estimación lleva valor, unidad, fuente, metodología y confianza. Si no hay base suficiente, el valor es "No estimable" con un motivo en español; nunca se rellena con una cifra inventada. Código en `lib/engine/v3/estimates.ts`.
- **Tráfico:** se reutiliza la tabla ranking → visitas de la decisión 0003 y su confianza.
- **Ingresos mensuales**, por orden de prioridad:
  1. Ingresos públicos de Wikidata: rango del ancla (±10 %) dividido entre 12, confianza alta.
  2. Empleados de Wikidata × ingresos por empleado del sector (×0,5–×1,5) dividido entre 12, confianza media (se reutiliza el ancla ya existente en `anchors.ts`).
  3. Fórmula propia: visitas mín. × conversión mín. × precio … visitas máx. × conversión máx. × precio, confianza baja. Precio = mediana de los precios detectados, pasados a euros (USD 0,92; GBP 1,17).
  4. Si falta tráfico, precios o una conversión para ese tipo: no estimable.
- **Valoración:** ingresos anuales (mensuales × 12) × múltiplo del tipo de negocio. Su confianza nunca supera la de los ingresos y, al ser un múltiplo genérico, nunca pasa de "media". Sin ingresos o sin múltiplo para el tipo: no estimable.

| Tipo | Conversión de referencia | Múltiplo de valoración (× ingresos anuales) |
|---|---|---|
| saas | 2-5 % | 3-8 |
| ecommerce | 1-3 % | 1-3 |
| marketplace | 1-4 % | 2-5 |
| app | 1-3 % | 2-6 |

- **Tipos sin tabla** (contenido_ads, servicios, otro): no hay conversión ni múltiplo de referencia fiable, así que solo se estiman ingresos si hay datos públicos en Wikidata.
- **Métricas SEO y datos publicados:** títulos y descripciones se cuentan sobre las páginas leídas en profundidad (`PageDoc.tieneDescripcion`, meta description no vacía). Los datos publicados reutilizan el registro de evidencias (`dato:*`), de modo que cada uno es citable.
- **Por qué:** una cifra sin fuente ni método no se puede defender; mejor "No estimable" que un número inventado.
- **Pendiente de calibrar:** conversiones y múltiplos son valores orientativos; contrastarlos con casos reales. El precio detectado se trata como mensual, lo que puede sobrestimar si es un pago anual o por pedido.
