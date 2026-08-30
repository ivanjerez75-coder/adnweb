# NONNA — MVP Design

**Date:** 2026-08-30
**Status:** Approved design, pending spec review

## 1. Purpose

NONNA is a premium web app that lets an older adult (or a family member acting
for them) design a personalized sneaker for wide feet, swelling, bunions
(juanetes), hammer toes (dedos en martillo), sensitive ankles and other comfort
needs.

The experience must make the user feel the app is **analyzing their foot and
designing a shoe specifically for them** — not filling in a form. The emotional
peak is the transition `TEST → SCAN → CREATION`.

Full flow:

```
HOME → TEST → FOOT PROFILE → 3D SCAN → ANALYSIS/CREATION → RESULT → CUSTOMIZATION → BUY → CHECKOUT → DASHBOARD
```

This is an MVP. No real 3D scanning, no real manufacturing, no real payments, no
medical diagnosis. Everything is a **convincing simulation** behind a swappable
abstraction layer.

## 2. Non-goals (explicitly out of scope)

- Real 3D scanning / camera capture
- Real manufacturing or on-demand production
- Medical diagnosis or clinical advice
- Real payment processing (Stripe etc.)
- Real user authentication / passwords
- Backend / database (state lives in `localStorage`)

The architecture must leave clean seams to add each of these later (§7).

## 3. Tech stack

- Next.js 16.2.11 (App Router) + React 19.2.4 + TypeScript
- Tailwind CSS v4 (`@theme` tokens in `app/globals.css`)
- Geist font (already wired in `app/layout.tsx`)
- **No new runtime dependencies.** All "3D" is animated SVG + CSS transitions.
- Dev-only new dependency: **Vitest** for unit-testing the pure `lib/engine`
  functions.

Framework note: `AGENTS.md` warns Next 16 has breaking changes vs. older
training data. Consult `node_modules/next/dist/docs/` for anything
framework-specific (route handlers, metadata, `params`/`searchParams` as
promises, caching). The app is client-state driven, so exposure is low.

## 4. Design system

Defined once as Tailwind v4 `@theme` tokens in `app/globals.css`:

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#FCFCFA` | page background (blanco roto) |
| `--color-surface` | `#F4F4F1` | cards / raised surfaces (gris claro) |
| `--color-ink` | `#1F2421` | primary text (negro suave) |
| `--color-muted` | `#6B726E` | secondary text |
| `--color-brand` | `#0E4D45` | brand green / teal, primary actions |
| `--color-brand-soft` | `#E6F0EE` | brand tint, selected states |
| `--color-line` | `#E4E4DF` | borders |

Rules:

- Mobile-first. Content column `max-width: 480px`, generously centered; must also
  look right on desktop (centered column on a calm background).
- Base font size 18px, line-height ~1.6, high contrast.
- Buttons min height 56px, large hit targets, visible focus ring
  (`outline` in `--color-brand`).
- One primary action per screen. Plain language. Big headings.
- Micro-animations via CSS only. Respect `@media (prefers-reduced-motion:
  reduce)` — disable transforms/keyframes, keep instant state changes.
- No dark mode for the MVP (remove the starter's dark-mode CSS).

## 5. Routes & screens

All pages are Client Components (`"use client"`) that read/write `SessionContext`.
A shared `<Screen>` layout wrapper provides the centered column, optional
`<BackLink>`, and optional top `<ProgressBar>`.

| Route | Screen | Notes |
|---|---|---|
| `/` | Home | Hero, primary + secondary CTA, `ShoeVisual`, 3-step explainer |
| `/test` | Questionnaire | 8 steps, one question visible at a time, top progress bar, "Pregunta N de 8" |
| `/perfil` | Foot profile | Derived summary + "Escanear mis pies" CTA |
| `/escaneo` | 3D scan sim | Foot silhouette in scan zone, staged status text, ~6s animation, left/right toggle |
| `/creando` | "Estamos creando tu zapatilla" | Premium build screen, `ShoeVisual` assembles, `BuildChecklist` fills, ends with "Ver mi zapatilla" |
| `/resultado` | Result | Large `ShoeVisual`, config `StatCard`s, "¿Por qué hemos elegido esta configuración?" dynamic text |
| `/personalizar` | Customization | Color / closure / insole selectors, live `ShoeVisual` update, config summary |
| `/comprar` | Price & buy | Price from `pricing.ts`, "Fabricada según tu configuración", "Personalizar y comprar" CTA |
| `/checkout` | Simulated checkout | Visual form, **all fields disabled**, notice "pago simulado — no introduzcas datos reales", "Pagar" creates the order → confirmation |
| `/cuenta` | Dashboard | Foot profile (L/R measurements + detected features), shoes (model, config, created date, order status) |
| `/cuenta/entrar` | Fake login | Name + email only (no password); creates `user` in session |

### Flow guards

If a screen's prerequisite is missing (e.g. `/resultado` with no `footProfile`,
`/creando` with no `scan`), redirect to the earliest incomplete step with a
gentle message. Implemented as a small `useRequire(step)` hook.

