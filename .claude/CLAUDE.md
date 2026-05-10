# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

- `npm start` — dev server on http://localhost:4200 (no proxy; calls `environment.apiBase` directly).
- `npm run build` — production build into `dist/`. Initial-bundle budget set to `1MB` warning / `1.5MB` error in `angular.json` (current size ~930 kB given Angular 21 + PrimeNG 21 + Tailwind 4 + Transloco footprint).
- `npm run watch` — incremental dev build.
- `npm test` — Vitest via `@angular/build:unit-test`. Filter a single spec: `npm test -- --include "src/app/core/auth/auth.service.spec.ts"` (the bare path is interpreted as a project name by `ng test` and fails).
- `npm run api:gen` — regenerates the typed client in `src/app/api/` from `openapi/Training_Manager_API.yaml` (config in `openapitools.json`).

Backend runs separately at `http://localhost:8000` (set in `src/environments/environment.ts`). Spec is still in flux — re-fetch + regen after backend changes.

## Stack

- Angular 21.2 (TypeScript 5.9 strict)
- PrimeNG 21 (Aura preset, dark mode via `.dark-mode` on `<html>`)
- Tailwind 4 (`@tailwindcss/postcss`)
- Transloco 8 (5 langs: fr default, nl/en/it/es)
- Vitest 4
- openapi-generator-cli 2.31 (typescript-angular generator, `stringEnums=true`)

## Architecture

All providers live in `src/app/app.config.ts`; routes in `src/app/app.routes.ts`. Standalone components only — don't set `standalone: true` (default since v20).

### Layout shells (3, nested routes)

- **PublicLayoutComponent** — public-facing pages, no auth required:
  `/`, `/home`, `/features`, `/contribute`, `/login`, `/register`,
  `/check-your-email`, `/auth/confirm-email/:key`, `/auth/forgot-password`,
  `/auth/forgot-password/sent`, `/auth/reset-password/:key`,
  `/invitation/:token`. Hosts the public marketing nav + UserMenu when
  authenticated.
- **MainLayoutComponent** — authenticated app shell (`canActivate: [authGuard]`):
  `/dashboard`, `/profile`, `/events`, `/programs`, `/teams`,
  `/teams/discover`, `/team-join-requests/magic-action/:token`.
- **AdminLayoutComponent** — nested inside MainLayout under `/admin` with
  `[authGuard, staffGuard]`; taxonomy CRUD (sports, energy-systems, energy-segments, modalities).

### Per-feature convention

`src/app/features/{feature}/` with the trio `{feature}-list`, `{feature}-form`, `{feature}-detail`. Some features add `-discover`, `magic-action`, dialogs (e.g. `generate-events-dialog`, `regenerate-training-dialog`, `round-form-dialog`, `exercise-form-dialog`), or in-tab managers (e.g. `attendance-manager` embedded inside the events-detail attendance tab — there is no standalone attendance route). All routes are lazy-loaded via `loadComponent` / `loadChildren`.

### Shared UI (`src/app/shared/ui/`)

- **TopmenuComponent** (`src/app/core/layout/topmenu/`) — sticky top bar (`position: sticky` on `:host`), `mode = input<'public'|'authenticated'>()`, embeds `app-language-switcher` + `app-user-menu`. Hamburger drawer ≤ 960 px via CSS media query (NOT Tailwind `md:`). Owns `mobileMenuOpen` signal; closes on `NavigationEnd`, click-outside, Escape. `aria-controls` linkage + focus trap + focus restoration in the drawer.
- **FooterComponent** (`src/app/core/layout/footer/`) — single-line ~35 px footer used only by `PublicLayoutComponent`. Renders `app.title · app.tagline · Version X.Y.Z · author · ©year`.
- **DetailHeaderComponent** — single-line toolbar header
  `[← back] [icon + eyebrow + title + suffix + badges centered] [icon-only actions]`
  with 5 ng-content slots: `banner / titleSuffix / badges / actions / meta`
  + an optional `subtitle` slot for short descriptive text below the title.
  Sticky condensed bar at scroll, driven by an IntersectionObserver on a
  zero-height sentinel div. Used on teams/programs/events detail.
- **EmptyStateComponent** — icon-pill + title + subtitle + ng-content
  CTAs. 4 tones (indigo/emerald/rose/gray). Used on every list +
  dashboard empty section.
- **UserMenuComponent** — auth-aware menu (avatar + lang switcher +
  logout) reused in both PublicLayout and MainLayout headers.

### Auth flow

`AuthService` (`src/app/core/auth/auth.service.ts`) holds the current `Me` as a signal. JWT pair lives in `TokenStorage`. Surfaces:

