# ADNweb — Plan B: informe v4 (7 secciones) y página del análisis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the v3.1 report into the user's 7-section analysis:

1. Resumen ejecutivo
2. Anatomía del negocio
3. Rendimiento y presencia digital
4. Competencia y posicionamiento
5. Diagnóstico estratégico
6. Oportunidades
7. Plan de acción

The report must also have four data classes, criteria adapted to the business type, an analysis-coverage record, and a redesigned report page with section navigation, "Ver prueba", filters and mobile layout.

**Architecture:**
- Evolve `lib/engine/v3/` in place into **report version 4**. Keep the evidence registry, `citar`, the metrics, the filter, the score and the llm runner.
- New or changed section modules each produce one stored section.
- The worker and persistence are unchanged, except that the section keys are new and `version: 4`.
- v3 rows render a short "Informe de una versión anterior. Vuelve a analizar para ver el nuevo informe." notice.

**Tech Stack:** TypeScript, zod, Vitest, @google/genai, Next.js 16.4, Tailwind 4 (Plan A tokens and components).

**Spec:** `docs/superpowers/specs/2026-10-19-adnweb-analisis-v4-y-diseno.md`, §3, §4 and §6. The rules in `2026-10-18-dnaweb-informe-v3-1-datos-fiables.md` still bind.

**Branch:** `feat/diseno-app`, which contains Plan A. Continue on it.

## Global Constraints

### Data honesty (the v3.1 rules, all still in force)
- Visits are always "No hay datos fiables disponibles". Revenue is shown only when published, plus the labelled hypothetical scenario. Valuation is "No estimable".
- Every AI claim cites evidence ids that are validated by `citar`.
- The figure/promise filter (`filtro.ts`) applies to all AI free text. Literal citations are never filtered.
- No conversion, churn, sales or customer-count claims without data.

### Data classes
- The `Metrica.tipo` field and the claim class use exactly `"observado" | "fuente_externa" | "inferencia" | "hipotesis"`.
- **Code rules** (`claseDeAfirmacion`):
  - At least one `pagina` evidence and the AI says it is stated on the site → `observado`.
  - Only `dato:*` evidence from external sources (Tranco, Radar, Wikidata, CrUX) → `fuente_externa`.
  - Otherwise → `inferencia`.
  - Risks, alternative segments and opportunities → always `hipotesis`.
- **Metrics:**
  - PageSpeed, own-site data, prices and legal data → `observado`;
  - Tranco, Radar, Wikidata and CrUX → `fuente_externa`;
  - the scenario → `hipotesis`.

### Type-adapted criteria
- The business typology (multiple allowed) is decided first, in anatomía.
- "Precios publicados" doesn't apply to: servicio_profesional, organizacion_social, negocio_local, web_informativa, or any line contracted "por presupuesto".
- Indicators that don't apply are `aplica: false`. They are never scored 0.

### Section keys (v4)
- `datos` (code: metrics, prices, scenario)
- `anatomia`
- `rendimiento` (code + AI interpretation)
- `competencia`
- `diagnostico`
- `oportunidades`
- `plan`
- `resumen` (assembled last, mostly by code)
- `cobertura` (code)

`version: 4`.

### Other constraints
- **Speed:**
  - `datos` is emitted first;
  - `anatomia` second (it is the fatal section: if it fails → error + refund);
  - then `rendimiento`, `competencia` and `diagnostico` in parallel under the shared limiter (3);
  - then `oportunidades`, then `plan`;
  - then `resumen` and `cobertura`.

  Targets: anatomía ≤ 40 s, complete ≤ 120 s.
- **AI calls:**
  - anatomía 1;
  - competencia: search 1 + fichas 1 + comparison 1;
  - diagnóstico 1;
  - rendimiento interpretation 1;
  - oportunidades 1;
  - plan 1;
  - saber, inside diagnóstico or rendimiento: 0 extra.

  That is about 8 in total. `aprender` and `cierre` are removed; their content now lives in oportunidades and plan.
