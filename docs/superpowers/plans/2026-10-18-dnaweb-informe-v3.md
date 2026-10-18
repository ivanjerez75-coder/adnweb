# DNAweb — Plan: Informe v3 (entender el negocio y saber qué hacer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template report with a 4-block report (ADN del negocio · Qué sabemos y qué no · DNA Score · Comprender y actuar). The new report is evidence-based: every claim cites a literal page extract or a verified datum. It is generated in parallel sections that the user sees as they arrive.

**Architecture:**
- **Collection.** It gains a deep read of up to 15 own pages. Each page becomes numbered extracts (`p3-e2`). An **evidence registry** unifies those extracts with signals, facts and external data, so every AI output can be validated against real ids.
- **Code-only parts.** Estimates (traffic, monthly revenue, valuation, free SEO), published data and the DNA Score numbers are computed by code.
- **AI sections.** The AI writes the sections through small, independent calls with per-section zod schemas, under a concurrency limit. Competitors use Gemini with Google Search grounding and are verified against their homepage.
- **Worker.** It saves each section to the DB as soon as it is ready. The analysis becomes `listo` once block 1 is saved.

**Tech Stack:** TypeScript, Vitest 5, zod 3, @google/genai (`tools: [{ googleSearch: {} }]`), Supabase. Next.js 16.4 for the minimal page.

**Spec:** `docs/superpowers/specs/2026-10-18-dnaweb-informe-v3-design.md`. Its §8b holds Claude's decisions, which bind this plan. Plan 2 behaviour (`2026-10-17-dnaweb-cuentas.md`) must keep working.

## Global Constraints

- **Free tier only, MVP.**
  - No paid sources.
  - Google Search grounding is used only within Gemini's free quota. If it is unavailable, competitors come from model knowledge and are marked "no verificado".
- **Evidence.**
  - Every claim in blocks 1, 3 and 4 cites ≥ 1 existing evidence id. The code drops anything that cites unknown ids.
  - A "problema" needs ≥ 1 page extract.
  - An "acción" needs ≥ 2 evidences.
  - A page extract is literal page text of ≤ 200 chars.
- **Retired rule.** The old 2-signals/2-sources opportunity rule no longer applies to v3. Keep the v2 code for old reports.
- **Revenue and valuation (spec §8b.1).**
  - The AI never proposes figures.
  - Monthly revenue comes from:
    - the Wikidata anchor ÷ 12, or
    - the code's traffic formula, only if there is traffic, there are detected prices, and the tipo is in {saas, ecommerce, marketplace, app}.
  - Otherwise revenue is "No estimable".
  - Valuation exists only if revenue does. It is annual revenue × the multiple range for the tipo, and its confidence is ≤ the revenue confidence.
  - The tables are documented in `docs/decisiones/0007-estimaciones-v3.md`.
- **DNA Score.**
  - 6 criteria (Claridad, Visibilidad, Monetización, Confianza y madurez, Presencia digital, Novedad y diferenciación), each scored 0-100 by code rules.
  - A criterion without enough data is "No puntuable".
  - The global score is the mean of the scorable criteria, and only exists if ≥ 3 are scorable.
  - It always carries the text "Resume indicadores públicos; no es una valoración financiera."
  - Rules are documented in `docs/decisiones/0008-dna-score.md`.
- **Timing.**
  - Total collection deadline stays 40 s. The deep page read has its own 25 s cap.
  - Code-only parts are saved right after collection, then block 1, then the rest.
  - Target: something useful in ≈ 25 s, complete in ≤ 90 s.
  - AI concurrency ≤ 3 simultaneous calls per analysis.
- **Status and credits.**
  - The analysis becomes `listo` when block 1 is saved; the credit is consumed.
  - If block 1 fails, the analysis becomes `error` and the credit is refunded.
  - Other sections fail independently. Their state is `error`, and a section still `pendiente` 3 min after `created_at` is shown as failed.
