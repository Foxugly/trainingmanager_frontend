# TrainingManager — Frontend

Angular SPA for **TrainingManager**, the sport-training planner. Talks to the
`trainingmanager_server` DRF API. Mirrors the QuizOnline design system (emerald
accent, PrimeNG Aura).

## Stack

- Angular 21.2 (standalone components, signals, TypeScript 5.9 strict)
- PrimeNG 21 (Aura preset, dark mode via `.dark-mode` on `<html>`)
- Tailwind 4 (`@tailwindcss/postcss`)
- Transloco 8 — 5 languages (fr default, nl/en/it/es)
- Vitest 4 (unit tests)
- openapi-generator-cli (typescript-angular) — the API client in `src/app/api/` is generated, **never hand-edited**
- Sentry (`@sentry/angular`)

## Setup

```bash
git clone https://github.com/Foxugly/trainingmanager_frontend
cd trainingmanager_frontend
npm install
npm start          # dev server on http://localhost:4200
```

The backend is expected at `http://localhost:8000` (configured in
`src/environments/environment.ts`). Run `trainingmanager_server` separately.

## Common commands

| Command | What it does |
|---|---|
| `npm start` | Dev server (http://localhost:4200), calls `environment.apiBase` directly. |
| `npm run build` | Production build into `dist/` (initial-bundle budget 1 MB warn / 1.5 MB error). |
| `npm run watch` | Incremental dev build. |
| `npm test` | Vitest unit tests. Single spec: `npm test -- --include "src/app/.../x.spec.ts"`. |
| `npm run api:gen` | Regenerate the typed API client in `src/app/api/` from `openapi/Training_Manager_API.yaml`. |

The OpenAPI spec is still in flux: after backend changes, re-sync
`openapi/Training_Manager_API.yaml` then run `npm run api:gen` and audit the
positional query-param call sites (they shift alphabetically when a filter is added).

## Architecture (quick map)

- Providers in `src/app/app.config.ts`; routes in `src/app/app.routes.ts`. Standalone components only.
- Three layout shells: `PublicLayout` (marketing/auth), `MainLayout` (`authGuard`), `AdminLayout` (`staffGuard`, taxonomy CRUD).
- Per-feature folders under `src/app/features/{feature}/` with the `{feature}-list/-form/-detail` trio.
- Auth: `AuthService` holds the current `Me` signal; JWT pair in `TokenStorage`; `authInterceptor` attaches the bearer + refreshes on 401.
- i18n: Transloco catalogs in `public/i18n/*.json`; `LanguageService` is the source of truth. New keys go to **all 5 languages**.
- Generated client (`src/app/api/`): import services/models from there; do not edit by hand.

See `.claude/CLAUDE.md` for the full conventions (signals, control-flow, a11y, gotchas).

## Deploy

Edit locally → commit → push to `main`. GitHub Actions (OIDC → AWS SSM) builds
and deploys automatically. Never deploy by hand from the server.