- **Unchanged:**
  - website and AI-derived text goes inside the escaped delimiter;
  - Spanish text from `lib/i18n/es.ts` in the UI;
  - no network in tests;
  - `lib/engine/` does not import react or next;
  - never stage `.superpowers/` or `.env.local`;
  - commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A one-page site** (a local shop with only a home page). Anatomía still works. Competencia may be thin. Cobertura shows what's missing. Nothing is padded.
2. **A multi-type business** (SaaS + marketplace). Both typologies are shown with their certainty, and the type-adapted criteria use the union of both.
3. **The competitor pricing page isn't found or is in another language.** The precio is "Desconocido", never guessed.
4. **The AI returns an opportunity whose `origen` id is unknown.** It is dropped, because opportunities must link to a real finding.
5. **An old v3 analysis opened in the new page.** The notice is shown and the page doesn't crash.

---

### Task 1: Data classes, type-adapted applicability and coverage record

**Files:**
- `lib/engine/v3/clases.ts` (new)
- `lib/engine/v3/estimates.ts` (`tipo` values)
- `lib/engine/v3/score.ts` (applicability by typologies)
- `lib/engine/v3/cobertura.ts` (new)
- Tests in `tests/engine/v3/`

**Interfaces:**
- `ClaseDato = "observado" | "fuente_externa" | "inferencia" | "hipotesis"`.
- `claseDeAfirmacion(evidencias: Evidence[], opts?: { declaradoEnWeb?: boolean; siempreHipotesis?: boolean }): ClaseDato`
- `Tipologia = "saas" | "ecommerce" | "marketplace" | "servicio_profesional" | "contenido" | "freemium" | "app" | "organizacion_social" | "negocio_local" | "web_informativa"`
- `aplicaPrecios(tipologias: Tipologia[], lineas?: { comoSeContrata: string }[]): boolean`. It returns false if every typology is one of servicio_profesional, organizacion_social, negocio_local or web_informativa, or if every line is contracted by "presupuesto". Otherwise true.
- `calcularScore` now takes `tipologias: Tipologia[]` instead of reading `adn.tipoNegocio`. Its indicators use `aplicaPrecios` for "Precios publicados" and "Página de precios". The existing rules for free-plan and online-payment indicators are mapped to the new typology names.
- **Cobertura:**
  - `ComponenteCobertura = "identidad" | "modelo" | "auditoria" | "rendimiento" | "competencia" | "diagnostico" | "oportunidades" | "plan"`
  - `EstadoComponente = { estado: "valido" | "parcial" | "fallido"; motivo: string }`
  - `evaluarCobertura(input: { raw, secciones: Partial<Record<SeccionClaveV4, unknown>>; estados }): Record<ComponenteCobertura, EstadoComponente>`
  - Rules follow spec §6. For example:
    - **auditoria** is valid if PageSpeed has scores and ≥ 3 pages were read; partial if only one of those holds; otherwise fallido.
    - **competencia** is valid with ≥ 2 verified competitors, partial with 1, fallido with 0.

**Steps:**
- [ ] 1. Write the failing tests:
  - `claseDeAfirmacion`: a page extract with `declaradoEnWeb` → observado; only `dato:tranco` → fuente_externa; signals only → inferencia; `siempreHipotesis` → hipotesis;
  - `aplicaPrecios` for organizacion_social → false, saas → true, and [saas, servicio_profesional] → true;
  - score with `tipologias` [servicio_profesional] → "Precios publicados" has `aplica: false`;
  - the cobertura cases.
- [ ] 2. Run `npm test -- clases cobertura score estimates`. Expected: FAIL.
- [ ] 3. Implement. Migrate the `Metrica.tipo` values (`estimado` → the appropriate new class) and update the affected tests.
- [ ] 4. Run the full `npm test`, tsc and lint. Expected: green.
- [ ] 5. Commit: "Add the four data classes, type-adapted applicability and coverage record".

### Task 2: Anatomía del negocio (replaces adn)

**Files:** `lib/engine/v3/sections/anatomia.ts` (new; `adn.ts` is deleted once nothing imports it). Test: `tests/engine/v3/anatomia.test.ts`.

**Interfaces:** `generarAnatomia(raw, reg, deps: SectionDeps): Promise<Anatomia>`, where `Anatomia` is:

```ts
{
  nombre: string;
  fraseResumen: { texto; evidencias };   // ≤ 45 words: what it offers, to whom, how it seems to earn money; filtered
  identidad: {
    producto, problema, paraQuien, beneficio, argumento, diferenciacion:
      { declara: { texto; evidencias } | null; interpretamos: { texto; evidencias; clase: ClaseDato } | null }
  };
  tipologias: { tipo: Tipologia; certeza: "alta" | "media" | "baja"; explicacion: string; evidencias }[];   // 1-3
  lineas: { nombre; queOfrece: string[]; publico; comoSeContrata; evidencias }[];                          // 1-6
  monetizacion: { fuente: string; nivel: "confirmado" | "inferido" | "desconocido"; evidencias; precios?: string[] }[];
  cliente: {
    explicito: { texto; evidencias } | null;
    necesidades: string[];
    sectores: string[];
    mensaje: { texto; evidencias } | null;
    segmentosAlternativos: { texto; clase: "hipotesis" }[];
  };
  canales: AdnCanal[];          // keep the v3.1 contact fallback
  afirmaciones: AdnBloque[];    // "La empresa afirma…"
  modeloEstado: ModeloEstado;   // keep the v3.1 code downgrade
}
```

**Code rules:**
- `monetizacion.nivel` is `"confirmado"` only if its evidencias include a page extract and either a published price or a contracting channel. The AI's "confirmado" is downgraded to "inferido" otherwise.
- The `identidad.*.declara` blocks need a page extract (`requierePagina`).
- `interpretamos` gets `clase` from `claseDeAfirmacion` and can never be `observado`.
- `tipologias` without evidence are dropped. If none remain → `"web_informativa"` with certeza baja.
- If no line survives → `SeccionVaciaError`. This section is fatal.
- Every AI free-text field passes through `limpiarAfirmacionesNoRespaldadas`. Use `descriptivo` where prices are legitimate.

**Steps:**
- [ ] 1. Write the failing tests:
  - monetización "confirmado" without page evidence → "inferido";
  - a declara block with only signal evidence → null;
  - interpretamos is never observado;
  - a typology without evidence is dropped and the fallback applies;
  - `fraseResumen` is filtered;
  - the prompt contains the delimiter and "Responde en español".
- [ ] 2. Run `npm test -- anatomia`. Expected: FAIL.
- [ ] 3. Implement. Reuse the adn parsing, channel fallback and claims code, moving it rather than duplicating it.
- [ ] 4. Run the full `npm test`, tsc and lint. Expected: green.
- [ ] 5. Commit: "Replace the ADN block with the business anatomy section".

### Task 3: Competencia y posicionamiento

**Files:** `lib/engine/v3/sections/competencia.ts` (evolves `competidores.ts`) and `lib/engine/sources/pages.ts` (reuse `extractPassages`). Test: `tests/engine/v3/competencia.test.ts`.

**Interfaces:** `generarCompetencia(raw, anatomia, reg, deps: CompetenciaDeps): Promise<{ competencia: Competencia; regCompetidores: Map<string, Evidence> }>`, where `Competencia` is:

```ts
{
  competidores: {
    id: "c1";
    nombre; web; tipo: "directo" | "indirecto" | "emergente"; motivo: string;
    verificado: boolean; comprobadoEn: string;
    ficha: {
      publico; problema; propuesta; funcionalidades: string[];
      precios: { texto: string; evidencia: Evidence }[] | "desconocido";
      fortalezas: { texto; evidencias }[]; debilidades: { texto; evidencias }[];
    } | null;   // null if not verified
  }[];
  matriz: {
    dimensiones: ("cliente" | "propuesta" | "precio" | "funcionalidades" | "diferenciacion" | "oportunidad")[];
    filas: { quien: "analizada" | string /* competitor id */; valores: Record<dimension, string> }[];
  };
  ganaPierde: { dimension; destaca: "analizada" | string | "empate" | "sin_datos"; evidencia: Evidence[]; porQueImporta; aprender; diferenciarse }[];
}
```

