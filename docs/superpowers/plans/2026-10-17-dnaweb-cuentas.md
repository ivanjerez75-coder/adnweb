# DNAweb — Plan 2: Cuentas, créditos y análisis en segundo plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can register, log in, paste a URL, wait for the analysis while it runs in the background, see the report, go back to it later in the history, and see their monthly credits. Everything runs on Supabase (free tier) and Next.js 16.

**Architecture:**
- Supabase provides auth (email + password) and Postgres.
- Postgres has two tables, `profiles` and `analyses`, both with RLS. Every write that touches credits goes through `security definer` SQL functions, which keeps it atomic.
- The server-side logic lives in `lib/server/` and depends on an `AnalysisRepo` interface, so it can be tested with an in-memory fake.
- A Next.js Route Handler creates the analysis, answers immediately, and runs the engine (`lib/engine`) inside `after()`. The engine reports progress (`paso_actual`) to the database. The analysis page polls an endpoint until the analysis is finished.
- The pages in this plan are minimal and functional. Plan 3 gives them their final design.

**Tech Stack:** Next.js 16.4 (App Router; `proxy.ts` replaces middleware; `after()` from `next/server`; `maxDuration`), `@supabase/supabase-js`, `@supabase/ssr`, Vitest 5, zod 3.

**Spec:** `docs/superpowers/specs/2026-10-14-dnaweb-mvp-design.md`, sections 2, 4, 5, 8, 9 and 10. It is complemented by `2026-10-15-dnaweb-motor-v2-design.md` for engine errors.

## Global Constraints

- **Cost.** The MVP is 100 % free: Supabase free tier, Vercel Hobby. There are no payments and no plans.
- **Credits.**
  - Every new user starts with 5 credits per month (`creditos_mensuales` default 5). Each analysis costs 1.
  - Credits renew automatically when they are read after `renovacion` has passed: `creditos_restantes = creditos_mensuales`, and `renovacion = now() + 1 month`.
  - Taking the credit and creating the analysis happen in ONE SQL function, atomically.
  - A user can have at most 1 analysis `procesando` at a time, enforced by a partial unique index.
  - If the analysis fails because of us, the credit is refunded exactly once (idempotent).
  - If the URL is invalid or the site doesn't answer, the user is not charged.
- **Statuses:** `procesando` | `listo` | `error`. An analysis still `procesando` after more than 3 minutes is marked `error` and its credit is refunded. This is checked when the data is read.
- **Cache:** if the same `dominio` has an analysis in `listo` from the last 24 h (from any user), reuse its `datos_brutos` and run only `buildReport`.
- **Security.**
  - RLS is enabled on both tables. Users can only SELECT their own rows, and they have no INSERT/UPDATE/DELETE policies.
  - `SUPABASE_SERVICE_ROLE_KEY` is used only on the server, in `lib/supabase/admin.ts`. It must never carry the `NEXT_PUBLIC_` prefix and never be imported from client code.
- **Environment variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus the engine's existing ones.
- **Duration:** the analysis route exports `maxDuration = 300`.
- **User-facing messages, in Spanish** (spec §9):

| Situation | Message |
|---|---|
| Invalid URL | "La URL no es válida." (or the specific `InvalidUrlError` message) |
| Site not reachable | "No hemos podido acceder a esta web." |
| No credits | "No te quedan créditos este mes." |
| Analysis already running | "Ya tienes un análisis en curso." |
| Not enough data | "No hemos podido reunir datos suficientes sobre esta web." |
| AI quota or unavailable | "Alta demanda, inténtalo en unos minutos." |
| AI invalid | "No hemos podido generar el informe. Reinténtalo." |
| Timeout | "El análisis ha tardado demasiado. Te hemos devuelto el crédito." |
| Anything else | "Ha ocurrido un error inesperado. Te hemos devuelto el crédito." |

  Every in-worker error refunds the credit.
- **Next.js 16:**
  - Read `node_modules/next/dist/docs/` before writing Next code. In particular, read `01-app/01-getting-started/16-proxy.md` and `15-route-handlers.md`, and the `after` and `maxDuration` references.
  - `proxy.ts` replaces `middleware.ts`.
