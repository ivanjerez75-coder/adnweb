# DNAweb — Plan: Informe v3.1 (solo datos fiables y reales)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Change the v3 report so it shows only reliable, real data:
- metric records labelled observado / estimado / hipotético with per-metric confidence;
- no invented traffic, revenue or valuation;
- a 5-dimension DNA Score with coverage;
- full opportunity cards;
- new free sources: full PageSpeed + CrUX, legal identity, JSON-LD.

**Architecture:** The plan builds on branch `feat/informe-v3`, which is already implemented (12-task plan `2026-10-18-dnaweb-informe-v3.md`, Tasks 1-11 done). The section keys, persistence and worker stay the same. The contents of `datos`, `score` and `cierre` change, and `adn` and `revision` gain fields.

**Tech Stack:** TypeScript, Vitest, zod, cheerio, Next.js 16.4.

**Spec:** `docs/superpowers/specs/2026-10-18-dnaweb-informe-v3-1-datos-fiables.md`. It is binding; v3 spec rules it doesn't change still apply.

## Global Constraints

- Never convert a ranking into visits. Monthly visits are always `estado: "insuficiente"`, `confianza: "insuficiente"`, `valor: null`, with "No hay datos fiables disponibles".
- Revenue:
  - It is `observado` only when it is published (Wikidata), with year, currency and source.
  - Otherwise it is "No estimable".
  - The hypothetical scenario exists only with a verifiable published price. It is labelled `hipotetico` and always carries the text "Escenario ilustrativo: no son los ingresos de la empresa".
- Valuation is always "No estimable con los datos disponibles", with `estado: "no_aplica"`.
- Confidence comes from code rules per metric: alta / media / baja / insuficiente.
- DNA Score:
  - It has the methodology `METODOLOGIA_DNA = "dna-score-1.0"` and 5 dimensions at 20 % each (Propuesta de valor, Oferta y monetización, Experiencia y rendimiento, Adquisición y visibilidad, Confianza y transparencia).
  - A missing indicator is "no evaluado", never 0.
  - A dimension's score is `round(100·Σpuntos/Σmáximo)` over its evaluated indicators. A dimension with less than 50 % coverage is "No puntuable".
  - The global score is the mean weighted over the scorable dimensions, with renormalised weights. If global coverage is below 60 % or fewer than 3 dimensions are scorable, it is "DNA Score no disponible".
  - Fixed texts: "Resume indicadores públicos; no es una valoración financiera." and "Pesos provisionales, pendientes de validación."
- Opportunities:
  - There are at most 3, each with ≥ 2 evidences and no padding.
  - Each has: hallazgo, evidencias, impacto, prioridad (computed by code from impacto/esfuerzo/riesgo), accion, validacion, confianza (`comprobado` | `hipotesis`) and supuestos.
- Company self-claims are `afirmacion` ("La empresa afirma…"), never a verified strength.
- All existing v3 rules still hold: evidence ids, the DATOS_WEB delimiter and escaping, Spanish text, no network in tests, no react or next in `lib/engine/`, never staging `.superpowers/` or `.env.local`, and the commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A site with no legal pages and no prices.** Confianza y transparencia and Oferta are mostly "no evaluado". Their dimensions show "No puntuable", not low scores.
2. **A NIF-like string that fails the check digit.** It is not reported as a CIF.
3. **PageSpeed quota error or no key.** The PageSpeed metrics are `estado: "error"` with the reason. Experiencia y rendimiento may be "No puntuable". The report doesn't fail.
4. **A price "desde 9 €" with no periodicity.** The scenario lists the supuesto "periodicidad desconocida". The monthly assumption is never stated as a fact.
5. **Old v3 rows already saved with the previous `datos` and `score` shapes.** The view's error boundary shows "No hemos podido generar esta sección" instead of crashing. No migration is needed, because this is pre-launch.

---

### Task 1: Full PageSpeed + CrUX and legal identity + JSON-LD sources

**Files:**
- `lib/engine/sources/pagespeed.ts`
- `lib/engine/sources/legal.ts` (new)
- `lib/engine/types.ts`
- `lib/engine/collect.ts`
- `lib/engine/sources/site-parse.ts` (JSON-LD fields)
- Tests: `tests/engine/pagespeed.test.ts`, `tests/engine/legal.test.ts`, plus the collect test update.