- **Versions.**
  - New reports carry `version: 3`.
  - The cache ignores raw data without `version: 3`.
  - Old v2 reports keep rendering their summary with "Informe de una versión anterior".
- **Code rules.**
  - All website content goes inside the existing `<<<DATOS_WEB … DATOS_WEB>>>` delimiter, escaped with the existing `escapeAngles`.
  - User-facing text is in Spanish.
  - `lib/engine/` does not import react or next.
  - No network calls in tests.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Location:** `C:\Users\ivanj\OneDrive\Desktop\dnaweb`, branch `feat/informe-v3`, created from `main` after Plan 2 is merged.

## Review Focus

1. **A site in Catalan or English.** All report text is still in Spanish. Extracts stay literal, in their original language.
2. **A business with one single line** (a simple shop) **and one with 6 lines.** Block 1 adapts. Block 4 reviews each line, capped at 6.
3. **Gemini search quota exhausted or grounding error.** Competitors still appear, marked "no verificado". Novedad is "No puntuable". The report doesn't fail.
4. **A competitor homepage that is unreachable or a different business.** The competitor stays "no verificado". No "diferencias verificables" are claimed for it.
5. **The AI cites a non-existent extract, or an extract from another page.** The citation is dropped. If a problem loses all its extracts, the problem is dropped.

## File Structure

```
lib/engine/types.ts                        (mod) PageDoc, Extract, RawData.paginas, RawData.version
lib/engine/sources/sitemap.ts              (mod) expose candidate page URLs
lib/engine/sources/pages.ts                (new) selectPages + fetchPages → PageDoc[] with extracts
lib/engine/collect.ts                      (mod) deep read, version 3
lib/engine/v3/evidence.ts                  (new) evidence registry + citation validation
lib/engine/v3/estimates.ts                 (new) monthly revenue, valuation, SEO, published data
lib/engine/v3/llm.ts                       (new) runSection<T>() + concurrency limiter
lib/engine/v3/sections/adn.ts              (new) block 1
lib/engine/v3/sections/saber.ts            (new) block 2 AI part ("no se puede saber")
lib/engine/v3/sections/revision.ts         (new) qué hace bien + problemas por línea (checklist)
lib/engine/v3/sections/competidores.ts     (new) grounded search + homepage verification
lib/engine/v3/sections/aprender.ts         (new) qué aprender
lib/engine/v3/score.ts                     (new) DNA Score rules (code)
lib/engine/v3/sections/cierre.ts           (new) score reasons + 3 acciones
lib/engine/v3/report.ts                    (new) ReportV3 types + buildReportV3(raw, deps, onSection)
lib/engine/ai/providers.ts                 (mod) geminiSearchModel
supabase/migrations/0002_secciones.sql     (new) analyses.secciones jsonb, analyses.version int
lib/server/analyses/repo.ts, supabase-repo.ts, tests/server/fake-repo.ts   (mod) guardarSeccion, marcarListo
lib/server/analyses/run.ts                 (mod) v3 flow
app/api/analisis/[id]/route.ts + handlers.ts (mod) return secciones
app/analisis/[id]/*                        (mod) progressive plain view + v2 notice
docs/decisiones/0007-estimaciones-v3.md, 0008-dna-score.md, 0009-informe-v3.md
```

---

### Task 1: Deep page read with extracts

**Files:** `lib/engine/types.ts`, `lib/engine/sources/sitemap.ts`, `lib/engine/sources/pages.ts`, `lib/engine/collect.ts`. Tests: `tests/engine/pages.test.ts`, plus updates to the `collect` and `sitemap` tests.