- **Code rules:**
  - `lib/engine/` is not modified in this plan, except where a task says so.
  - User-facing text is in Spanish.
  - Tests make no network calls.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Location:** directory `C:\Users\ivanj\OneDrive\Desktop\dnaweb`, branch `feat/cuentas`.

## Review Focus

1. **Two tabs submit at the same time with 1 credit left.** Exactly one analysis is created. The other request gets "Ya tienes un análisis en curso." or "No te quedan créditos este mes.", and the credit total is never negative. Covered by the SQL in Task 2, the fake repo semantics in Task 3, and the test in Task 5.
2. **The worker fails twice, or runs again after it has already refunded.** The credit is refunded only once. Covered in Tasks 3 and 6.
3. **A user opens someone else's analysis id.** They get 404, not the data. Covered in Task 7.
4. **`/login?next=https://evil.com`.** After login the user lands on `/dashboard`, never on an external URL. Covered in Task 8.
5. **The monthly renewal comes due while the user is mid-session.** The next read of the profile shows the credits reset, and `renovacion` moves forward. Covered in Tasks 2 and 10.

## File Structure

```
.env.example                                  add the Supabase variables
supabase/migrations/0001_cuentas.sql          tables, RLS, trigger, functions
lib/supabase/env.ts                           reads and validates the variables
lib/supabase/server.ts                        user client (cookies) for Server Components/Actions/Routes
lib/supabase/admin.ts                         service-role client (server only)
lib/supabase/session.ts                       updateSession() used by proxy.ts
proxy.ts                                      session refresh + protection of private routes
lib/server/analyses/repo.ts                   AnalysisRepo interface and types
lib/server/analyses/supabase-repo.ts          Supabase implementation of the repo
lib/server/analyses/errors.ts                 error → message/refund
lib/server/analyses/start.ts                  startAnalysis()
lib/server/analyses/run.ts                    runAnalysis() (the worker)
lib/server/analyses/handlers.ts               handler factory for the API (testable)
lib/server/auth/redirect.ts                   safeNext(), isProtectedPath()
app/api/analisis/route.ts                     POST: create + after(run)
app/api/analisis/[id]/route.ts                GET: status/report
app/(auth)/actions.ts                         register / log in / log out (Server Actions)
app/(auth)/login/page.tsx, app/(auth)/registro/page.tsx
app/dashboard/page.tsx, app/analisis/[id]/page.tsx, app/analisis/[id]/progreso.tsx
app/historial/page.tsx, app/cuenta/page.tsx
scripts/verify-db.ts                          real check against Supabase
tests/server/fake-repo.ts                     in-memory AnalysisRepo
tests/server/*.test.ts
```

---

### Task 1: Supabase clients, variables and proxy

**Files:**
- Create: `lib/supabase/env.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/session.ts`, `proxy.ts`, `lib/server/auth/redirect.ts`
- Modify: `.env.example`, `package.json`
- Test: `tests/server/env.test.ts`, `tests/server/redirect.test.ts`

**Interfaces:**
- Produces:
  - `supabaseEnv(env?: NodeJS.ProcessEnv): { url: string; anonKey: string }`
  - `serviceRoleKey(env?): string`
  - `createServerSupabase(): Promise<SupabaseClient>` (uses `cookies()` from `next/headers`, with `getAll`/`setAll`)
  - `createAdminSupabase(): SupabaseClient` (service role, `auth: { persistSession: false }`)
  - `updateSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null }>`
  - `isProtectedPath(pathname: string): boolean`
  - `safeNext(next: string | null | undefined): string`

- [ ] **Step 1: Install dependencies.**
  - Run `npm install @supabase/supabase-js @supabase/ssr`.
  - Read the README of `@supabase/ssr` in `node_modules` and follow its Next.js App Router server-client and proxy/middleware pattern, using the `getAll`/`setAll` cookies API.
  - Add to `.env.example` (with comments in Spanish):
    - `NEXT_PUBLIC_SUPABASE_URL=`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
    - `SUPABASE_SERVICE_ROLE_KEY=`, commented "solo servidor, nunca en el navegador".