**Interfaces:**
- `PageSpeedData` becomes:
  ```ts
  {
    mobile: number | null;
    desktop: number | null;
    accesibilidad: number | null;
    buenasPracticas: number | null;
    seo: number | null;
    campo: {
      fuente: "url" | "origen";
      lcpMs: number | null;
      inpMs: number | null;
      cls: number | null;
      categoria: "FAST" | "AVERAGE" | "SLOW" | null;
    } | null;
    obtenidoEn: string;
    error?: string;
  }
  ```
  - Scores are 0-100.
  - `campo` is null when CrUX has no data. The mobile request asks for `category` = performance, accessibility, best-practices and seo, all four. Desktop asks for performance only.
  - Keep backwards compatibility for v2 readers of `mobile` and `desktop`.
- `LegalData`:
  ```ts
  {
    avisoLegal: string | null;   // URL
    privacidad: string | null;
    cookies: string | null;
    condiciones: string | null;
    cif: string | null;
    razonSocial: string | null;
    email: string | null;
    telefono: string | null;
    direccion: string | null;
    fuentes: Record<string, string>; // field → url
  }
  ```
- `extractLegal(home: SiteData | null, paginas: PageDoc[] | null, htmlByUrl: Map<string, string>): LegalData`. It is pure.
  - Fetching `htmlByUrl` is up to the builder. The simplest option is to keep the raw HTML of the deep-read pages transiently in collect, not persisted.
- `validarCifNif(s: string): boolean`. It handles a Spanish CIF (letter + 7 digits + control digit/letter) and a NIF/NIE.
- `SiteData` gains `jsonLdOrg: { name?, legalName?, address?, foundingDate?, sameAs?: string[] } | null`.
- `RawData` gains `legal: LegalData | null`. `fuentes.legal` is set.

**Steps:**
- [ ] 1. Write the failing tests:
  - PageSpeed parses all 4 categories ×100.
  - CrUX `loadingExperience` maps to `campo` with `fuente: "url"`, and falls back to `originLoadingExperience` with `fuente: "origen"`. An absent value gives null.
  - A quota error gives `error` set and the scores null.
  - `validarCifNif`: valid "B12345674" true, a wrong control false, NIF "12345678Z" true. Compute real valid examples in the test.
  - `extractLegal`:
    - finds legal links by text or href (aviso-legal, legal, privacidad, privacy, cookies, condiciones, terms);
    - finds a valid CIF next to "CIF" / "NIF";
    - finds a razón social with S.L. or S.A., or "Fundació", "Fundación" or "Asociación";
    - finds mailto/tel.
  - JSON-LD Organization fields are parsed.
- [ ] 2. Run `npm test -- pagespeed legal site`. Expected: FAIL.
- [ ] 3. Implement.
- [ ] 4. Run the full `npm test`, tsc and lint. Expected: green.
- [ ] 5. Commit: "Collect full PageSpeed with field data, legal identity and JSON-LD organization".

### Task 2: Metric records, confidence rules, revenue scenario, evidence ids

**Files:**
- `lib/engine/v3/estimates.ts`: rewrite. Replace `Estimacion` with `Metrica`, and delete the conversion and multiple tables.
- `lib/engine/v3/evidence.ts`: new `dato:*` ids.
- `docs/decisiones/0007-estimaciones-v3.md`: rewrite as "Métricas v3.1".
- Tests: `tests/engine/v3/estimates.test.ts` (rewrite) and `evidence.test.ts`.

**Interfaces:**
- `Metrica`: exactly the spec §2.1 fields.
- `construirMetricas(raw: RawData, now: Date): Metrica[]`. It always includes:
  - `visitas_mensuales` (insuficiente);
  - `popularidad_tranco`;
  - `popularidad_radar`;
  - `usuarios_reales_crux`;
  - `ingresos_publicados`;
  - `valoracion` (no_aplica);
  - `pagespeed_movil`, `pagespeed_escritorio`, `accesibilidad`, `seo_tecnico`, `buenas_practicas`;
  - `paginas_sitemap`, `titulos_descripciones`, `idiomas`, `blog_activo`.

  Each has its `estado`. When there is no data, the metric is present with estado `insuficiente` or `error`; it is never omitted.
