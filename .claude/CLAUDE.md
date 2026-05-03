# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

- `npm start` — dev server on http://localhost:4200 (proxies nothing; the app calls `environment.apiBase` directly).
- `npm run build` — production build into `dist/` (default config is `production`; budgets: 1MB initial / 8kB per component style).
- `npm run watch` — incremental dev build.
- `npm test` — Vitest via `@angular/build:unit-test`. Run a single spec by filtering: `npm test -- src/app/core/auth/auth.service.spec.ts` (or any substring).
- `npm run api:gen` — regenerates the typed API client in `src/app/api/` from `openapi/Training_Manager_API.yaml` using `openapi-generator-cli` (config in `openapitools.json`).

The backend runs separately at `http://localhost:8000` (set in `src/environments/environment.ts`). API is still in flux, so regenerate after spec changes.

## Architecture

Standalone-only Angular 21 app. All providers live in `src/app/app.config.ts`; routes in `src/app/app.routes.ts`.

### Layouts and routing
Three layout shells, each composed via nested routes:
- `AuthLayoutComponent` — `/login`, `/invitation/:token` (no auth).
- `MainLayoutComponent` — authenticated app shell (`canActivate: [authGuard]`); hosts `/`, `/profile`, `/events`, `/programs`, `/teams`.
- `AdminLayoutComponent` — nested inside `MainLayout` under `/admin` with `[authGuard, staffGuard]`; hosts taxonomy CRUD (sports, energy-systems, energy-segments, modalities).

Feature routes use `loadComponent` / `loadChildren` for lazy loading. Convention per feature: `{feature}-list`, `{feature}-form`, `{feature}-detail` components under `src/app/features/{feature}/`.

### Auth flow
`AuthService` (`src/app/core/auth/auth.service.ts`) holds the current user as a signal. JWT pair lives in `TokenStorage`. `authInterceptor` (`src/app/core/auth/auth.interceptor.ts`):
1. Skips non-API URLs and the `/auth/token/` + `/auth/token/refresh/` endpoints.
2. Attaches `Authorization: Bearer <access>`.
3. On 401, calls `AuthService.refresh()`, retries with the new access token, and on refresh failure calls `logout()` (which redirects to `/login`).

`provideAppInitializer` in `app.config.ts` runs `AuthService.bootstrap()` at startup: if a refresh token exists it refreshes + fetches `/me/` before the router activates, so guards see the correct auth state on the first navigation.

### Generated API client (`src/app/api/`)
Do NOT hand-edit anything under `src/app/api/` — it is fully overwritten by `npm run api:gen`. The client is wired via `provideApi(environment.apiBase)` in `app.config.ts`. Import services and models like:
```ts
import { EventsService } from '../../api/api/events.service';
import { Event } from '../../api/model/event';
```

### i18n
Transloco with langs `fr` (default), `nl`, `en`, `it`, `es`. JSON catalogs live in `public/i18n/`. `LanguageService` (`src/app/core/i18n/language.service.ts`) is the single source of truth:
- `switchLanguage(code)` applies to Transloco optimistically, persists via `PATCH /me/`, and rolls back on failure.
- An `effect` watches `AuthService.currentUser()` and applies `me.language` to Transloco at bootstrap/login. `LanguageService` is force-instantiated in `provideAppInitializer` so this effect is wired before `bootstrap()` resolves.

### UI
PrimeNG 21 with the Aura preset; dark mode toggled via the `.dark-mode` class on `<html>` (configured in `providePrimeNG`). Tailwind 4 is enabled via `@tailwindcss/postcss` (see `.postcssrc.json`); use Tailwind utilities alongside PrimeNG components.

### Toasts and confirmations
`MessageService` is provided globally in `app.config.ts`. `ConfirmationService` is provided per-component (e.g. `EventsDetailComponent`) since PrimeNG's confirm dialog is scoped.

## Code conventions

### TypeScript
- Strict mode is on (`strict`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `strictTemplates`).
- Prefer type inference when obvious. Avoid `any`; use `unknown` when the type is uncertain.

### Angular
- Standalone components only. Do NOT set `standalone: true` in decorators — it is the default in v20+.
- Use signals for state (`signal`, `computed`, `update`/`set` — never `mutate`).
- Use `inject()` instead of constructor injection.
- `input()` / `output()` functions instead of `@Input` / `@Output` decorators.
- Set `changeDetection: ChangeDetectionStrategy.OnPush` on every component.
- Lazy-load feature routes (`loadComponent` / `loadChildren`).
- Do NOT use `@HostBinding` / `@HostListener` — put bindings in the `host` object of the decorator.
- Use `NgOptimizedImage` for static images (does not work for inline base64).
- Prefer reactive forms over template-driven forms.
- External templates/styles use paths relative to the component TS file.

### Templates
- Use native control flow (`@if`, `@for`, `@switch`) — not `*ngIf` / `*ngFor` / `*ngSwitch`.
- Use `class` and `style` bindings — not `ngClass` / `ngStyle`.
- Use the `async` pipe for observables.
- Do not assume globals like `new Date()` are available in templates.

### Services
- Single responsibility. Singletons use `providedIn: 'root'`.
- Use `inject()`.

### Accessibility
- Must pass AXE checks and meet WCAG AA (focus management, contrast, ARIA).

### Formatting
- Prettier: 100-col, single quotes, Angular parser for `*.html`. 2-space indent (`.editorconfig`).