- [ ] **Step 2: Write the failing tests.**
  - `env.test.ts`:
    - `supabaseEnv({})` throws an Error whose message contains "NEXT_PUBLIC_SUPABASE_URL".
    - With both variables set, it returns `{url, anonKey}`.
    - `serviceRoleKey({})` throws with "SUPABASE_SERVICE_ROLE_KEY".
  - `redirect.test.ts`:
    - `isProtectedPath` returns true for `/dashboard`, `/analisis/abc`, `/historial`, `/cuenta` and `/api/analisis`.
    - It returns false for `/`, `/login`, `/registro` and `/api/health`.
    - `safeNext("/analisis/1")` returns `"/analisis/1"`.
    - `safeNext` returns `"/dashboard"` for each of `"https://evil.com"`, `"//evil.com"`, `"/\\evil.com"`, `null`, `""` and `"javascript:alert(1)"`.

- [ ] **Step 3: Run the tests and confirm they fail.** Command: `npm test -- env redirect`. Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 4: Implement the modules.**
  - `proxy.ts`:
    1. Calls `updateSession`.
    2. If `isProtectedPath(pathname)` and `userId === null`:
       - for `/api/*`, responds `401` with JSON `{ error: "Inicia sesión para continuar." }`;
       - otherwise, redirects to `/login?next=<pathname+search>`.
    3. Otherwise returns `response`.
  - `matcher` excludes `_next/static`, `_next/image`, `favicon.ico` and image files.

- [ ] **Step 5: Run the tests and verify.** Commands: `npm test -- env redirect` → PASS. Then `npx next typegen && npx tsc --noEmit` and `npm run lint` → clean.

- [ ] **Step 6: Commit.** Message: "Add Supabase clients, env validation and session proxy".

---

### Task 2: Database schema, RLS and SQL functions

**Files:**
- Create: `supabase/migrations/0001_cuentas.sql`
- Test: `tests/server/migration.test.ts`. This is a static check of the file contents. The real database check comes in Task 10.

**Interfaces (SQL contract, used by Task 3):**
- `public.profiles(id uuid pk → auth.users on delete cascade, nombre text, created_at timestamptz default now(), creditos_restantes int not null default 5 check (>= 0), creditos_mensuales int not null default 5, renovacion timestamptz not null default now() + interval '1 month')`
- `public.analyses(id uuid pk default gen_random_uuid(), user_id uuid not null → auth.users on delete cascade, url text not null, dominio text not null, created_at timestamptz default now(), updated_at timestamptz default now(), estado text not null default 'procesando' check in ('procesando','listo','error'), paso_actual text, datos_brutos jsonb, informe jsonb, error text, error_kind text, credito_devuelto boolean not null default false)`
- Indexes:
  - `(user_id, created_at desc)`;
  - `(dominio, created_at desc) where estado = 'listo'`;
  - unique `(user_id) where estado = 'procesando'`.
- RLS enabled on both tables:
  - policy `select` on `profiles` using `id = auth.uid()`;
  - policy `select` on `analyses` using `user_id = auth.uid()`;
  - no write policies.
- A trigger `after insert on auth.users` creates the profile, with `nombre` taken from `raw_user_meta_data->>'nombre'`.
- Functions:
  - `public.obtener_perfil() returns public.profiles`
    - `security definer`, `set search_path = public`.
    - Applies the renewal if `renovacion <= now()`, then returns the profile of `auth.uid()`.
  - `public.iniciar_analisis(p_url text, p_dominio text) returns uuid`
    - `security definer`.
    - Applies the renewal and subtracts 1 credit `where id = auth.uid() and creditos_restantes > 0`.
    - If no row was updated: `raise exception 'sin_creditos'`.
    - Inserts the analysis. On `unique_violation`: `raise exception 'analisis_en_curso'`, which also rolls back the credit.
    - Returns the id.
  - `public.devolver_credito(p_id uuid) returns boolean`
    - `security definer`, executable only by `service_role`.
    - `update analyses set credito_devuelto = true where id = p_id and not credito_devuelto` and, only if it changed something, gives back 1 credit to the owner.
    - Returns whether a refund happened.
  - `public.marcar_colgados(p_user uuid) returns int`
    - `service_role` only.
    - Analyses `procesando` older than 3 minutes become `error`, with `error = 'El análisis ha tardado demasiado. Te hemos devuelto el crédito.'` and `error_kind = 'timeout'`, and each gets `devolver_credito`.
    - Returns how many were marked.