- **Confidence rules:**
  - Tranco, Radar, CrUX and PageSpeed are `observado` with alta confianza for what they measure. Their `limitaciones` must say what they don't measure, e.g. "No mide visitas".
  - Wikidata revenue is alta if ≤ 2 years old, media if ≤ 5, baja otherwise.
- `preciosPublicados(raw): { importe: number; moneda: string; periodicidad: "mes" | "año" | "unico" | null; plan: string | null; url: string; texto: string }[]`. Periodicity is detected from "/mes", "al mes", "/mo", "month", "/año", "anual", "year".
- `escenarioIngresos(precios): { clientes: number; ingresosMes: number }[] | null`. Use 100, 500 and 1000 clientes × the median monthly price. It is null when there is no price. Annual prices are ÷ 12. Prices with unknown periodicity are treated as monthly, with the supuesto "periodicidad desconocida: se trata como mensual".
- The wrapper metric `escenario_ingresos` is `tipo: "hipotetico"`, with `supuestos` and the fixed text from Global Constraints in `limitaciones`.
- Evidence gains these ids, each present only when its value exists:
  - `dato:cif`, `dato:razon_social`, `dato:aviso_legal`, `dato:privacidad`, `dato:cookies`, `dato:contacto`;
  - `dato:jsonld_org`;
  - `dato:pagespeed`, `dato:crux`;
  - `dato:precio:<n>`.

**Steps:**
- [ ] 1. Write the failing tests:
  - teb-like raw (no prices, no Wikidata revenue) → `ingresos_publicados` insuficiente, no `escenario_ingresos`, valoracion `no_aplica` with "No estimable con los datos disponibles", `visitas_mensuales` `valor: null`.
  - Prices "29 €/mes" and "290 €/año" → median monthly (29 + 290/12)/2 = 26.58, scenarios 2658 / 13292 / 26583 (rounded), tipo hipotetico.
  - Wikidata revenue from 3 years ago → confianza media.
  - Tranco rank 50 000 → valor 50000, unidad "puesto", tipo observado, and limitaciones containing "No mide visitas".
  - PageSpeed error → those metrics have estado error.
  - The new evidence ids exist only when present.
- [ ] 2. Run `npm test -- estimates evidence`. Expected: FAIL.
- [ ] 3. Implement. Rewrite 0007. Remove the now-unused exports, and fix their importers (`report.ts`, `prompt.ts`) to the new API.
- [ ] 4. Run the full `npm test`, tsc and lint. Expected: green.
- [ ] 5. Commit: "Replace estimates with labelled metric records and an explicit hypothetical revenue scenario".

### Task 3: DNA Score v1.0 (5 dimensions with coverage)

**Files:** `lib/engine/v3/score.ts` (rewrite), `docs/decisiones/0008-dna-score.md` (rewrite). Test: `tests/engine/v3/score.test.ts` (rewrite).

**Interfaces:**
- `METODOLOGIA_DNA = "dna-score-1.0"`.
- `PESOS_DNA: Record<DimensionClave, number>`, each 0.2.
- `DimensionClave = "propuesta" | "oferta" | "experiencia" | "adquisicion" | "confianza"`.
- `calcularScore(raw, facts, signals, adn, revision | null, metricas: Metrica[], reg): DnaScore`, where `DnaScore` is:
  ```ts
  {
    metodologia;
    dimensiones: {
      clave;
      nombre;
      peso;
      valor: number | null;
      cobertura: number;           // 0-1
      indicadores: Indicador[];
    }[];
    global: number | null;
    coberturaGlobal: number;
    avisos: [
      "Resume indicadores públicos; no es una valoración financiera.",
      "Pesos provisionales, pendientes de validación.",
    ];
  }
  ```