**Flow:**
1. Get candidates exactly as in v3.1: search model, plain-model fallback, the `tipo` and `motivo`. Exclude the own domain.
2. For each candidate with a web, fetch the homepage. Then try one pricing page, chosen from the homepage links matching pricing/precios/planes/tarifas/preus, or `/pricing`. Use the safe `getPage`, 8 s each, all in parallel.
3. Turn both pages into extracts with ids `c<n>-e<k>`, using `extractPassages`. Register them as `Evidence` with `tipo: "pagina"` and `fuente` set to the competitor URL, in `regCompetidores`.
4. Verification uses the v3.1 whole-word rule.
5. One AI call builds the fichas for verified competitors, citing their `c*` extracts. A price must cite a `c*` extract from the pricing page, otherwise it is `"desconocido"`.
6. One AI call builds the matriz and `ganaPierde`, citing ids from both registries. Values with no evidence become "Sin datos".

**Steps:**
- [ ] 1. Write the failing tests:
  - pricing page discovery from the homepage links;
  - a price without a `c*` evidence → "desconocido";
  - an unverified competitor → `ficha: null`;
  - `ganaPierde` with an unknown evidence → `destaca: "sin_datos"`;
  - the competitor extract ids don't collide with the site's `p*` ids;
  - all fetches go through the fake getter.
- [ ] 2. Run `npm test -- competencia`. Expected: FAIL.
- [ ] 3. Implement.
- [ ] 4. Run the full `npm test`, tsc and lint. Expected: green.
- [ ] 5. Commit: "Build competitor sheets, comparison matrix and where-it-wins analysis".

### Task 4: Rendimiento y presencia digital + Diagnóstico estratégico

**Files:**
- `lib/engine/v3/sections/rendimiento.ts` (new)
- `lib/engine/v3/sections/diagnostico.ts` (evolves `revision.ts` and `saber.ts`)
- Tests: `rendimiento.test.ts` and `diagnostico.test.ts`

**Interfaces:**
- `generarRendimiento(raw, metricas, anatomia, score, deps): Promise<Rendimiento>`, where `Rendimiento` is:
  - `{ dimensiones: { clave: "trafico" | "seo" | "tecnico" | "experiencia" | "adquisicion"; metricas: string[] /* Metrica.clave */; interpretacion: string; fricciones?: …; canales?: … }[]; score: DnaScore; noSePuedeSaber: string[] }`
  - The interpretation is built **in code** from rules per metric. For example: "La web tarda en móvil más que la media (64/100): conviene revisarlo, no indica cuántas ventas pierde." One optional AI call may polish the 5 interpretations, filtered. Without AI, the code text is used.
  - `experiencia` lists the potential frictions checked by code and AI (from diagnóstico). `adquisicion` lists the observable channels: social networks, blog, newsletter, ads tech.
  - `noSePuedeSaber` replaces the old `saber` items. It is generated inside the rendimiento AI call, or by code from the typology, plus the backlinks item.
- `generarDiagnostico(raw, anatomia, competencia, regTotal, deps): Promise<Diagnostico>`, where `Diagnostico` is:

  ```ts
  {
    fortalezas: { id: "f1"; texto; frenteA: string; paraQuien: string; evidencias; clase }[];
    debilidades: { id: "d1"; texto; porQueImporta; evidencias; clase }[];
    riesgos: { id: "r1"; texto; evidencias; clase: "hipotesis" }[];
    fricciones: { id: "x1"; tipo: "que_compra" | "para_quien" | "precio" | "pasos" | "objeciones" | "confianza"; texto; evidencias; potencial: true }[];
    integrado: { texto: string };   // filtered
  }
  ```

  - A debilidad needs a page extract.
  - A fortaleza needs `frenteA` (an alternative, possibly a competitor id) and ≥ 1 evidence.
  - The ids are stable so opportunities can link to them.
  - A fricción about price does not apply when `aplicaPrecios` is false.

**Steps:**
- [ ] 1. Write the failing tests:
  - the code interpretations never include "ventas", "clientes perdidos" or figures beyond the metric's own value;
  - a fricción "precio" for organizacion_social is dropped;
  - a debilidad with only signal evidence is dropped;
  - riesgos are always hipotesis;
  - the ids are sequential;
  - `integrado` is filtered.
- [ ] 2. Run `npm test -- rendimiento diagnostico`. Expected: FAIL.
- [ ] 3. Implement.
- [ ] 4. Run the full `npm test`, tsc and lint. Expected: green.
- [ ] 5. Commit: "Add performance interpretation and the strategic diagnosis".