**Interfaces:**
- `Extract = { id: string; cita: string }`
- `PageDoc = { id: string; url: string; titulo: string; extractos: Extract[] }`. Page ids are `p1`…`p15`. Extract ids are `p<n>-e<k>`.
- `SitemapData` gains `candidatas: string[]`: up to 100 own-domain URLs, prioritised by section.
- `RawData` gains `paginas: PageDoc[] | null` and `version: 3`. The `fuentes` key is `paginas`.
- `selectPages(home: SiteData, sitemap: SitemapData | null, max = 15): string[]`
- `fetchPages(urls: string[], get: PageGetter, opts: { timeoutMs: number }): Promise<PageDoc[]>`
- `extractPassages(html: string, max = 25): string[]`

**Steps:**

- [ ] **1. Write the failing tests.**
  - `extractPassages`:
    - returns literal sentences or paragraphs of ≤ 200 chars from `<main>`/`<body>` text, without nav/footer/script/style;
    - drops duplicates and fragments under 30 chars;
    - caps the result at 25.
  - `selectPages`:
    - prefers URLs whose first path segment (or the second, after a language segment) matches servicios|services|productos|products|soluciones|solutions|empresas|about|nosotros|quienes-somos|precios|pricing|casos|clientes|customers|contacto|contact|empleo|careers;
    - always includes the home page;
    - dedupes;
    - stays on the own registrable domain;
    - caps at 15.
  - `fetchPages`:
    - assigns sequential ids;
    - skips pages that fail or answer ≥ 400;
    - stops waiting at `timeoutMs` and returns whatever finished. Use fake timers or an injected sleep.
  - `collect`:
    - with the fake network, `raw.version === 3`;
    - `raw.paginas` has the home page;
    - `fuentes.paginas === "ok"`.
- [ ] **2.** Run `npm test -- pages collect sitemap`. Expected: FAIL.
- [ ] **3. Implement.**
  - Reuse cheerio and `sections.ts` matching.
  - The deep read runs in collect's post-site phase, in parallel with the other sources, inside the 40 s deadline.
- [ ] **4.** Run the full `npm test`, typegen + tsc and lint. Expected: green.
- [ ] **5. Commit:** "Deep-read up to 15 own pages into numbered literal extracts".

---

### Task 2: Evidence registry and citation validation

**Files:** `lib/engine/v3/evidence.ts`. Test: `tests/engine/v3/evidence.test.ts`.

**Interfaces:**
- `Evidence = { id: string; tipo: "pagina" | "senal" | "dato"; texto: string; url?: string; fuente: string }`
- `buildEvidence(raw: RawData, signals: Signal[]): Map<string, Evidence>`. It holds:
  - every page extract;
  - every signal (by id);
  - data ids: `dato:fundacion`, `dato:empleados`, `dato:sede`, `dato:empleo`, `dato:app`, `dato:email`, `dato:trafico`, `dato:paginas_sitemap`, `dato:idiomas`. Each exists only when the value exists.
- `citar(ids: string[], reg: Map<string, Evidence>, opts?: { requierePagina?: boolean; minimo?: number }): Evidence[] | null`. It drops unknown ids. It returns null if fewer than `minimo` remain (default 1), or if `requierePagina` is set and no `pagina` evidence remains.

**Steps:**

- [ ] **1. Write the failing tests:**
  - unknown ids are dropped;
  - `requierePagina` returns null when only signals remain;
  - `minimo: 2` needs 2 valid ids;
  - data ids appear only when the value exists;
  - extract texts are not modified.
- [ ] **2.** Run `npm test -- evidence`. Expected: FAIL.
- [ ] **3.** Implement.
- [ ] **4.** Run the tests. Expected: PASS.
- [ ] **5. Commit:** "Add evidence registry and citation validation".

---

### Task 3: Code-computed estimates and published data

**Files:** `lib/engine/v3/estimates.ts`, `docs/decisiones/0007-estimaciones-v3.md`. Test: `tests/engine/v3/estimates.test.ts`.