- `Indicador = { clave; nombre; evaluado: boolean; puntos: number; maximo: number; motivo: string; evidencias: Evidence[] }`.
- Minimum indicators, documented in 0008. The builder may add more with justification.
  - **propuesta:**
    - queEs evidenciado;
    - propuestaValor evidenciada;
    - revision checks propuestaClara / diceAQuien, aggregated;
    - modeloEstado confirmado or probable.
  - **oferta:**
    - precios publicados;
    - página de precios;
    - canal de conversión evidenciado;
    - plan gratuito o prueba;
    - pagos tech.
  - **experiencia:**
    - pagespeed móvil;
    - accesibilidad;
    - buenas prácticas;
    - CrUX categoría.

    These are not evaluated if PageSpeed errored.
  - **adquisicion:**
    - seo técnico;
    - títulos/descripciones ratio;
    - sitemap;
    - blog activo;
    - redes;
    - popularidad Tranco/Radar.

    The last one is evaluated only if the site appears in at least one ranking list. "Not in ranking" counts as evaluated with low points only when Tranco answered ok.
  - **confianza:**
    - aviso legal;
    - privacidad;
    - CIF/razón social;
    - contacto visible;
    - testimonios/casos;
    - dominio antiguo (rdap);
    - email corporativo.

**Steps:**
- [ ] 1. Write the failing tests:
  - A dimension with 1 of 4 indicators evaluated → valor null, cobertura 0.25.
  - Missing data → evaluado false, never puntos 0 with evaluado true.
  - The weights are renormalised when one dimension is null.
  - Global coverage 0.5 → global null.
  - The avisos texts are exact.
  - PageSpeed error → experiencia null.
  - A full fixture gives the expected global, computed by hand in the test.
- [ ] 2. Run `npm test -- score`. Expected: FAIL.
- [ ] 3. Implement, and rewrite 0008. Novedad and competitor texts leave the score. Update `report.ts` to pass `metricas` instead of `textosCompetidores`.
- [ ] 4. Run the full `npm test`, tsc and lint. Expected: green.
- [ ] 5. Commit: "DNA Score v1.0: five weighted dimensions with indicator coverage".

### Task 4: AI section fields — modelo status, conversion channels, claims, opportunity cards

**Files:**
- `lib/engine/v3/sections/adn.ts`
- `revision.ts`
- `cierre.ts`
- `lib/engine/v3/prompt.ts`: include the legal/JSON-LD/price data lines in `bloqueDatosWeb`.
- Tests: the adn, revision and cierre tests.

**Interfaces:**
- `Adn` gains:
  - `modeloEstado: "confirmado" | "probable" | "desconocido"`. **Code rule:** confirmado only if some line has a `comoSeContrata` evidence that is a page extract and there is a published price or a conversion channel with page evidence; otherwise probable if the AI said confirmado or probable; desconocido if the AI said so.
  - `canales: { tipo: "prueba_gratuita" | "demo" | "contacto" | "suscripcion" | "compra" | "registro" | "presupuesto"; evidencias: Evidence[] }[]`. Each needs ≥ 1 page evidence.
  - `afirmaciones: { texto; evidencias }[]`: self-claims, each needing ≥ 1 page evidence. Shown as "La empresa afirma…".
- `Revision.bien[]` and `problemas[]` gain:
  - `relevancia: string`;
  - `confianza: "alta" | "media" | "baja"`;
  - `limitaciones: string[]`.

  The prompt forbids any claim about conversion, churn or lost customers. `bien` items whose only evidence is an afirmación-type extract are not "comprobado". The builder may simply instruct the model and label them, or drop them.
- `cierre` returns:
  ```ts
  {
    motivos: Record<DimensionClave, string[]>;
    oportunidades: {
      hallazgo;
      evidencias: Evidence[];
      impacto: string;
      impactoNivel;
      esfuerzo;
      riesgo: "alto" | "medio" | "bajo";
      prioridad: "alta" | "media" | "baja";
      accion;
      validacion: string;
      confianza: "comprobado" | "hipotesis";
      supuestos: string[];
    }[];
  }
  ```
  - **Prioridad code rule:** score = impacto(3/2/1) − esfuerzo(1/2/3)·0.5 − riesgo(1/2/3)·0.5. Above 1.5 is alta, above 0.5 media, otherwise baja.
  - Keep ≥ 2 evidences, at most 3 items, no padding, sorted by prioridad then impacto.
  - `confianza: "comprobado"` is only allowed when ≥ 1 evidence is a page extract and the hallazgo is about the website itself. Otherwise the code forces "hipotesis".