### Task 5: Oportunidades and Plan de acción

**Files:**
- `lib/engine/v3/sections/oportunidades.ts` (replaces `cierre.ts` and `aprender.ts`)
- `lib/engine/v3/sections/plan.ts`
- Tests for both.

**Interfaces:**
- `generarOportunidades(raw, anatomia, diagnostico, competencia, regTotal, deps): Promise<Oportunidad[]>`, where `Oportunidad` is:

  ```ts
  {
    id: "o1";
    tipologia: "mejorar" | "diferenciarse" | "complementario" | "nuevo_mercado";
    titulo;
    origen: string[];   // ids of diagnostico items (f*/d*/r*/x*) or ganaPierde dimensions ("gp:precio"). At least 1 must resolve, else dropped.
    ficha: { evidencia: { texto; evidencias }; problema; solucion; porQuePodria; faltaComprobar: string[] };
    estado: "detectada" | "por_validar";
    criterios: { impacto; evidencia; viabilidad; diferenciacion; facilidadValidacion: "alto" | "medio" | "bajo" };
    prioridad: "alta" | "media" | "baja";   // code: alto=3/medio=2/bajo=1; score = impacto + evidencia + viabilidad + diferenciacion + facilidadValidacion; ≥ 12 alta, ≥ 9 media, else baja
    clase: "hipotesis";
  }
  ```

  - 3 to 6 opportunities, sorted by prioridad, then score.
  - `ficha.evidencia` needs ≥ 1 evidence.
  - All free text is filtered.
- `generarPlan(oportunidades, diagnostico, deps): Promise<Plan>`, where `Plan` is:
  - `{ comprobar: Accion[]; experimentar: Accion[]; medir: Accion[] }`
  - `Accion = { id; origen: string /* o*|d*|x* id */; tarea; porQue; recursos: string[]; indicador; criterio: { continuar; modificar; descartar } }`
  - The AI writes the actions. The code drops any action whose `origen` is unknown, and caps each group at 3.
  - No dates, budgets or revenue figures: the filter applies, plus a code check that drops actions containing currency or date patterns.

**Steps:**
- [ ] 1. Write the failing tests:
  - an opportunity with an unknown origen is dropped;
  - the prioridad math (3+3+3+2+2 = 13 → alta);
  - an action with "en 2 semanas" or "500 €" is dropped;
  - the group cap;
  - the sort order.
- [ ] 2. Run `npm test -- oportunidades plan`. Expected: FAIL.
- [ ] 3. Implement. Delete `cierre.ts`, `aprender.ts`, `revision.ts`, `saber.ts`, `adn.ts` and `competidores.ts` once nothing imports them. Move their reusable helpers rather than duplicating them.
- [ ] 4. Run the full `npm test`, tsc and lint. Expected: green.
- [ ] 5. Commit: "Add typed opportunity sheets and the action plan".

### Task 6: Report v4 assembly, executive summary and worker

**Files:**
- `lib/engine/v3/report.ts` (v4 orchestration)
- `lib/engine/v3/sections/resumen.ts` (new)
- `lib/server/analyses/run.ts` (`version: 4`; cache requires `raw.version === 3` + `legal`, unchanged)
- `scripts/probar-informe.ts`
- Tests: `report.test.ts` and `resumen.test.ts`

**Interfaces:**
- `SeccionClaveV4` = the 9 keys in Global Constraints. `SeccionClave` is renamed to it, and the view's type follows.
- `construirResumen(anatomia, diagnostico, oportunidades, metricas, cobertura): Resumen`. It is **code only**:

  ```ts
  {
    nombre; dominio; fecha; categoria: Tipologia[];
    frase: anatomia.fraseResumen;
    modelo: { tipologias; estado: ModeloEstado };
    indicadores: Metrica[];   // only estado "disponible", max 4, chosen by priority list
    hallazgos: [up to 3 items picked from diagnostico by rule: first debilidad, first fortaleza, first riesgo or fricción];
    destacado: { fortaleza?; debilidad? };
    oportunidad: Oportunidad | null;   // top priority
    cobertura;
  }
  ```