- `revoke execute ... from public, anon` on `devolver_credito` and `marcar_colgados`; `grant ... to service_role`. `obtener_perfil` and `iniciar_analisis` are granted to `authenticated`.

- [ ] **Step 1: Write the failing test.** `migration.test.ts` reads the SQL file and asserts that it contains:
  - `enable row level security` twice;
  - `create unique index` with `where estado = 'procesando'`;
  - `security definer` in all 4 functions;
  - `set search_path`;
  - `raise exception 'sin_creditos'` and `'analisis_en_curso'`;
  - `interval '3 minutes'`, `interval '1 month'` and `revoke execute`.

- [ ] **Step 2: Run the test and confirm it fails.** Command: `npm test -- migration`.

- [ ] **Step 3: Write `0001_cuentas.sql`.**
  - It must be idempotent: `create ... if not exists`, `create or replace function`, `drop policy if exists`.
  - It must be valid for Supabase Postgres 15+.

- [ ] **Step 4: Run the test and verify.** Command: `npm test -- migration`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: "Add accounts schema, RLS and atomic credit functions".

---

### Task 3: The `AnalysisRepo` interface, Supabase implementation and in-memory fake

**Files:**
- Create: `lib/server/analyses/repo.ts`, `lib/server/analyses/supabase-repo.ts`, `tests/server/fake-repo.ts`
- Test: `tests/server/supabase-repo.test.ts`, `tests/server/fake-repo.test.ts`

**Interfaces:**
- Produces, in `repo.ts`:

```ts
export type EstadoAnalisis = "procesando" | "listo" | "error";
export interface Perfil { id: string; nombre: string | null; creditosRestantes: number; creditosMensuales: number; renovacion: string }
export interface AnalisisResumen { id: string; url: string; dominio: string; estado: EstadoAnalisis; createdAt: string }
export interface AnalisisDetalle extends AnalisisResumen { pasoActual: string | null; informe: Report | null; error: string | null }
export type InicioResultado = { ok: true; id: string } | { ok: false; motivo: "sin_creditos" | "en_curso" };
export interface UserRepo {            // runs with the user's session (RLS)
  obtenerPerfil(): Promise<Perfil>;
  iniciar(url: string, dominio: string): Promise<InicioResultado>;
  obtener(id: string): Promise<AnalisisDetalle | null>;          // null if missing or not yours
  listar(opts?: { buscar?: string; limite?: number }): Promise<AnalisisResumen[]>;
}
export interface WorkerRepo {          // service role, server only
  paso(id: string, texto: string): Promise<void>;
  completar(id: string, raw: RawData, informe: Report): Promise<void>;
  fallar(id: string, mensaje: string, kind: string): Promise<void>;
  devolverCredito(id: string): Promise<boolean>;
  buscarCache(dominio: string, desde: Date): Promise<RawData | null>;
  marcarColgados(userId: string): Promise<number>;
}
```

- Produces, in `supabase-repo.ts`:
  - `createUserRepo(client: SupabaseClient): UserRepo`
    - Calls the RPCs `obtener_perfil` and `iniciar_analisis`.
    - Maps an error whose message contains `sin_creditos` to `{ok:false, motivo:"sin_creditos"}`, and `analisis_en_curso` to `"en_curso"`. Any other error is rethrown.
    - `obtener` uses `.select().eq("id", id).maybeSingle()`.
    - `listar` orders by `created_at desc`, limit 50 by default, and searches with `ilike` on `dominio`.
  - `createWorkerRepo(admin: SupabaseClient): WorkerRepo`
    - `completar` sets `estado='listo'`, `paso_actual=null`, `updated_at=now`.
    - `fallar` sets `estado='error'`, `paso_actual=null`.
    - `buscarCache` filters `estado='listo'`, `dominio`, `created_at >= desde`, order `desc`, limit 1, and returns `datos_brutos`.
- Produces, in `tests/server/fake-repo.ts`: `createFakeRepos(opts?: { creditos?: number }): { user: UserRepo; worker: WorkerRepo; state: FakeState }`. It mirrors the SQL semantics:
  - `iniciar` with 0 credits → `sin_creditos`;
  - `iniciar` with an analysis already `procesando` → `en_curso`, and the credit is not taken;
  - `devolverCredito` is idempotent;
  - `marcarColgados` uses `state.now()`.