**Steps:**
- [ ] 1. Write the failing tests:
  - modeloEstado downgraded from confirmado to probable without page evidence;
  - a channel without page evidence dropped;
  - prioridad computed from levels;
  - an AI "comprobado" with only signal evidence forced to hipotesis;
  - an opportunity with 1 evidence dropped;
  - the prompt contains the CIF line when present.
- [ ] 2. Run `npm test -- adn revision cierre`. Expected: FAIL.
- [ ] 3. Implement.
- [ ] 4. Run the full `npm test`, tsc and lint. Expected: green.
- [ ] 5. Commit: "Add business-model status, conversion channels, claims and full opportunity cards".

### Task 5: Report assembly and plain view for the new shapes

**Files:**
- `lib/engine/v3/report.ts`
- `lib/shared/secciones-view.ts`
- `app/analisis/[id]/secciones.tsx`
- Tests: `tests/engine/v3/report.test.ts` and `tests/server/secciones-view.test.ts`.

**Interfaces:**
- `datos` is emitted with `{ metricas: Metrica[]; precios; escenario }` in phase 1, before adn, because none of it needs the tipo anymore. It is emitted once. Ruling R1 of the previous plan is retired.
- `score` is the `DnaScore` v1.0.
- `cierre` holds `{ motivos, oportunidades }`.
- Section titles change:
  - `cierre` → "Oportunidades";
  - `datos` → "Datos y métricas";
  - the rest are unchanged.
- The view:
  - Each metric shows: etiqueta, then the valor or "—", then badges `tipo` · `confianza` · `estado`. A "Metodología" line follows with fuente (link if http), obtenidoEn, periodo, limitaciones and supuestos.
  - `visitas_mensuales` shows "No hay datos fiables disponibles".
  - The hypothetical scenario is shown in its own box titled "Escenario hipotético", with the fixed text.
  - The DNA Score shows each dimension with its valor or "No puntuable", plus its cobertura %. Each indicator is shown as evaluado (puntos/máximo + motivo) or "No evaluado".
  - The global shows its valor or "DNA Score no disponible", the cobertura global, both avisos and the metodología version.
  - Opportunities are shown as cards with all fields, and the confianza badge reads "Comprobado" or "Hipótesis".
  - ADN shows "Modelo de negocio: <tipo> (confirmado/probable/desconocido)", the canales, and "La empresa afirma: …".
  - Everything is plain semantic HTML. Keep the per-section error boundary.

**Steps:**
- [ ] 1. Write the failing tests:
  - `datos` is emitted exactly once, before adn;
  - the section titles;
  - `ordenSecciones` is still correct.
- [ ] 2. Run `npm test -- report secciones-view`. Expected: FAIL.
- [ ] 3. Implement.
- [ ] 4. Run the full `npm test`, tsc, lint and `npx next build`. Expected: green.
- [ ] 5. Commit: "Assemble and show v3.1 metrics, score and opportunities".

### Task 6: PageSpeed key and real-site check (controller + user)

- [ ] 1. The controller guides the user to create a free PageSpeed API key: Google Cloud Console → "PageSpeed Insights API" → Credenciales → Crear clave.
  - The user pastes it into `.env.local` as `PAGESPEED_API_KEY` via Notepad.
  - The controller verifies the format without printing it.
- [ ] 2. The controller runs a script, `scripts/probar-informe.ts` (new, dev-only, not part of the app). It runs collect + `buildReportV3` for a URL with the real `.env.local` and writes the JSON to the scratchpad. It records the timings per section.
  - Run it on `teb.org` and on one SaaS with public prices, e.g. `tally.so`.
- [ ] 3. Check against the master-doc criteria:
  - it understands what the business sells;
  - it separates facts from hypotheses;
  - real sources and dates are shown;
  - no invented traffic, revenue or valuation;
  - concrete problems, not generic ones;
  - verifiable actions;
  - confidence is explained;
  - an unreachable or thin site is handled.

  Fix anything false. Record the results in `docs/decisiones/0009-informe-v3.md`, which also covers the old Task 12 content.
- [ ] 4. Commit: "Document report v3.1 decisions and real-site results".