- `login(username, password, remember = false)` — `remember` toggles 30d refresh TTL (default 7d).
- `register(payload)` + `confirmEmail(key)` + `resendEmail(email)`.
- `requestPasswordReset({email, turnstile_token})` + `confirmPasswordReset(key, newPassword)` (auto-login on success via `loginWithTokens`).
- `bootstrap()` runs from `provideAppInitializer`: refresh + fetch `/me/` before the router activates so guards see the right state on first navigation.
- `refreshMe()` — fire-and-forget /me/ resync after team-quota-affecting mutations.

`authInterceptor`:

1. Skips non-API URLs and `AUTH_PATHS` (token, refresh, register, email confirm/resend, password reset/confirm).
2. Attaches `Authorization: Bearer <access>` on every other API call.
3. On 401 → `AuthService.refresh()` then retry; on refresh failure → `logout()` (clears tokens, navigates to `/login`).

`authGuard` redirects unauthenticated users to `/login?returnUrl=<state.url>`. `LoginComponent` reads `returnUrl` post-success.

### Generated API client (`src/app/api/`)

**Do NOT hand-edit.** Fully overwritten by `npm run api:gen`. Wired via `provideApi(environment.apiBase)` in `app.config.ts`. Import:

```ts
import { EventsService } from '../../api/api/events.service';
import { Event } from '../../api/model/event';
```

#### Codegen gotchas

- Untyped backend responses → `Observable<any>`. Either ask backend to
  add `@extend_schema(responses=…)` (preferred) or declare a local
  interface + `as unknown as Observable<…>` cast as a temporary bridge.
  See historical TokenPair / password-reset cleanups.
- Positional params on list endpoints shift alphabetically when the
  backend adds a new query filter. Treat the order as backend-driven —
  re-check after each `api:gen`.
- Enums are string-valued (`stringEnums=true`): match exact strings.

### i18n

Transloco, `LanguageService` is the single source of truth. `switchLanguage(code)` applies optimistically, persists via `PATCH /me/`, rolls back on failure. An `effect` watches `AuthService.currentUser()` and applies `me.language` at bootstrap/login. `LanguageService` is force-instantiated in `provideAppInitializer` so this effect is wired before `bootstrap()` resolves.