## 6. Copy (Spanish, verbatim from brief)

- **Home hero:** "Tu pie no debería adaptarse a la zapatilla. La zapatilla
  debería adaptarse a ti."
- **Home subtitle:** "Analizamos tus necesidades y la forma de tus pies para
  crear una zapatilla diseñada pensando en tu comodidad."
- **Home CTAs:** "Crear mi zapatilla" / "¿Cómo funciona?"
- **Home steps:** `01 — Cuéntanos sobre tus pies`, `02 — Escanea tus pies`,
  `03 — Creamos tu zapatilla` (with the brief's sub-lines).
- **Profile intro:** "Tenemos una primera idea de lo que necesitas." + "Ahora
  necesitamos conocer la forma exacta de tus pies."
- **Scan:** "Escanea tu pie" / "Coloca el pie dentro del área marcada y sigue
  las instrucciones." / button "Comenzar escaneo".
- **Scan stages:** Preparando escaneo… → Detectando contorno del pie… →
  Analizando longitud… → Analizando anchura… → Analizando empeine… → Analizando
  zonas de presión… → Escaneo completado.
- **Creation title:** "Estamos creando tu zapatilla" / subtitle "Estamos
  combinando la información de tu test y el escaneo de tus pies."
- **Creation steps:** Analizando la forma de tus pies / Ajustando la anchura /
  Adaptando el espacio para los dedos / Ajustando el volumen del empeine /
  Calculando la estabilidad / Seleccionando la amortiguación / Configurando el
  cierre / Creando tu diseño.
- **Creation end:** "Tu zapatilla está lista." / CTA "Ver mi zapatilla".
- **Result:** "Esta es tu zapatilla" / "Configurada para ti" / section
  "¿Por qué hemos elegido esta configuración?".
- **Buy:** "Tu zapatilla personalizada" / "Fabricada según tu configuración." /
  CTA "Personalizar y comprar".

All user-facing strings centralized in `lib/copy/es.ts` where practical (dynamic
strings built by `lib/engine/copy.ts`).

## 7. Engine abstraction layer (`lib/engine/`)

The seam that lets simulation be swapped for real tech. Every module is pure or
clearly side-effect-scoped, fully typed in `types.ts`, and UI code imports only
these — never inline simulation logic in components.

### `types.ts`

```ts
type FootWidth = 'narrow' | 'normal' | 'wide' | 'extra-wide';
type Level = 'low' | 'medium' | 'high';
type ClosureType = 'velcro' | 'laces' | 'slip-on';
type InsoleType = 'comfort' | 'extra-cushion';
type ShoeColor = 'black' | 'beige' | 'navy' | 'gray';

interface TestAnswers {
  footShape: FootWidth;
  features: Array<'bunion'|'hammer-toes'|'swollen-feet'|'swollen-ankles'|'high-instep'|'none'>;
  discomfort: Array<'toes'|'forefoot'|'heel'|'sides'|'ankle'|'whole-sole'>;
  priority: 'comfort'|'stability'|'cushioning'|'easy-on'|'lightweight';
  usage: 'home'|'walking'|'outings'|'all-day';
}

interface FootProfile {
  width: FootWidth;          // e.g. 'extra-wide'
  toeBox: Level;             // forefoot space
  instep: Level;             // empeine volume
  stability: Level;
  cushioning: Level;
  closure: ClosureType;      // recommended
  flags: TestAnswers['features'];
  rationale: string[];       // seeds for copy.ts
}

interface FootMeasurements {
  lengthMm: number; widthMm: number; instepHeightMm: number;
  heelWidthMm: number; archIndex: number;
  pressureZones: Array<{ zone: string; level: Level }>;
}
interface ScanResult { left: FootMeasurements; right: FootMeasurements; }

interface ShoeConfig { color: ShoeColor; closure: ClosureType; insole: InsoleType; }

interface ShoeSpec {
  // geometry knobs consumed by <ShoeVisual/> (all normalized 0..1 or enum)
  widthScale: number; toeBoxSpace: number; instepVolume: number;
  midsoleThickness: number; heelCounterStiffness: number;
  config: ShoeConfig;
  profile: FootProfile;
}

interface Order {
  id: string; createdAt: string; priceEur: number;
  shoe: ShoeSpec;
  status: 'designing' | 'manufacturing' | 'shipped' | 'delivered';
}
```

### `recommendation.ts` — the recommendation engine

`buildFootProfile(answers: TestAnswers): FootProfile` — pure. Deterministic
rules, e.g.:

- `footShape` maps directly to `width` (wide → wide, extra-wide → extra-wide),
  bumped one step wider if `swollen-feet` present.
- `bunion` or `hammer-toes` or discomfort in `toes`/`forefoot` → `toeBox: high`.
- `high-instep` or `swollen-ankles` → `instep: high`.
- `priority: stability` or `usage: all-day`/`walking` → `stability: high`.
- `priority: cushioning`/`comfort` or discomfort `heel`/`whole-sole` →
  `cushioning: high`.
- `priority: easy-on` or `swollen-ankles`/`swollen-feet` → `closure: velcro`
  (else `laces`). "Cierre recomendado: Fácil apertura" label = velcro.
- `rationale` collects short reason strings for each decision made.

Later swap: ML model / rules service behind the same signature.

### `scan.ts` — scan simulation

`runScan(opts: { onStage: (s: ScanStage) => void, signal?: AbortSignal }):
Promise<ScanResult>`

- Emits the 7 stage strings on a timer (~800ms each, ~6s total).
- Returns realistic measurements; left and right differ slightly (±2–4mm) to
  demonstrate per-foot data.
- Measurements are seeded from the `FootProfile` (extra-wide → larger `widthMm`)
  so scan "agrees" with the test.
- Interface matches what a real scanner SDK callback API would look like.

Later swap: real camera/LiDAR SDK behind the same `onStage` + `Promise` shape.

### `shoeBuilder.ts` — configurator

- `getBuildSteps(): BuildStep[]` — the 8 labeled creation steps with durations
  (~700ms each) for `/creando`.
- `buildShoe(profile: FootProfile, scan: ScanResult, config: ShoeConfig):
  ShoeSpec` — pure. Maps profile levels + measurements to normalized geometry
  knobs for `<ShoeVisual/>`.

Later swap: real 3D configurator / parametric CAD.

### `pricing.ts`

- `config.ts` exports `BASE_PRICE_EUR = 129`.
- `getPrice(shoe: ShoeSpec): number` — base + small deltas
  (`extra-cushion` insole +10, etc.). Returns integer euros for the MVP.

Later swap: pricing service / Stripe.

### `orders.ts` — order lifecycle (localStorage-backed)

- `createOrder(shoe: ShoeSpec, priceEur: number): Order` — status starts
  `designing`.
- `getOrders(): Order[]`, `getOrder(id)`.
- `advanceStatus(id): Order` — steps `designing → manufacturing → shipped →
  delivered` (stops at `delivered`). **Triggered only by a manual "Simular
  avance del pedido" button** in the dashboard (per decision — no timers).

Later swap: backend order API + webhooks.

### `copy.ts` — dynamic explanation

`explainConfig(profile: FootProfile, answers: TestAnswers): string[]` — builds
the "¿Por qué hemos elegido esta configuración?" paragraphs from
`profile.rationale` + answers, in natural Spanish. Example output:

> "Has indicado que tienes los pies anchos y molestias en la zona delantera. Por
> eso hemos aumentado el espacio en la parte delantera y seleccionado una
> estructura más flexible."

## 8. Session state (`lib/session/`)

### `SessionProvider.tsx`

React Context. Shape:

```ts
interface SessionState {
  testAnswers: Partial<TestAnswers>;
  footProfile: FootProfile | null;
  scan: ScanResult | null;
  shoeConfig: ShoeConfig;          // defaults: black / recommended closure / comfort
  shoeSpec: ShoeSpec | null;
  order: Order | null;
  user: { name: string; email: string } | null;
}
```

Actions: `setAnswer`, `commitProfile`, `setScan`, `setShoeConfig`,
`commitShoe`, `placeOrder`, `signIn`, `signOut`, `reset`.

### `storage.ts`

`load(): SessionState | null` / `save(state)` / `clear()` under key
`nonna.session.v1`. Guarded for SSR (`typeof window`), wrapped in try/catch, and
tolerant of a missing/blank/corrupt value. **The single seam to replace with a
real API/DB.**

## 9. Components

```
components/
  ui/
    Screen.tsx        # centered column + optional BackLink + optional ProgressBar slot
    Button.tsx        # variant: primary | secondary | ghost ; size big by default
    OptionCard.tsx    # large selectable card: icon + label, single/multi select
    ProgressBar.tsx   # step N of total
    StatCard.tsx      # label + value, used for profile + result config
    BackLink.tsx
    Notice.tsx        # info banner (used for the checkout disclaimer)
  ShoeVisual.tsx      # SVG sneaker; props: ShoeSpec + buildProgress(0..1); CSS transitions on change
  FootVisual.tsx      # SVG foot silhouette; props: side, flags[], scanning?; markers for bunion/hammer-toes/swelling
  ScanStage.tsx       # scan zone: FootVisual + animated scan line + rotating status label
  BuildChecklist.tsx  # list of steps with ✓ appearing as each completes
```

`ShoeVisual` is the visual centerpiece. It renders layered SVG paths (outsole,
midsole, upper, toe cap, closure area). Props drive:

- `widthScale` → horizontal `scaleX` on the upper/outsole group
- `toeBoxSpace` → toe-cap path morph / translate
- `instepVolume` → upper height near the instep
- `midsoleThickness` → midsole path height
- `config.color` → fill tokens
- `config.closure` → show velcro straps / laces / plain slip-on
- `buildProgress` → progressively reveals layers + opacity/translate for the
  "assembling" effect on `/creando`

All transitions `~450ms ease`, disabled under reduced-motion.

## 10. Testing

Vitest, dev-only, **engine layer only**:

- `recommendation.test.ts` — representative `TestAnswers` → expected
  `FootProfile` fields (wide + forefoot discomfort → `toeBox: high`; `easy-on` →
  velcro; swelling bumps width; etc.)
- `shoeBuilder.test.ts` — `buildShoe` maps `high` levels to larger knobs;
  output knobs stay within `0..1`.
- `pricing.test.ts` — base price; insole upgrade delta.
- `copy.test.ts` — `explainConfig` returns non-empty, mentions the user's stated
  features (string contains expected fragments).

Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

Manual verification: `npm run build` succeeds, then a full click-through of the
flow in `npm run dev` (documented as a checklist in the plan).

## 11. File structure (final)

```
app/
  layout.tsx            # fonts, <SessionProvider>, metadata (title "NONNA")
  globals.css           # @theme tokens, base styles, reduced-motion
  page.tsx              # Home
  test/page.tsx
  perfil/page.tsx
  escaneo/page.tsx
  creando/page.tsx
  resultado/page.tsx
  personalizar/page.tsx
  comprar/page.tsx
  checkout/page.tsx
  cuenta/page.tsx
  cuenta/entrar/page.tsx
components/ui/*          # Screen, Button, OptionCard, ProgressBar, StatCard, BackLink, Notice
components/ShoeVisual.tsx, FootVisual.tsx, ScanStage.tsx, BuildChecklist.tsx
lib/
  engine/ types.ts recommendation.ts scan.ts shoeBuilder.ts pricing.ts orders.ts copy.ts config.ts
  session/ SessionProvider.tsx storage.ts
  questions.ts           # the 8 test questions as data (id, title, kind, options[])
  copy/es.ts             # static Spanish strings
tests/                   # vitest engine tests
vitest.config.ts
```

## 12. Build order (feeds writing-plans)

1. Design tokens + `Screen`/`Button`/`OptionCard`/`ProgressBar`/`StatCard`
   primitives + globals.css cleanup.
2. `lib/engine/types.ts` + `config.ts` + `recommendation.ts` + `pricing.ts` +
   `shoeBuilder.ts` + `copy.ts` + Vitest tests (TDD for the pure functions).
3. `lib/session/` (storage + provider) wired into `app/layout.tsx`.
4. `questions.ts` + `/test` wizard + `/perfil`.
5. `FootVisual` + `scan.ts` + `/escaneo`.
6. `ShoeVisual` + `BuildChecklist` + `/creando` (the wow screen).
7. `/resultado` + `/personalizar`.
8. `pricing` UI: `/comprar` + `/checkout` + `orders.ts` + confirmation.
9. `/cuenta` + `/cuenta/entrar` + manual "simular avance" button.
10. Home page polish, flow guards, reduced-motion pass, `npm run build` +
    click-through.

## 13. Safety notes

- Checkout collects **no** real data: every field disabled, explicit notice.
  "Pagar" only calls `createOrder()`.
- No credential entry anywhere. "Login" is name + email, no password.
- No external network calls. All data stays in `localStorage`.
