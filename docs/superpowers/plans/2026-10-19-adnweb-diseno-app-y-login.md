# ADNweb — Plan A: diseño de la aplicación y login sin contraseña

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the whole app the ADNweb visual identity from the user's designs:
- a landing page;
- login and registration with an email code plus Google, on a dark card;
- an app shell with a sidebar (Nuevo análisis + Recientes) and a central "¿Qué web quieres analizar hoy?" page;
- account settings and history restyled.

All UI strings go through a Spanish dictionary, ready for more languages. The report page itself is redesigned in Plan B.

**Architecture:**
- **Styling.** Tailwind 4 (already installed), with design tokens set in `app/globals.css` via `@theme`, and fonts via `next/font/google`: Barlow Condensed 800, Barlow 400/500/600, and Source Serif 4 italic.
- **Strings.** A tiny i18n layer, `lib/i18n/` with `es.ts` and `t(clave)`. It is server- and client-safe and has no library.
- **Auth.** Supabase `signInWithOtp` + `verifyOtp` (email code) and `signInWithOAuth` (Google), plus an `/auth/callback` route that exchanges the code. Password login is removed.

**Tech Stack:** Next.js 16.4 (cacheComponents, proxy.ts), React 19.3, Tailwind 4, @supabase/ssr.

**Spec:** `docs/superpowers/specs/2026-10-19-adnweb-analisis-v4-y-diseno.md`, §2 and §7 (design and login).

## Global Constraints

- Read `AGENTS.md` and the relevant guides in `node_modules/next/dist/docs/` before writing page code.
  - `params` and `searchParams` are Promises and must be read inside `<Suspense>`.
  - Server Actions use `useActionState`.
  - `proxy.ts`'s matcher must stay a plain string literal.