Catalogs in `public/i18n/*.json`. Namespace by `feature.section.key`. New keys ALWAYS go to all 5 languages (CI doesn't enforce — discipline).

**Marketing pages exception**: `/contribute` and `/about` use **TS-factorized i18n** (`contribute-page.text.ts`, `about-page.text.ts`) with `SECTION_DEFS` + per-language `XX_CONTENT` const + `getXxxUiText(lang)` getter that falls back to EN. The component does `protected readonly ui = computed(() => getXxxUiText(this.languageService.activeLang()))`. Use this pattern for complex multi-section "marketing" pages (sections + items); use Transloco JSON elsewhere.

## Code conventions

### TypeScript

- Strict mode is on (`strict`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `strictTemplates`).
- Prefer type inference. Avoid `any`; use `unknown` when uncertain.

### Angular

- Standalone only.
- Signals: `signal` / `computed` / `set`/`update` — never `mutate`.
- `inject()` — no constructor injection.
- `input()` / `output()` functions — no decorators.
- `ChangeDetectionStrategy.OnPush` on every component.
- No `@HostBinding` / `@HostListener` — use the `host` object.
- Reactive forms over template-driven.
- `NgOptimizedImage` for static assets (not for inline base64).
- External templates/styles paths relative to the component TS file.

### Templates

- Native control flow (`@if` / `@for` / `@switch`) — no `*ngIf` / `*ngFor` / `*ngSwitch`.
- `class` / `style` bindings — no `ngClass` / `ngStyle`.
- `async` pipe for observables.
- Don't assume globals (`new Date()`) in templates — precompute in the component.

### UI

- PrimeNG for forms/dialogs/toasts; Tailwind for layout/spacing/typography.
- `MessageService` provided globally; `ConfirmationService` per-component (PrimeNG dialog scope).
- DetailHeader on every detail page; EmptyState on every list/dashboard empty section (consistency).

### Shared patterns

- `shared/contact.ts` — anti-spam contact util. Email split into `EMAIL_USER`/`EMAIL_HOST`/`EMAIL_TLD`; `emailDisplay()` returns `user [at] host [dot] tld` (never `@` in DOM); `openContactEmail(subject)` reconstructs `mailto:` at click via `URLSearchParams`; `phoneDisplay()` for phone. Consumed by `/about` Company tab.
- `shared/repo.ts` — `FRONTEND_REPO_URL`, `BACKEND_REPO_URL`, `SPONSORS_URL` constants. Use these everywhere instead of inline literals.
- `shared/app-version.ts` — `APP_VERSION` derived from `package.json` at build time (`resolveJsonModule + esModuleInterop` in `tsconfig.json`). Bumping `package.json` propagates automatically.
- `parseRetryAfterSeconds(headers)` (`features/auth/shared/`) — RFC 7231 parser used by login / register / forgot-password countdowns.
- `applyServerError` + `FieldErrors {[k]: string[]}` — every form maps DRF validation errors with this idiom. Recognised top-level codes (e.g. `team_quota_exceeded`, `pending_request_exists`) get dedicated branches; everything else falls through to `fields` flattening.
- `history.state` for ephemeral PII between routes (e.g. email after register/forgot) — avoids leaking via querystring/referrer.
- `queryParams` for bookmarkable filters (e.g. `/events/new?program=42`).

### Accessibility

- Must pass AXE; meet WCAG AA (focus management, contrast ≥ 4.5:1, ARIA labels on icon-only buttons).

### Formatting

Prettier: 100-col, single quotes, Angular parser for `*.html`. 2-space indent (`.editorconfig`).

## Tests (Vitest)

- Most specs use `overrideComponent({ set: { template: '', imports: [] } })` to bypass PrimeNG rendering and test logic only via a `ProtectedFields` helper interface that exposes signal getters / methods.
- ngOnInit fires API calls — set mocks BEFORE `fixture.detectChanges()`. The common pattern is a `setup({ ...overrides })` helper that recreates the TestBed per test for isolation.
- AuthService mocks need `refreshMe: vi.fn()` (used after team mutations).
- `Me` fixtures must include `team_quota: { used, max, can_create }` (required field in the codegen).
- **`vi.fn()` with setter usage** (e.g. `Object.defineProperty(window, 'location', {value: { set href(v){ spy(v) } }})`) needs an explicit generic under TS strict: `vi.fn<(v: string) => void>()`. Bare `vi.fn()` resolves to `Mock<Procedure|Constructable>` and TS rejects the call site.
- **Router stub**: use `provideRouter([])` AND patch `events` via `Object.defineProperty(router, 'events', { value: subject.asObservable() })`. Fully replacing the `Router` token (`{ provide: Router, useValue: ... }`) breaks `RouterLink`/`RouterLinkActive` directives at DI resolution.
- **`vi.mock` / `vi.spyOn` are blocked** for relative-import ESM bindings under the Angular unit-test runner. Stub `window.location` (with try/finally restore) to observe `mailto:` side effects instead.
- **PrimeNG `<p-tabs>` under jsdom** requires a `ResizeObserver` polyfill at the top of the spec file. Copy the pattern from `about-page.component.spec.ts:9-17`.

## Gotchas

- **Turnstile (Cloudflare)**: the `<script>` is in `index.html`, but Cloudflare's auto-render only scans the DOM on script load. For lazy SPA routes the `<div>` arrives later, so render explicitly via `window.turnstile.render(container, {sitekey})` with a retry loop (20 × 500ms) until the script is ready. Pattern shared by `RegisterComponent` and `ForgotPasswordComponent`.
- **NG8107**: `?.` on non-nullable codegen types — drop the `?.` when the field is required by the schema.
- **Windows LF→CRLF** git warnings on every commit are noise, not errors.
- **Reset password URL**: `/auth/reset-password/:key` (no trailing slash). `:key` is `uid-token` with a dash — treat as opaque.
- **Magic-link URL**: `/team-join-requests/magic-action/:token` (frontend route) ≠ `/api/v1/join-magic/:token/` (API endpoint). Don't conflate.
- **Codegen positional params**: `npm run api:gen` produces method signatures with positional query-param args (`eventsList(color, date, dateGte, ...)`). Adding a new query filter on the backend reorders these alphabetically and silently breaks every existing caller. Mitigation : use named-args mode (`useSingleRequestParameter=true`) when migrating, or audit every call site after each `api:gen`.
- **Accept-Language**: `languageInterceptor` (`src/app/core/i18n/`) attaches `Accept-Language: <activeLang>` on every API call so the backend can localize translatable model fields (modality.name, status.label, etc.).
- **Hamburger breakpoint = 960 px** (not Tailwind's `md:` 768 px) — convention from QuizOnline-style layout. Use CSS `@media (max-width: 960px)`, not Tailwind utilities, for the topmenu hamburger toggle.
- **Dark-mode parity**: PrimeNG dark mode is `.dark-mode` on `<html>`. New surfaces must include `:host-context(.dark-mode) { ... }` overrides — see `footer.component.scss`, `contribute-page.component.scss`, `about-page.component.scss` for the pattern.
- **`role="menu"` contract**: any element with `role="menu"` MUST support arrow-key navigation (ArrowUp/Down/Home/End) + roving tabindex. See `language-switcher.component.ts` for the reference implementation.