**Interfaces:**
- `Estimacion = { valor: Range | number | null; unidad: string; fuente: string; metodologia: string; confianza: Confidence; motivoNoEstimable?: string }`
- `estimarTrafico(anchors): Estimacion`
- `estimarIngresosMensuales(raw, anchors, tipo, precios: string[]): Estimacion`
- `estimarValoracion(ingresos: Estimacion, tipo): Estimacion`
- `metricasSeo(raw): { paginasSitemap, sitemapCompleto, pagespeedMovil, titulosYDescripciones: { conTitulo: number; conDescripcion: number; total: number }, idiomas, blogActivo }`. The title/description counts come from the deep-read pages, so `PageDoc` also needs `tieneDescripcion: boolean`. Add it in this task.
- `datosPublicados(raw): { etiqueta: string; valor: string; fuente: string; evidencia: string }[]`

**Values (also written to 0007):**

| Tipo | Conversión de referencia | Múltiplo de valoración (× ingresos anuales) |
|---|---|---|
| saas | 2-5 % | 3-8 |
| ecommerce | 1-3 % | 1-3 |
| marketplace | 1-4 % | 2-5 |
| app | 1-3 % | 2-6 |

- Average price is the median of the detected prices, parsed to EUR.
- The revenue range is visits.min × conv.min × price … visits.max × conv.max × price, with confidence "baja".
- With a Wikidata anchor, use `anchor.range / 12` with its confidence.

**Steps:**

- [ ] **1. Write the failing tests:**
  - teb-like raw (`servicios`, no prices, no Wikidata) → revenue and valuation are "No estimable", with a Spanish `motivoNoEstimable`;
  - saas with traffic + prices "9 €", "29 €" → a range that matches the formula, confianza baja;
  - Wikidata revenue 12M EUR → monthly 0.9M–1.1M, alta;
  - valuation confidence ≤ revenue confidence;
  - SEO counts.
- [ ] **2.** Run `npm test -- estimates`. Expected: FAIL.
- [ ] **3.** Implement, and write 0007.
- [ ] **4.** Run the tests. Expected: PASS.
- [ ] **5. Commit:** "Add code-computed estimates for v3".

---

### Task 4: Section runner, concurrency limit and search model

**Files:** `lib/engine/v3/llm.ts`, `lib/engine/ai/providers.ts`. Test: `tests/engine/v3/llm.test.ts`.

**Interfaces:**
- `limitarConcurrencia(n: number): <T>(fn: () => Promise<T>) => Promise<T>`
- `runSection<T>(nombre: string, prompt: string, schema: z.ZodType<T>, models: JsonModel[], opts: { sleep?; budgetMs?: number; now? }): Promise<T>`. It wraps `generateAiOutput`-style retries for an arbitrary schema; refactor `generateAiOutput` to delegate to a schema-generic core.
- `geminiSearchModel(apiKey: string, model?: string): JsonModel`. It calls `generateContent` with `config.tools: [{ googleSearch: {} }]`. It does NOT set `responseMimeType`, because grounding with JSON mode may be unsupported. The prompt asks for JSON in a fenced block, and the existing fence stripping parses it.
- Also export `searchModelsFromEnv(env): JsonModel[]`: the Gemini models with search; empty if there is no key.

**Steps:**

- [ ] **1. Write the failing tests:**
  - the limiter never runs more than `n` tasks concurrently (track the maximum in flight);
  - `runSection` validates with the given schema and retries on invalid JSON;
  - `geminiSearchModel` passes `tools` with googleSearch (mock the SDK client by injecting a fake `generateContent`; refactor it to be injectable if needed);
  - the existing ai tests still pass.
- [ ] **2.** Run `npm test -- llm ai.test`. Expected: FAIL.
- [ ] **3.** Implement.
- [ ] **4.** Run the tests. Expected: PASS.
- [ ] **5. Commit:** "Add schema-generic section runner, concurrency limit and grounded search model".

---

### Task 5: Block 1 — ADN del negocio

**Files:** `lib/engine/v3/sections/adn.ts`. Test: `tests/engine/v3/adn.test.ts`.