- **Phases** (Global Constraints): `onSection` emits each key. `anatomia` is fatal and marks the row listo after it, exactly like v3 `adn`. Everything else is isolated.
- `run.ts` marks `version: 4`. The `marcarListo` call is triggered by `anatomia`.

**Steps:**
- [ ] 1. Write the failing tests:
  - the emit order (datos, anatomia, …, resumen and cobertura last);
  - an anatomia failure rejects;
  - a competencia failure → competencia error, while resumen still builds and cobertura shows competencia fallido;
  - `construirResumen` picks the hallazgos by rule and the indicadores only when disponible;
  - `version === 4`.
- [ ] 2. Run `npm test -- report resumen run`. Expected: FAIL.
- [ ] 3. Implement.
- [ ] 4. Run the full `npm test`, tsc, lint and build. Expected: green.
- [ ] 5. Commit: "Assemble report v4 with executive summary and coverage".

### Task 7: The analysis page (7 sections)

**Files:**
- `app/(app)/analisis/[id]/{page.tsx, informe.tsx (new client), secciones/*.tsx (one component per section)}`
- `lib/shared/secciones-view.ts`
- `lib/i18n/es.ts`
- Tests: `tests/shared/secciones-view.test.ts`, plus pure view-model helpers.

**Layout:** this follows the maqueta 2 style and the user's 7-section spec.
- **Header:** display-font nombre, dominio link, fecha, the estado ("Análisis completo" / "Generando…" / "Completado parcialmente"), and the "Volver a analizar" button.
- **Navigation:**
  - On desktop, a sticky secondary nav on the right lists the 7 sections, each with its estado dot.
  - On mobile, a horizontal scrollable tab bar at the top.
- **Sections in order 01-07,** each a white panel with a display-font title:
  - 01 shows the "en 30 segundos" phrase, the modelo and the indicadores row, the 3 hallazgos, the destacados, the top opportunity and the cobertura list (✓ válido / ◐ parcial / ✕ fallido, with the motivo).
  - 02-07 render their data.
- **"Ver prueba".** Every claim with evidence gets this disclosure, showing the literal citation in serif italic with its source link. Competitor citations link to the competitor page.
- **Class badges** use `Etiqueta`: Observado, Fuente externa, Inferencia, Hipótesis.
- **Competitor matrix:** a table on desktop, stacked cards on mobile.
- **Opportunity cards** show the 5-point ficha, the estado, the prioridad and the 5 criterios. "Ver origen" scrolls to and highlights the linked diagnosis item.
- **Plan:** three columns (Comprobar, Experimentar, Medir) on desktop, stacked on mobile.
- **Filters,** at the top of sections 05-06: chips for Fortalezas, Debilidades, Riesgos, Fricciones, Oportunidades, Técnico and Comercial. They filter client-side; the state lives in the URL hash.
- **Progressive:** pending sections show a skeleton with "Generando…". Failed sections show "No hemos podido generar esta sección". Keep the per-section ErrorBoundary and the polling.
- **v3 or older rows:** show the notice plus a "Volver a analizar" button.

**Steps:**
- [ ] 1. Write the failing tests for the pure helpers:
  - `ordenSeccionesV4`;
  - `filtrarHallazgos(diagnostico, oportunidades, filtro)`;
  - `etiquetaClase`;
  - `resolverOrigen(id, diagnostico, competencia)`, which returns an anchor id.
- [ ] 2. Implement.
- [ ] 3. Run the full `npm test`, tsc, lint and `npx next build`. Expected: green.
- [ ] 4. Commit: "Redesign the analysis page as the 7-section report".

### Task 8: Real-site check (controller)

- [ ] 1. Run `scripts/probar-informe.ts` on teb.org, tally.so and one e-commerce (for example `www.hawkersco.com`). Check:
  - the 5 questions are answered;
  - no invented figures;
  - opportunities link to real findings;
  - the competitor prices are real or "desconocido";
  - the times.
- [ ] 2. The user logs in and views one report in Chrome. Fix what is wrong.
- [ ] 3. Update `docs/decisiones/0009-informe-v3.md`, or add `0010-informe-v4.md`.
- [ ] 4. Commit.