- [ ] **Step 1: Write the failing tests.**
  - `supabase-repo.test.ts` uses a hand-made stub client with `rpc` and a chain `from().select().eq()...`:
    - an `sin_creditos` error → `{ok:false,motivo:"sin_creditos"}`;
    - `analisis_en_curso` → `en_curso`;
    - any other error is rethrown;
    - snake_case rows are mapped to camelCase (`creditos_restantes` → `creditosRestantes`).
  - `fake-repo.test.ts`:
    - two `iniciar` calls in a row → the second returns `en_curso` and the credits went down by only 1;
    - `devolverCredito` twice → `true`, then `false`, with +1 credit in total;
    - `marcarColgados` with `now` + 4 min → 1, the analysis is `error`, and the credit is back.

- [ ] **Step 2: Run the tests and confirm they fail.** Command: `npm test -- supabase-repo fake-repo`.

- [ ] **Step 3: Implement `repo.ts`, `supabase-repo.ts` and `fake-repo.ts`** with the semantics above.

- [ ] **Step 4: Run the tests and verify.** Command: `npm test -- supabase-repo fake-repo` → PASS.

- [ ] **Step 5: Commit.** Message: "Add analysis repository with Supabase implementation and in-memory fake".

---

### Task 4: Error mapping

**Files:**
- Create: `lib/server/analyses/errors.ts`
- Test: `tests/server/errors.test.ts`

**Interfaces:**
- Produces: `describirFallo(error: unknown): { mensaje: string; kind: "datos_insuficientes" | "ia_saturada" | "ia_invalida" | "bloqueada" | "inesperado" }`. This is the worker's message.

- [ ] **Step 1: Write the failing tests.** Each case checks the message from the Global Constraints table:
  - `InsufficientDataError` → `datos_insuficientes`;
  - `AiUnavailableError` with kind `quota` or `unavailable` → `ia_saturada`;
  - `invalid` → `ia_invalida`;
  - `unconfigured` → `inesperado`;
  - `BlockedUrlError` → `bloqueada`, with the message "La URL no es válida.";
  - `new Error("x")` or a string → `inesperado`.

- [ ] **Step 2: Run the tests and confirm they fail.** Command: `npm test -- errors`.

- [ ] **Step 3: Implement `errors.ts`.** Use `instanceof` on the engine classes, imported from `lib/engine/collect`, `lib/engine/ai/providers` and `lib/engine/safe-fetch`.

- [ ] **Step 4: Run the tests and verify.** Command: `npm test -- errors` → PASS.

- [ ] **Step 5: Commit.** Message: "Map engine failures to user-facing messages".

---

### Task 5: `startAnalysis` (validation, reachability check and credit)

**Files:**
- Create: `lib/server/analyses/start.ts`
- Test: `tests/server/start.test.ts`

**Interfaces:**
- Consumes: `UserRepo` (Task 3); `normalizeUrl`, `InvalidUrlError` (`lib/engine/url`); `checkReachable`, `BlockedUrlError`, `PageGetter` (`lib/engine/safe-fetch`).
- Produces:
  - `startAnalysis(input: string, deps: { user: UserRepo; getPage: PageGetter }): Promise<StartResult>`
  - `type StartResult = { ok: true; id: string; normalized: NormalizedUrl } | { ok: false; status: 400 | 402 | 409 | 422; mensaje: string }`

- [ ] **Step 1: Write the failing tests** (fake repo + fake getter):
  - `"localhost"` → 400, with the `InvalidUrlError` message, and no credit is spent;
  - the getter throws → 422 "No hemos podido acceder a esta web.", and the credits are unchanged;
  - a BlockedUrlError → 400 "La URL no es válida.";
  - 0 credits → 402 "No te quedan créditos este mes.";
  - one analysis already in progress → 409 "Ya tienes un análisis en curso.";
  - OK → `{ok:true, id, normalized.domain}`, with credits 5 → 4;
  - Review Focus 1: two calls with `Promise.all` and 1 credit → exactly one `ok`, and the credits never go below 0.

- [ ] **Step 2: Run the tests and confirm they fail.** Command: `npm test -- start`.

- [ ] **Step 3: Implement `startAnalysis`.** The order is: normalize → `checkReachable` (false → 422) → `user.iniciar`.