**Interfaces:**
- Schema `AdnIA`:
  - `{ queEs: { texto, evidencias: string[] }, propuestaValor: { texto, evidencias }, tipoNegocio: enum (current + "organizacion_social" | "negocio_local"), lineas: { nombre, queOfrece: string[], publico, comoSeContrata, ingresos, evidencias: string[] }[] (1-6), comoFunciona: { texto, evidencias } }`
- `generarAdn(raw, reg: Map<string, Evidence>, deps): Promise<Adn>`. It returns the validated version:
  - each element's `evidencias` resolved to `Evidence[]` via `citar`;
  - elements without valid evidence are dropped;
  - lines without evidence are dropped;
  - if no line survives, it throws `SeccionVaciaError`.
- The prompt includes:
  - the page extracts (id + url + cita), within the delimiter;
  - the published data;
  - the instruction to answer in Spanish, cite extract ids and never invent services.

**Steps:**

- [ ] **1. Write the failing tests** (with a fake JsonModel):
  - valid output → resolved evidences;
  - a line citing only unknown ids is dropped;
  - all lines dropped → `SeccionVaciaError`;
  - the prompt contains the delimiter and the extract ids;
  - the prompt says "Responde en español".
- [ ] **2.** Run `npm test -- adn`. Expected: FAIL.
- [ ] **3.** Implement.
- [ ] **4.** Run the tests. Expected: PASS.
- [ ] **5. Commit:** "Add block 1 (business DNA) section".

---

### Task 6: Block 2 AI part and block 4 review (what it does well + problems per line)

**Files:** `lib/engine/v3/sections/saber.ts`, `lib/engine/v3/sections/revision.ts`. Tests: `saber.test.ts`, `revision.test.ts`.

**Interfaces:**
- `generarNoSabemos(raw, adn, deps): Promise<string[]>`. Returns 3-8 items, adapted to tipo. It always includes "Backlinks y palabras clave (requieren herramientas de pago)".
- `generarRevision(raw, adn, reg, deps): Promise<Revision>` where `Revision` is:
  - `{ bien: { texto, evidencias: Evidence[] }[] (3-5), lineas: { nombre, checks: { propuestaClara, diceAQuien, muestraCasos, facilContacto, orientacionPrecio: "si" | "no" | "no_aplica" }, evidenciasChecks: Evidence[] }[], problemas: { linea, problema, evidencias: Evidence[], mejora }[] }`
- Validation rules:
  - every `bien` item needs ≥ 1 evidence;
  - every problem needs a page extract (`requierePagina`);
  - each line's checks count only if `evidenciasChecks` has ≥ 1 page extract; otherwise all of that line's checks become `"no_aplica"`.

**Steps:**

- [ ] **1. Write the failing tests:**
  - a problem citing only a signal is dropped;
  - a check without page evidence becomes `no_aplica`;
  - `bien` items are capped at 5;
  - the "no se puede saber" list always contains the backlinks item.
- [ ] **2.** Run `npm test -- saber revision`. Expected: FAIL.
- [ ] **3.** Implement.
- [ ] **4.** Run the tests. Expected: PASS.
- [ ] **5. Commit:** "Add block 2 unknowns and block 4 review sections".

---

### Task 7: Competitors with grounded search and homepage verification

**Files:** `lib/engine/v3/sections/competidores.ts`. Test: `tests/engine/v3/competidores.test.ts`.

**Interfaces:**
- `generarCompetidores(raw, adn, deps: { searchModels: JsonModel[]; models: JsonModel[]; getPage: PageGetter; ... }): Promise<Competidor[]>`
- `Competidor = { nombre, web: string | null, ofrece: string, diferencias: string[], verificado: boolean }`
- Flow:
  1. Ask the search model for 3-5 candidates with `{ nombre, web, ofrece, terminos: string[] (3-6 key service terms) }`.
  2. If that fails, ask the plain model (unverified).
  3. For each candidate with a web, fetch the homepage via `getPage` (8 s timeout, all in parallel). It is `verificado` if ≥ 2 of its `terminos` appear in the homepage text, case- and accent-insensitive.
  4. Exclude the analysed domain itself.
  5. `diferencias` only for verified candidates. They are produced by a second, cheap call, or the field stays empty.