- **Brand:** "ADNweb". Never "Foundry". The wordmark is `ADN` in grafito plus `WEB` in teal.
- **Colours:** grafito `#393939`, teal `#0F766E`, fondo `#F5F5F5`, superficie `#FFFFFF` / `#F3F3F3`, borde `#DADADA`. Red and amber appear only for real problems. Login card: `#393939` with teal accents (the user's design).
- **Type:**
  - display: Barlow Condensed 800, uppercase, line-height ≈ 0.95;
  - body: Barlow;
  - literal quotes: Source Serif 4 italic.
  - **Exception:** only display headings are uppercase. Body copy and labels use sentence case.
- **Text:**
  - All user-facing text is Spanish and comes from `lib/i18n/es.ts`. No hard-coded strings in components, except brand and example domains.
  - The landing headline is exactly "DESCUBRE CUÁNTO FACTURA" / "CUALQUIER WEB".
  - The subtitle is "ANTES DE LANZAR TU WEB, ANALIZA LAS QUE YA GANAN DINERO".
- **Example chips:** Canva, Notion, Stripe, Shopify, ChatGPT. They fill the input with `canva.com`, `notion.so`, `stripe.com`, `shopify.com` and `chatgpt.com`.
- **Quality floor:**
  - responsive down to 360 px;
  - visible keyboard focus;
  - reduced motion respected;
  - one subtle glow animation on the URL pill only.
- **No regressions:** existing server logic (credits, analyses, API, proxy access rules) keeps working, and all existing tests pass.
- **Rules:**
  - Never stage `.superpowers/`, `.env.local` or `public/maqueta-informe.html`. Delete that file in Task 1.
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Email code typed wrong, or expired.** A clear Spanish error, the user stays on step 2, and they can resend.
2. **Google sign-in cancelled, or the callback hit without a `code`.** Redirect to `/login?error=…` with a readable message, never a 500.
3. **The landing URL is submitted while logged out.** After login, the user lands on the panel with the URL prefilled. This must survive both the email-code path and the Google redirect, and keep the existing `destinoTrasLogin` safety (no open redirect).
4. **Mobile 360 px.** The sidebar collapses into a menu, and the hero headline doesn't overflow.
5. **An existing password user.** They can sign in by email code with the same email: the same Supabase user, no duplicate profile.

---

### Task 1: Design tokens, fonts, i18n dictionary and shared UI pieces

**Files:**
- `app/globals.css`, `app/layout.tsx`
- `lib/i18n/es.ts`, `lib/i18n/index.ts` (new)
- `components/ui/{Marca.tsx, BuscadorUrl.tsx, Boton.tsx, Etiqueta.tsx}` (new)
- Delete `public/maqueta-informe.html`.
- Test: `tests/i18n/i18n.test.ts`.

**Interfaces:**
- `es`: a nested `as const` object of Spanish strings.
- `type Clave` = the dotted paths of `es`.
- `t(clave: Clave, vars?: Record<string, string | number>): string` replaces `{var}` placeholders.
- `IDIOMA_POR_DEFECTO = "es"` and `IDIOMAS = ["es"] as const`.
- The `<html lang>` comes from `IDIOMA_POR_DEFECTO`. Layout metadata: title "ADNweb", description from the dictionary.
- Components:
  - `<Marca />`;
  - `<Boton variante="principal" | "secundario">`;
  - `<Etiqueta tono="observado" | "externa" | "inferencia" | "hipotesis" | "neutro" | "problema">`;
  - `<BuscadorUrl accion={serverAction} valorInicial? placeholder ejemplos? />`. It holds the globe icon, the input, the circular teal submit button with an arrow, and the chips below. Chips set the input value; they don't auto-submit. It reuses the existing `crear` flow through a server action passed in.
- **Tailwind `@theme` tokens:** `--color-grafito`, `--color-teal`, `--color-fondo`, `--color-superficie`, `--color-superficie-2`, `--color-borde`, `--color-ambar`, `--color-rojo`, `--font-display`, `--font-sans`, `--font-cita`. Remove the create-next-app dark-mode defaults.

**Steps:**
- [ ] 1. Write the failing tests: `t("landing.titular1")` returns "DESCUBRE CUÁNTO FACTURA"; placeholders are replaced; an unknown key is a type error (use `// @ts-expect-error` in the test).
- [ ] 2. `npm test -- i18n` → FAIL.
- [ ] 3. Implement.
- [ ] 4. Run `npm test`, `npx next typegen && npx tsc --noEmit` and `npm run lint` → green.
- [ ] 5. Commit: "Add ADNweb design tokens, fonts, Spanish dictionary and shared UI pieces".

### Task 2: Landing page

**Files:** `app/page.tsx` (rewrite) and `app/landing-actions.ts` (keep its behaviour), plus `public/landing/` for one image you create (an SVG illustration in the brand colours) or a free-licence image with its licence noted in the commit message. Tests: the existing landing-action tests keep passing.

**Sections**, with the exact copy taken from the dictionary, matching the user's captures:
1. **Hero:**
   - wordmark;
   - the subtitle, with "LANZAR" and "ANALIZA" in teal (that is the user's design);
   - the two-line headline, the second line in teal;
   - `BuscadorUrl` with a soft glow;
   - the chips;
   - the explanatory paragraph: "Descubre cómo crecen otros negocios digitales. Estima sus ingresos, analiza su modelo de negocio y encuentra oportunidades para diferenciarte antes de lanzar o escalar tu proyecto." Reword "Estima sus ingresos" to "Entiende cómo ganan dinero", keeping the rest, because spec v3.1 forbids promising estimates.
2. **"DESCUBRE OPORTUNIDADES"** (second word in teal): the paragraph plus the image.
3. **"Cómo funciona":** three short steps, which genuinely are a sequence: pegas una URL, leemos la web y las fuentes públicas, recibes el informe con pruebas.
4. **Closing:**
   - "TODO GRAN NEGOCIO EMPEZÓ CON UNA INVESTIGACIÓN." ("INVESTIGACIÓN" in teal);
   - the "COMIENZA A ANALIZAR" button, which scrolls to the hero input;
   - a footer with the ADNweb wordmark, © 2026 ADNweb, and Privacidad / Condiciones / Contacto. Contacto is a `mailto:` placeholder from the dictionary; Privacidad and Condiciones are simple placeholder pages (`app/privacidad/page.tsx` and `app/condiciones/page.tsx`) saying "Página en preparación".
- **Logged-out submit:** keeps the current `landing-actions` flow (redirect to login with the URL preserved). A logged-in visitor goes straight to the panel with the URL.

**Steps:**
- [ ] 1. Implement.
- [ ] 2. Run `npm test`, tsc, lint and `npx next build` → green. If `.next` is locked (EPERM), report it; do not kill processes.
- [ ] 3. Commit: "Build the ADNweb landing page".

### Task 3: Passwordless login (email code + Google)

**Files:**
- `app/(auth)/actions.ts`: replace `registrar` and `iniciarSesion` with `enviarCodigo`, `verificarCodigo` and `entrarConGoogle`.
- `app/(auth)/auth-form.tsx`: rewrite as the two-step dark card.
- `app/(auth)/login/page.tsx`. Make `app/(auth)/registro/page.tsx` redirect to `/login`, keeping `next` and `url`. The same flow creates the account.
- `app/auth/callback/route.ts` (new).
- `lib/server/auth/validate.ts`: add `validarEmail` and `validarCodigo`.
- `lib/server/auth/access.ts`: `/auth/callback` is public.
- `docs/configuracion/login.md` (new, in Spanish): the steps the user must follow in Supabase and Google, written for a non-technical person.
- Tests: `tests/server/auth-validate.test.ts`, `tests/server/access.test.ts` and `tests/server/callback.test.ts`, using a pure helper for the callback decision.

**Interfaces:**
- `enviarCodigo(prev, formData)`. It validates the email, then calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`. It returns `{ paso: "codigo", email }` or `{ error }`. Errors are mapped to Spanish: rate limit → "Has pedido demasiados códigos. Espera unos minutos."
- `verificarCodigo(prev, formData)`. It validates a 6-digit code, then calls `supabase.auth.verifyOtp({ email, token, type: "email" })`. On success it does `redirect(destinoTrasLogin(next, url))`. On error it shows "El código no es correcto o ha caducado." and stays on step 2.
- `entrarConGoogle(formData)`. It calls `signInWithOAuth({ provider: "google", options: { redirectTo: <origin>/auth/callback?next=<safe next> } })`, then redirects to `data.url`. The origin comes from the request headers (host and proto), never from user input.
- `decidirCallback({ code?, error?, next? })`. It is pure and returns `{ tipo: "intercambiar", code, destino } | { tipo: "error", destino: "/login?error=…" }`. The callback route calls `exchangeCodeForSession(code)`.
- **The card:**
  - the heading "ADNweb: analiza cualquier web.";
  - a teal subheading;
  - the email field, then "Continuar";
  - the code field, then "Continuar";
  - a link "Reenviar código" and a link "Usar otro email";
  - a divider "o continúa con", then the Google button;
  - the legal line with links to Condiciones and Privacidad.
- **Signed-out user:** the `nombre` field in the profile is not required any more.

**Steps:**
- [ ] 1. Write the failing tests:
  - `validarCodigo("123456")` → ok, while "12345" and "abcdef" → an error;
  - `decidirCallback` with a code and `next=/dashboard?url=x` → intercambiar and that destino;
  - with `next=https://evil.com` → destino `/dashboard`;
  - without a code, or with an error → `/login?error=…`;
  - access: `/auth/callback` passes without a session.
- [ ] 2. Run them → FAIL.
- [ ] 3. Implement. Write `docs/configuracion/login.md` covering:
  - Supabase → Authentication → Email: OTP is enabled by default. Edit the "Magic Link" email template so it shows `{{ .Token }}`, and give the exact template text in Spanish.
  - Authentication → URL configuration: Site URL `http://localhost:3100` for now, plus the redirect URL `http://localhost:3100/auth/callback`.
  - Google: Google Cloud Console → create an OAuth client (Web), the authorised redirect URI `https://<ref>.supabase.co/auth/v1/callback`, then paste the client ID and secret into Supabase → Authentication → Providers → Google.
  - Note: the default email sender is limited to a few emails per hour, so a custom SMTP is needed before launch.
- [ ] 4. Run `npm test`, tsc, lint and build → green.
- [ ] 5. Commit: "Replace password login with email code and Google".

### Task 4: App shell, panel and restyled account and history pages

**Files:**
- `app/(app)/layout.tsx` (new route group holding the shell). Move `dashboard`, `historial`, `cuenta` and `analisis` under `app/(app)/` without changing their URLs.
- `components/shell/{BarraLateral.tsx, MenuMovil.tsx}`.
- `app/(app)/dashboard/page.tsx`.
- `app/(app)/historial/page.tsx`.
- `app/(app)/cuenta/page.tsx` ("Ajustes": email, credits, renewal, log out).
- Test: `tests/shared/recientes.test.ts`, for a pure helper.

**Shell** (user's capture 4):
- **Sidebar, 260 px, on fondo:**
  - the wordmark;
  - a search icon that filters the recents list client-side;
  - a collapse button that shrinks the sidebar to icons and remembers the choice in `localStorage` (wrapped in try/catch);
  - "Nuevo análisis" with a pencil-square icon;
  - a "Recientes" title, then the last 20 analyses (domain plus a small estado dot), with the current one highlighted;
  - at the bottom, the credits "4 de 5 análisis este mes" and a link to Ajustes.
- **Mobile:** a top bar with the wordmark and a menu button that opens the sidebar as a drawer.
- **Main area:** the content panel, white with rounded corners, on the fondo.

**Panel `/dashboard`:**
- the display heading "¿QUÉ WEB QUIERES ANALIZAR HOY?", with "ANALIZAR" in teal (the user's design);
- `BuscadorUrl` with the chips, prefilled from `?url=`;
- the error states from the existing `nuevo-analisis` flow (no credits, analysis in progress, invalid URL), shown under the input in Spanish.

**Helper:** `agruparRecientes(lista, ahora)` → `{ hoy, ultimos7, anteriores }` for the sidebar sections "Hoy", "Últimos 7 días" and "Anteriores".

**Data:** recents come from the existing `repo.listar({ limite: 20 })`, read on the server in the layout, inside `<Suspense>` with a skeleton.

**Steps:**
- [ ] 1. Write the failing test for `agruparRecientes` (boundaries at midnight local time and at 7 days).
- [ ] 2. Implement.
- [ ] 3. Run `npm test`, tsc, lint and build → green.
- [ ] 4. Commit: "Add the ADNweb app shell, panel, history and settings".

### Task 5: Visual check (controller + user)

- [ ] 1. The controller starts the preview and checks, at desktop width and at 375 px:
  - the landing;
  - `/login`, steps 1 and 2 (no real email is sent until the user configures Supabase);
  - the panel and the shell, which need the user to log in.

  Take screenshots and fix visual issues.
- [ ] 2. The controller guides the user through `docs/configuracion/login.md`, Supabase template, URLs and Google. The user then logs in with an email code and with Google.
- [ ] 3. Commit any fixes.