- [ ] **Step 4: Run the tests and verify.** Command: `npm test -- start` → PASS.

- [ ] **Step 5: Commit.** Message: "Add startAnalysis with free validation and atomic credit".

---

### Task 6: `runAnalysis` (the worker: cache, steps, completion, failure and refund)

**Files:**
- Create: `lib/server/analyses/run.ts`
- Test: `tests/server/run.test.ts`

**Interfaces:**
- Consumes:
  - `WorkerRepo` (Task 3);
  - `describirFallo` (Task 4);
  - `collect`, `CollectDeps` (`lib/engine/collect`);
  - `buildReport` (`lib/engine/report`);
  - `JsonModel` (`lib/engine/ai/providers`).
- Produces: `runAnalysis(id: string, normalized: NormalizedUrl, deps: { worker: WorkerRepo; engine: CollectDeps & { models: JsonModel[] }; now: () => Date }): Promise<void>`. It never throws.

- [ ] **Step 1: Write the failing tests.** They use the fake repo and engine fakes. Reuse `fakeFetcher`, `fakeGetPage`, `NOW` and `validAiOutput` from `tests/engine/`.
  - Happy path: `paso` receives, in order, the engine's steps ("Leyendo la web…", "Analizando tráfico y presencia…", "Detectando señales…", "Generando informe…"). The analysis ends `listo` with `informe.dominio` filled in, and the credit is not refunded.
  - Cache: `buscarCache` returns `datos_brutos` from less than 24 h ago. Then collect is not called (an injected getter that throws if called), only `buildReport` runs, and the analysis ends `listo`. Assert that `buscarCache` received `desde = now - 24h`.
  - Failure: a model that always fails with `AiUnavailableError` quota → `error`, with the message "Alta demanda, inténtalo en unos minutos.", and the credit is refunded.
  - Review Focus 2: run `runAnalysis` twice on the same failed id → 1 refund in total.
  - If `worker.paso` throws, the analysis still finishes. A progress failure doesn't break the analysis; ignore it.

- [ ] **Step 2: Run the tests and confirm they fail.** Command: `npm test -- run.test`.

- [ ] **Step 3: Implement `runAnalysis`.** Wrap everything in try/catch. On error, call `fallar(describirFallo(e))` followed by `devolverCredito`. If `fallar` itself fails, try `devolverCredito` anyway, and log with `console.error` without throwing.

- [ ] **Step 4: Run the tests and verify.** Command: `npm test -- run.test` → PASS.

- [ ] **Step 5: Commit.** Message: "Add background analysis worker with cache, progress and refunds".

---

### Task 7: API (create, poll the status, run in the background)

**Files:**
- Create: `lib/server/analyses/handlers.ts`, `app/api/analisis/route.ts`, `app/api/analisis/[id]/route.ts`
- Test: `tests/server/handlers.test.ts`

**Interfaces:**
- Consumes: `startAnalysis` (T5), `runAnalysis` (T6), repos (T3), `depsFromEnv` (`lib/engine/analyze`), the Supabase clients (T1).
- Produces:
  - `createHandlers(deps: { user: () => Promise<{ userId: string; repo: UserRepo } | null>; worker: WorkerRepo; getPage: PageGetter; engine: …; schedule: (task: () => Promise<void>) => void; now: () => Date })`, which returns `{ crear(req: Request): Promise<Response>; estado(id: string): Promise<Response> }`.
  - `route.ts` wires in real deps: `schedule = after` from `next/server`, `user` from `createServerSupabase().auth.getUser()`, and `worker = createWorkerRepo(createAdminSupabase())`. It exports `maxDuration = 300`.
  - The `[id]/route.ts` GET reads `params` as a Promise (Next 16).
- Responses:
  - `crear`:
    - no session → 401 `{error:"Inicia sesión para continuar."}`;
    - invalid body (not JSON or no string `url`) → 400 `{error:"La URL no es válida."}`;
    - a `startAnalysis` failure → `{status, {error: mensaje}}`;
    - ok → 202 `{id}`, and it calls `schedule(() => runAnalysis(...))`.
  - `estado`:
    - first `worker.marcarColgados(userId)`, then `repo.obtener(id)`;
    - null → 404 `{error:"No encontrado."}`;
    - otherwise 200 `{id, estado, pasoActual, error, informe}`.