**Steps:**

- [ ] **1. Write the failing tests:**
  - search model fails → plain model used, and every result has `verificado: false`;
  - a homepage containing 2 terms → verified;
  - an unreachable homepage → not verified and `diferencias: []`;
  - the analysed domain is excluded;
  - no network (fake getter).
- [ ] **2.** Run `npm test -- competidores`. Expected: FAIL.
- [ ] **3.** Implement.
- [ ] **4.** Run the tests. Expected: PASS.
- [ ] **5. Commit:** "Add verified competitor discovery".

---

### Task 8: DNA Score rules (code), "qué aprender" and closing (score reasons + 3 actions)

**Files:** `lib/engine/v3/score.ts`, `lib/engine/v3/sections/aprender.ts`, `lib/engine/v3/sections/cierre.ts`, `docs/decisiones/0008-dna-score.md`. Tests: `score.test.ts`, `aprender.test.ts`, `cierre.test.ts`.

**Interfaces:**
- `calcularScore(raw, facts, signals, revision, competidores): DnaScore` where `DnaScore` is:
  - `{ criterios: { clave, nombre, valor: number | null, motivos: string[], evidencias: Evidence[] }[]; global: number | null; aviso: "Resume indicadores públicos; no es una valoración financiera." }`
- Rules (documented in 0008; each yields `null` when its inputs are missing):
  - **Claridad.** Share of "si" among the non-`no_aplica` checks of all lines, × 100. Needs ≥ 3 valid checks.
  - **Visibilidad.** From the traffic rank bucket (top 10k → 85, 100k → 65, 1M → 45, fuera → 25), +10 if `blog_activo`, −10 if `pagespeed_movil_bajo`, clamped to 0-100. Null if there is no ranking data.
  - **Monetización.** 30 base; +30 if prices are detected or paginaPrecios=si; +20 if any line's "comoSeContrata" is evidenced; +20 if there are `pagos`-category technologies. Null without a site.
  - **Confianza y madurez.**
    - +25 if `empresa_consolidada`;
    - +25 if testimonials or verified cases;
    - +25 if there are Wikidata data;
    - +25 if corporate email ≠ Ninguno;
    - −25 if `dominio_reciente`.

    Needs ≥ 2 of these inputs.
  - **Presencia digital.** Networks (≥ 3 → +30, 1-2 → +15), blog (si → +20), app (si → +20), recent activity (sitemap lastmod ≤ 90 days → +30). Needs a site.
  - **Novedad.** Needs ≥ 2 verified competitors. Score is 50 + 10 × (count of own "queOfrece" items whose terms appear in no verified competitor homepage), clamped to 100.
  - **Global.** The mean of the non-null values, rounded. Null if fewer than 3.
- `generarAprender(raw, adn, revision, reg, deps): Promise<{ texto, evidencias: Evidence[] }[]>`. Returns 2-4 items, each with ≥ 1 evidence.
- `generarCierre(...)` returns:
  - `{ motivos: Record<clave, string[]>; acciones: { que, porque, evidencias: Evidence[], impacto, esfuerzo, datosQueFaltan: string[] }[] }`
  - exactly 3 actions after validation; each needs ≥ 2 evidences;
  - if fewer than 3 survive, return the survivors. Do not pad.
  - Sort by impacto desc, then esfuerzo asc.

**Steps:**

- [ ] **1. Write the failing tests:**
  - each score rule, including its null case;
  - global null with 2 criteria;
  - the aviso text is exact;
  - an action citing 1 evidence is dropped;
  - the action ordering;
  - no padding below 3.
