# 0008 — DNA Score por reglas de código, aprendizajes y acciones (informe v3)

- **Fecha:** 2026-10-18
- **Decisión:** El DNA Score lo calcula el código con reglas transparentes (`lib/engine/v3/score.ts`); la IA nunca lo calcula ni lo modifica. Un criterio sin datos suficientes vale `null` y se muestra como "No puntuable". Aviso fijo: "Resume indicadores públicos; no es una valoración financiera."
- **Firma:** `calcularScore(raw, facts, signals, adn, revision | null, textosCompetidores, reg)`. Cada criterio lleva `motivos` (texto en español generado por código, p. ej. "+25: empresa consolidada") y `evidencias` (las del registro `dato:*`, señales o extractos de página que lo respaldan, cuando existen).

| Criterio | Regla | Null si |
|---|---|---|
| Claridad | % de "si" entre los checks no `no_aplica` de todas las líneas de la revisión | revisión ausente (sección fallida) o < 3 checks válidos |
| Visibilidad | Ranking (Tranco, o Radar si no hay): top 10k → 85, 100k → 65, 1M → 45, fuera → 25; +10 `blog_activo`; −10 `pagespeed_movil_bajo`; límite 0-100 | no hay datos de ranking (ni Tranco ni Radar) |
| Monetización | 30 base; +30 precios detectados o `paginaPrecios = si`; +20 alguna línea con `comoSeContrata` no vacío y evidencia de página; +20 tecnología de categoría `pagos` | no hay web propia |
| Confianza y madurez | +25 `empresa_consolidada`; +25 testimonios o casos; +25 datos en Wikidata; +25 correo corporativo ≠ Ninguno; −25 `dominio_reciente` | menos de 2 de estos 5 inputs tienen dato |
| Presencia digital | Redes ≥ 3 → +30, 1-2 → +15; blog `si` → +20; app `si` → +20; lastmod del sitemap entre 0 y 90 días antes de la recogida (fechas futuras no cuentan) → +30 | no hay web propia |
| Novedad | 50 + 10 × (items de `queOfrece` cuyo texto no aparece en ningún competidor verificado), máx. 100 | < 2 competidores verificados, o sin items |
| Global | Media redondeada de los criterios no nulos | menos de 3 criterios con valor |

- **Mapa de inputs a campos reales** (no se inventa ningún campo; si no existe, el input cuenta como ausente):
  - Precios: `raw.site.pricesFound` o `facts.paginaPrecios === "si"`.
  - Tecnologías de pago: `allTechnologies(raw)` con categoría `pagos`.
  - Redes: `facts.redes`; blog: `facts.blog`; app: `facts.app`.
  - Actividad reciente: `raw.sitemap.lastModified` frente a `raw.collectedAt` (la función no recibe `now`, así el resultado es reproducible).
  - Testimonios: `raw.site.hasTestimonials` o `revision.lineas[].checks.muestraCasos === "si"`.
  - Wikidata: `raw.wikidata`; correo: `raw.dns.emailProvider`.
  - Señales por id: `empresa_consolidada`, `dominio_reciente`, `blog_activo`, `pagespeed_movil_bajo`.
- **Disponibilidad en Confianza:** un input "tiene dato" si su fuente se recogió (p. ej. Wikidata solo con estado `ok`, DNS presente, RDAP presente (único origen de `empresa_consolidada` y `dominio_reciente`), web presente o checks de casos aplicables). Con dato y sin positivo suma 0.
- **Novedad:** los items se normalizan con `normalizarTexto` y se buscan como palabra o frase completa (`contienePalabra`) en los textos de portada de los competidores verificados.
- **Cierre (`generarCierre`):** la IA devuelve una frase por criterio (`motivos`, solo para claves conocidas; explica, no cambia números) y acciones. Cada acción necesita ≥ 2 evidencias válidas, `impacto` y `esfuerzo` en alto/medio/bajo (si no, se descarta solo esa acción). Se ordenan por impacto descendente y esfuerzo ascendente y se recortan a 3. Si sobreviven menos de 3, se devuelven las que haya: sin relleno.
- **Qué aprender (`generarAprender`):** 2-4 items, cada uno con ≥ 1 evidencia. Admite opcionalmente `competidores` (solo los verificados entran en el prompt). Si sobreviven menos de 2 se devuelven los que haya; si no sobrevive ninguno lanza `SeccionVaciaError`.
- **Límites sin reintentos:** los recortes de longitud se hacen con `.transform(slice)`/en código, no con `.max()`, para no gastar intentos de IA.
- **Por qué:** una puntuación solo es defendible si cada punto se explica con una regla y un dato; la IA ayuda a redactar, no a decidir.
- **Pendiente de calibrar:** los tramos y pesos son orientativos; contrastarlos con casos reales. `empresa_consolidada` puede venir de la antigüedad del dominio (RDAP), que no es la de la empresa.
