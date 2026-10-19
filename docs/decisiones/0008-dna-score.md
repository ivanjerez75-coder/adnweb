# 0008 — DNA Score v1.0: cinco dimensiones con cobertura (informe v3.1)

- **Fecha:** 2026-10-19 (sustituye a la versión de 2026-10-18 con 6 criterios)
- **Decisión:** el DNA Score mide la calidad digital observable de un negocio con reglas publicadas y reproducibles (`lib/engine/v3/score.ts`, metodología `dna-score-1.0`). Lo calcula el código; la IA nunca lo calcula ni lo modifica (solo explica el resultado en el cierre).
- **Firma:** `calcularScore(raw, facts, signals, adn, revision | null, metricas: Metrica[], reg)`. Es una función pura: no usa el reloj (la antigüedad se mide contra `raw.collectedAt`), no hace red y no recibe competidores.
- **Textos fijos** (campo `avisos`):
  - "Resume indicadores públicos; no es una valoración financiera."
  - "Pesos provisionales, pendientes de validación."

## Reglas generales

- **Dimensiones** (peso 0,2 cada una, en `PESOS_DNA`): propuesta de valor, oferta y monetización, experiencia y rendimiento, adquisición y visibilidad, confianza y transparencia.
- **Indicador:** `{ clave, nombre, aplica, evaluado, puntos, maximo, motivo, evidencias }`.
  - Un dato que falta es **no evaluado** (`evaluado: false`, 0 puntos, no cuenta). Nunca es un 0 puntuado.
  - Una ausencia solo puntúa 0 si se pudo comprobar: la web se leyó con texto suficiente (≥ 1.500 caracteres, como en `facts`), la página legal se analizó, etc. Con poco texto, "no vi precios" no prueba nada y el indicador queda no evaluado.
- **No aplica:** un indicador que no corresponde al tipo de negocio (`adn.tipoNegocio`) sale con `aplica: false`, `evaluado: false`, 0 puntos y el motivo "No aplica a este tipo de negocio". No puntúa y se excluye de la cobertura. No es lo mismo que "no evaluado" (faltan datos): es un 0 que no se debe a la empresa. Ver "Indicadores que no aplican".
- **Dimensión:** `round(100 × Σ puntos / Σ máximo)` sobre los indicadores evaluados. Cobertura = evaluados / aplicables (los que no aplican no cuentan). Con cobertura < 50 % la dimensión es "No puntuable" (`valor: null`).
- **Global:** media ponderada de las dimensiones puntuables con los pesos renormalizados. Cobertura global = media de las coberturas. Si es < 60 % o hay menos de 3 dimensiones puntuables, `global: null` ("DNA Score no disponible").
- **Sale del score:** Novedad y los competidores. Las señales (`signals`) tampoco puntúan. Las puntuaciones no se comparan entre empresas.
- **Métricas:** los indicadores de PageSpeed, SEO y popularidad leen el array `metricas` y solo cuentan si `estado === "disponible"`.

## Indicadores

### Propuesta de valor

| Clave | Regla | Puntos |
|---|---|---|
| `que_es` | `adn.queEs` con texto y al menos una cita. Sin web: no evaluado. Web leída sin explicación citable: 0 | 25 |
| `propuesta_valor` | Igual con `adn.propuestaValor` | 25 |
| `claridad_web` | `round(30 × si / válidos)` sobre los checks `propuestaClara` y `diceAQuien` de todas las líneas de la revisión (excluye `no_aplica`). Sin revisión o sin checks válidos: no evaluado | 30 |
| `modelo_negocio` | Alguna línea con `comoSeContrata` no vacío y evidencia de página: 20; si no, 0. Sin web: no evaluado. *Task 4: usar `adn.modeloEstado` (confirmado o probable) cuando exista* | 20 |

### Oferta y monetización

| Clave | Regla | Puntos |
|---|---|---|
| `precios_publicados` | `site.pricesFound` o evidencias `dato:precio:N`: 25. Sin precios y web legible: 0. Web poco legible: no evaluado | 25 |
| `pagina_precios` | `facts.paginaPrecios`: `si` 15, `no` 0, `desconocido` no evaluado. Solo aplica a saas, ecommerce, marketplace y app | 15 |
| `canal_conversion` | Algún canal de `adn.canales` con evidencia (extracto de página o, en el respaldo de contacto, `dato:contacto`): 20. Sin canales y web legible: 0 | 20 |
| `plan_gratuito` | `site.hasFreePlanOrTrial`: 15. Si no y web legible: 0. Solo aplica a saas y app | 15 |
| `pagos` | Tecnología de categoría `pagos` (`allTechnologies`): 25. Si no y web legible: 0. Solo aplica a ecommerce, saas, marketplace y app | 25 |

### Indicadores que no aplican (informe v3.1, caso teb.org)