- [ ] **Step 1: Write the failing tests** with fake repos and a `schedule` that stores the task:
  - 401 without a session;
  - 400 with `{}`;
  - 202 with `{url:"facturo.example"}` stores 1 task, and running it leaves the analysis `listo`;
  - `estado` for another user's id → 404 (Review Focus 3: the fake `obtener` only returns rows of the session's userId);
  - `estado` for an analysis `procesando` 4 minutes old → `estado:"error"`, its timeout message, and the credit refunded.

- [ ] **Step 2: Run the tests and confirm they fail.** Command: `npm test -- handlers`.

- [ ] **Step 3: Implement `handlers.ts` and both `route.ts` files.** Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` first.

- [ ] **Step 4: Run the tests and verify.** Commands: `npm test -- handlers` → PASS. Then `npx next typegen && npx tsc --noEmit` and lint → clean.

- [ ] **Step 5: Commit.** Message: "Add analysis API: create with background run, and status polling".

---

### Task 8: Sign-up, log-in and log-out

**Files:**
- Create: `app/(auth)/actions.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/registro/page.tsx`
- Test: `tests/server/auth-actions.test.ts`. It covers the validation helpers exported from `actions.ts` or from a separate `lib/server/auth/validate.ts`, since Server Actions with Supabase are checked manually in Task 10.

**Interfaces:**
- Produces:
  - Server Actions `registrar(prev, formData)`, `iniciarSesion(prev, formData)` and `cerrarSesion()`. They follow the pattern in `01-app/01-getting-started/07-mutating-data.md`, with `useActionState` on the pages.
  - `validarCredenciales(email: string, password: string): string | null`. It returns an error message in Spanish, or null.
  - `registrar` uses `supabase.auth.signUp({ email, password, options: { data: { nombre } } })`. On success it redirects to `safeNext(next)`. If Supabase requires email confirmation, it shows "Revisa tu email para confirmar la cuenta."
  - `iniciarSesion` uses `signInWithPassword`. On error it shows "Email o contraseña incorrectos." On success it redirects to `safeNext(next)`.
  - The `next` field travels hidden in the form. If the landing page sent `?url=`, the destination is `/dashboard?url=<url>`, and the dashboard pre-fills the field.

- [ ] **Step 1: Write the failing tests** for `validarCredenciales`:
  - a bad email → "Introduce un email válido.";
  - a password under 8 characters → "La contraseña debe tener al menos 8 caracteres.";
  - valid input → null.

  For Review Focus 4, `safeNext` is already covered in T1. Add a test that the action uses it, through a pure helper `destinoTrasLogin(next, url)`:
  - `destinoTrasLogin("https://evil.com", null)` → "/dashboard";
  - `destinoTrasLogin(null, "notion.so")` → "/dashboard?url=notion.so".

- [ ] **Step 2: Run the tests and confirm they fail.** Command: `npm test -- auth-actions`.

- [ ] **Step 3: Implement the actions and the minimal pages.** The pages are plain forms with Spanish labels: email, password, name (registration only), and links between login and registration. Use no extra styling; Plan 3 handles design.

- [ ] **Step 4: Run the tests and verify.** Commands: `npm test -- auth-actions` → PASS. Then tsc and lint → clean.

- [ ] **Step 5: Commit.** Message: "Add email/password sign-up, log-in and log-out".

---

### Task 9: Minimal functional pages

**Files:**
- Create: `app/dashboard/page.tsx`, `app/dashboard/nuevo-analisis.tsx` (client), `app/analisis/[id]/page.tsx`, `app/analisis/[id]/progreso.tsx` (client), `app/historial/page.tsx`, `app/cuenta/page.tsx`, `lib/server/analyses/polling.ts`
- Modify: `app/page.tsx` (the minimal landing)
- Test: `tests/server/polling.test.ts`

**Interfaces:**
- Produces: `siguienteSondeo(intento: number): number | null`. This is the ms until the next poll: 2000 ms for the first 30 attempts, then 5000 ms. After 120 attempts it returns null and the UI shows "Esto está tardando más de lo normal; recarga la página."
- Pages:
  - **Landing (`/`):** title "DNAweb", a URL field, and a submit that leads to `/registro?url=…`. If a session exists, it leads to `/dashboard?url=…`.
  - **`/dashboard`:**
    - shows "Créditos: X de Y · se renuevan el <fecha>" (from `obtenerPerfil`);
    - has a "Pega una URL" form (client) that POSTs `/api/analisis`, then on 202 runs `router.push('/analisis/'+id)`, and otherwise shows `error`;
    - lists the last 5 analyses, with links.
  - **`/analisis/[id]`:**
    - while `procesando`, shows `pasoActual`;
    - when `listo`, shows the domain, `resumen.queHace`, `veredicto.puntuacion` and the full report as readable `<pre>` JSON (Plan 3 designs it);
    - when `error`, shows `error` plus a link "Probar otra URL";
    - a missing or foreign id → `notFound()`.
  - **`/historial`:** the list with a `?buscar=` field.
  - **`/cuenta`:** credits, renewal date, and a "Cerrar sesión" button.

- [ ] **Step 1: Write the failing test** for `siguienteSondeo`:
  - `0` → 2000;
  - `29` → 2000;
  - `30` → 5000;
  - `119` → 5000;
  - `120` → null.

- [ ] **Step 2: Run the test and confirm it fails.** Command: `npm test -- polling`.

- [ ] **Step 3: Implement `polling.ts` and the pages.** Server Components read through `createUserRepo(await createServerSupabase())`. Read `01-app/01-getting-started/05-server-and-client-components.md` first.

- [ ] **Step 4: Run the tests and verify.** Commands: `npm test` (everything) → PASS. Then tsc, lint and `npx next build` → build OK.

- [ ] **Step 5: Commit.** Message: "Add minimal dashboard, analysis progress, history and account pages".

---

### Task 10: Real check against Supabase (needs the user)

**Prerequisite (the user does this; the controller guides them step by step):**
1. Create a free project at supabase.com.
2. Copy the Project URL, the `anon` key and the `service_role` key into `.env.local` with Notepad. They must not be pasted into the chat.
3. Open the SQL Editor, paste the contents of `supabase/migrations/0001_cuentas.sql`, and press Run.
4. Under Auth → Providers → Email, turn off "Confirm email" for the MVP. This is a choice the user confirms.

**Files:**
- Create: `scripts/verify-db.ts`, plus `package.json` script `"verify-db": "tsx --env-file-if-exists=.env.local scripts/verify-db.ts"`

**Interfaces:** `scripts/verify-db.ts`:
1. Uses the admin client to create 2 test users with the emails `dnaweb-test-<timestamp>-a@example.com` and `-b@`, each with a random password generated at runtime and never printed.
2. Logs in as each one with the anon client.
3. Checks against the real database:
   - (a) The profile was created with 5 credits.
   - (b) `iniciar_analisis` twice in parallel gives exactly 1 ok and 1 `analisis_en_curso`, and 4 credits remain.
   - (c) User B cannot read A's analysis (`obtener` → null) and cannot call `devolver_credito` (error).
   - (d) The admin client calls `devolver_credito` twice, giving `true` then `false` and 5 credits.
   - (e) Set `renovacion` in the past with admin, then call `obtener_perfil`: the credits reset, and `renovacion` is now in the future (Review Focus 5).
   - (f) Set `created_at` 4 minutes in the past on an analysis that is `procesando`, then call `marcar_colgados`: it becomes `error`, and its credit is refunded.
4. At the end, deletes both test users with admin (cascade). It prints only ✓/✗ per check.

- [ ] **Step 1: Write `verify-db.ts`.**

- [ ] **Step 2: Run the check.** Once the user confirms the prerequisites, run `npm run verify-db`. Expected: 6 ✓ and exit 0. If something fails, fix the SQL in `0001_cuentas.sql`, give the user the SQL again (only the changed `create or replace` statements), and repeat.

- [ ] **Step 3: Manual end-to-end check with the preview.**
  - Start the dev server with `preview_start`, after creating `.claude/launch.json` with `npm run dev` on port 3000.
  - Walk through: landing → registration (the USER fills in the registration form themselves in the preview; the controller never types passwords) → dashboard → analyze `tally.so` → watch the progress → report → history → account (4 credits) → log out.
  - Take a screenshot of the finished report.

- [ ] **Step 4: Commit.** Message: "Add real database verification script".