- [ ] **2.** Run `npm test -- score aprender cierre`. Expected: FAIL.
- [ ] **3.** Implement, and write 0008.
- [ ] **4.** Run the tests. Expected: PASS.
- [ ] **5. Commit:** "Add DNA Score rules, learnings and prioritized actions".

---

### Task 9: v3 report assembly with progressive callbacks

**Files:** `lib/engine/v3/report.ts`. Test: `tests/engine/v3/report.test.ts`.

**Interfaces:**
- `SeccionClave = "datos" | "adn" | "saber" | "competidores" | "revision" | "aprender" | "score" | "cierre"`
- `ReportV3 = { version: 3; dominio; generadoEn; secciones: Partial<Record<SeccionClave, unknown>>; estados: Record<SeccionClave, "pendiente" | "lista" | "error"> }`
- `buildReportV3(raw, deps: { models; searchModels; getPage; now }, onSection: (clave, contenido | null, estado) => Promise<void>): Promise<ReportV3>`
- Phases:
  1. `datos`, from code only: estimates, SEO, published data.
  2. `adn`. On failure it throws, so the worker fails the analysis.
  3. In parallel, under `limitarConcurrencia(3)`: `saber`, `competidores`, `revision`, `aprender`.
  4. `score`, from code using the results.
  5. `cierre`.
- Each non-adn section catches its own error and emits `estado: "error"`.

**Steps:**

- [ ] **1. Write the failing tests** (all with fake models):
  - the order of the `onSection` calls: datos first, adn second, cierre last;
  - a failing `competidores` model → `estados.competidores === "error"`, and the rest are `lista`;
  - a failing adn → rejects;
  - with concurrency capped at 3, never more than 3 calls in flight;
  - `version === 3`.
- [ ] **2.** Run `npm test -- report.test`. Expected: FAIL.
- [ ] **3.** Implement.
- [ ] **4.** Run the tests. Expected: PASS.
- [ ] **5. Commit:** "Assemble v3 report with progressive sections".

---

### Task 10: Persistence, worker and API (needs the user to run 1 SQL)

**Files:** `supabase/migrations/0002_secciones.sql`, `lib/server/analyses/repo.ts`, `supabase-repo.ts`, `tests/server/fake-repo.ts`, `run.ts`, `handlers.ts`, `app/api/analisis/[id]/route.ts`. Tests: the server tests.

**Interfaces:**
- **SQL.**
  - `alter table analyses add column if not exists secciones jsonb not null default '{}'::jsonb, add column if not exists version int not null default 2;`
  - Function `guardar_seccion(p_id uuid, p_clave text, p_contenido jsonb, p_estado text)`. It is service_role only. It merges into `secciones` with `jsonb_set(secciones, array[p_clave], jsonb_build_object('estado', p_estado, 'contenido', p_contenido))` and sets `updated_at`. Allowed for estado in ('procesando', 'listo').
- **`WorkerRepo`** gains:
  - `guardarSeccion(id, clave, contenido, estado)`;
  - `marcarListo(id)`: it sets `estado='listo'` and `version=3` where estado='procesando'.
- **`completar(id, raw, informe)`** keeps working for v3: it stores `datos_brutos` and the final `informe`, and the row is already `listo`. Change its filter to `estado in ('procesando','listo')` for v3 only. Alternatively, add a `guardarDatosBrutos(id, raw)` called before `adn`, so the 24 h cache works even if later sections fail. Choose the latter.
- **`runAnalysis` v3:**
  1. Collect.
  2. Call `guardarDatosBrutos`.
  3. Run `buildReportV3` with an `onSection` that saves each section. After `adn` is `lista`, it calls `marcarListo`.
  4. On an adn failure, it calls `fallar` and `devolverCredito`, as today.
- **Cache:** reuse only if `datos_brutos.version === 3`.
- **`estado` API** also returns `version` and `secciones`.
- **`AnalisisDetalle`** gains `version` and `secciones`.