Una cooperativa social sacaba 0/100 en "Oferta y monetización" por no tener plan gratuito, cobro en línea ni página de precios: se la penalizaba por no ser un SaaS. Ahora esos indicadores dependen de `adn.tipoNegocio`:

| Indicador | Aplica solo a |
|---|---|
| `plan_gratuito` | saas, app |
| `pagos` | ecommerce, saas, marketplace, app |
| `pagina_precios` | saas, ecommerce, marketplace, app |

`precios_publicados` y `canal_conversion` aplican siempre. Para el resto de tipos (servicios, contenido_ads, organizacion_social, negocio_local, otro) los tres quedan como "no aplica" y la dimensión se puntúa con los dos que quedan.

### Experiencia y rendimiento

Si PageSpeed falló (`raw.pagespeed.error`) las métricas salen en estado `error` y los cuatro indicadores quedan no evaluados.

| Clave | Regla | Puntos |
|---|---|---|
| `pagespeed_movil` | Métrica `pagespeed_movil`: `round(35 × valor / 100)` | 35 |
| `accesibilidad` | Métrica `accesibilidad`: `round(25 × valor / 100)` | 25 |
| `buenas_practicas` | Métrica `buenas_practicas`: `round(20 × valor / 100)` | 20 |
| `crux` | Categoría de CrUX: FAST 20, AVERAGE 10, SLOW 0. Sin categoría: no evaluado | 20 |

### Adquisición y visibilidad

| Clave | Regla | Puntos |
|---|---|---|
| `seo_tecnico` | Métrica `seo_tecnico`: `round(20 × valor / 100)` | 20 |
| `titulos_descripciones` | `round(15 × (con título + con descripción) / (2 × páginas leídas))` | 15 |
| `sitemap` | Métrica `paginas_sitemap`: ≥ 50 páginas 15; ≥ 10 → 10; menos → 5. Sin sitemap legible: no evaluado | 15 |
| `blog_activo` | Métrica `blog_activo`: "Sí" 15, "No" 0. Sin sitemap: no evaluado | 15 |
| `redes` | `facts.redes`: ≥ 3 → 15; 1-2 → 8; ninguna con web legible → 0 | 15 |
| `popularidad` | Se evalúa solo si aparece en algún ranking (Tranco; Radar si no hay Tranco). Top 10k 20; 100k 15; 1M 10; fuera 5. Si no aparece pero Tranco respondió bien (`fuentes.tranco === "ok"`): 3 puntos evaluado. Si Tranco falló: no evaluado. No es tráfico | 20 |

### Confianza y transparencia

| Clave | Regla | Puntos |
|---|---|---|
| `aviso_legal` | `raw.legal.avisoLegal`: 15, si no 0. Sin análisis legal (`raw.legal` null): no evaluado | 15 |
| `privacidad` | `raw.legal.privacidad`: 15, si no 0 | 15 |
| `identidad_legal` | CIF y razón social: 15; solo uno: 8; ninguno: 0 | 15 |
| `contacto` | Correo, teléfono o dirección: ≥ 2 vías 15; 1 vía 8; ninguna 0 | 15 |
| `testimonios` | `site.hasTestimonials` o check `muestraCasos = si` en la revisión: 10. Si no y web legible: 0 | 10 |
| `dominio_antiguo` | Registro RDAP frente a `collectedAt`: ≥ 5 años 15; ≥ 2 años 8; menos 0. No indica la edad de la empresa | 15 |
| `email_corporativo` | `raw.dns.emailProvider` distinto de "Ninguno": 15, si no 0. Sin DNS: no evaluado | 15 |

## Evidencias

Cada indicador adjunta los `Evidence` que lo respaldan, tomados del registro (`reg`): `dato:aviso_legal`, `dato:privacidad`, `dato:cif`, `dato:razon_social`, `dato:contacto`, `dato:pagespeed`, `dato:crux`, `dato:email`, `dato:trafico`, `dato:paginas_sitemap`, `dato:precio:N`, y los extractos de página de `adn` (`queEs`, `propuestaValor`, `comoSeContrata`).

## Por qué

- Una puntuación solo es defendible si cada punto se explica con una regla y un dato.
- Penalizar lo que no se pudo medir (como hacía la versión de 6 criterios) castiga a la empresa por una limitación nuestra; por eso la cobertura se muestra aparte y manda sobre si hay puntuación.
- Novedad dependía de los textos de competidores encontrados por IA: no es reproducible, por lo que sale del score y los competidores se quedan como sección informativa.

## Pendiente de calibrar

- Los puntos de cada indicador y los tramos son orientativos; los pesos son provisionales. Contrastarlos con casos reales antes de usarlos para comparar.
- La tabla de aplicabilidad por tipo de negocio es una primera aproximación; revisarla con más casos reales.
- La antigüedad del dominio no es la de la empresa.