**Steps:**

- [ ] **1. Write the failing tests** (fake repo + fake engine):
  - the analysis becomes `listo` right after adn;
  - a later section error leaves it `listo`, with that section `error`;
  - an adn failure → `error` and the credit refunded once;
  - a v2 cached raw is ignored (collect runs);
  - the status JSON includes secciones;
  - the static migration test checks `guardar_seccion` and that it is revoked from authenticated.
- [ ] **2.** Run `npm test -- run.test handlers migration`. Expected: FAIL.
- [ ] **3.** Implement. Write the SQL to `0002_secciones.sql`. It must be idempotent.
- [ ] **4.** Run the full `npm test`, tsc, lint and build. Expected: green.
- [ ] **5. User step (the controller guides):** paste `0002_secciones.sql` into the Supabase SQL Editor and Run. Expected: "Success".
- [ ] **6. Commit:** "Persist v3 sections progressively and mark ready after block 1".

---

### Task 11: Minimal progressive analysis page and v2 notice

**Files:** `app/analisis/[id]/page.tsx`, `app/analisis/[id]/progreso.tsx`, `app/analisis/[id]/secciones.tsx` (new client component), `lib/shared/polling.ts` (moved from `lib/server/analyses/polling.ts`, with imports updated). Test: `tests/server/polling.test.ts` (path update), plus `tests/server/secciones-view.test.ts` for a pure helper.

**Interfaces:**
- `ordenSecciones(secciones, estados): { clave, titulo, estado, contenido }[]`. It is pure and gives the display order and Spanish titles:
  - "Datos y estimaciones"
  - "ADN del negocio"
  - "Qué sabemos y qué no"
  - "DNA Score"
  - "Qué hace bien y problemas"
  - "Competidores"
  - "Qué aprender"
  - "Qué haría yo después"

  A section `pendiente` 3 min after `createdAt` becomes `"error"`.
- **The page**:
  - keeps polling while any section is `pendiente`. The analysis may be `listo` while sections are pending; keep polling until none are pending or the cap is reached.
  - renders each section as plain readable HTML: headings, lists, evidence links (url + cita in quotes).
  - shows "Generando…" for pending sections and "No hemos podido generar esta sección" for errors.
  - shows "—" with the reason for "No estimable", and "No puntuable" for null criteria.
  - always shows the DNA Score aviso.
  - for `version 2`, shows `resumen.queHace` plus the text "Informe de una versión anterior".
- Read params inside `<Suspense>` (cacheComponents). No visual design; that is Plan 3.

**Steps:**

- [ ] **1. Write the failing tests:**
  - `ordenSecciones` order and titles;
  - pending past 3 min → error;
  - unknown keys ignored.
- [ ] **2.** Run `npm test -- secciones-view polling`. Expected: FAIL.
- [ ] **3.** Implement.
- [ ] **4.** Run the full `npm test`, tsc, lint and `npx next build`. Expected: green.
- [ ] **5. Commit:** "Show v3 report sections progressively".

---

### Task 12: Decision log and real-site check

**Files:** `docs/decisiones/0009-informe-v3.md`.

- [ ] **1. Write 0009:**
  - why v3;
  - the 4 blocks;
  - the evidence model;
  - the retired 2+2 rule;
  - status and credit rules;
  - the progressive generation.
- [ ] **2. The controller starts the preview.** The user analyses `teb.org` and one SaaS (e.g. `tally.so`) from the dashboard. Check that:
  - the first content appears in ≈ 25 s;
  - the analysis is complete in ≤ 90 s;
  - the report is in Spanish;
  - block 1 separates TEB's lines of activity;
  - problems cite real pages;
  - competitors are marked verified/no verificado;
  - revenue shows "No estimable" for TEB;
  - the DNA Score has its aviso and "No puntuable" where it applies.

  Record the timings and anything false in the report.
- [ ] **3. Commit:** "Document report v3 decisions".
