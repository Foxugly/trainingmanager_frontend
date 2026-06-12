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
`openapi/Training_Manager_API.yaml` from the backend's `openapi-schema.yaml`,
then run `npm run api:gen`. The client is generated with
`useSingleRequestParameter=true`, so every method takes a single typed
`*RequestParams` object — adding a backend filter just adds an optional field,
it does not break existing call sites by argument-order shift.

## Architecture (quick map)

- Providers in `src/app/app.config.ts`; routes in `src/app/app.routes.ts`. Standalone components only.
- Three layout shells: `PublicLayout` (marketing/auth), `MainLayout` (`authGuard`), `AdminLayout` (`superuserGuard`, taxonomy CRUD — the admin entry is superuser-gated, not plain staff).
- Per-feature folders under `src/app/features/{feature}/` with the `{feature}-list/-form/-detail` trio.
- Auth: `AuthService` holds the current `Me` signal; JWT pair in `TokenStorage`; `authInterceptor` attaches the bearer + refreshes on 401.
- i18n: Transloco catalogs in `public/i18n/*.json`; `LanguageService` is the source of truth. New keys go to **all 5 languages**.
- Generated client (`src/app/api/`): import services/models from there; do not edit by hand.

See `.claude/CLAUDE.md` for the full conventions (signals, control-flow, a11y, gotchas).

## End-to-end tests (Playwright)

The critical-path suite lives in `e2e/` (config `playwright.config.ts`,
baseURL from `E2E_BASE_URL`, default `http://localhost:4200`). It needs a
running backend on `:8000` seeded with the deterministic e2e fixtures, and a
running frontend on `:4200`.

### Run locally

```bash
# 1. Backend (in the trainingmanager_server repo): serve + seed on :8000.
python manage.py migrate
python manage.py create_e2e_data         # idempotent; seeds the e2e users/team/program/sport
python manage.py runserver 0.0.0.0:8000

# 2. Frontend (this repo): dev server on :4200 (apiBase already points at :8000).
npm start

# 3. Run the suite (separate terminal).
npm run e2e            # or `npm run e2e:ui` for the Playwright UI
```

Seeded credentials (see `e2e/seed.ts`, kept in sync with the backend command):
manager `e2e-manager@foxugly.com`, athlete `e2e-athlete@foxugly.com`, password
`e2e-Passw0rd!`. The `auth.setup.ts` project logs both in and persists their
storage state under `e2e/.auth/`.

### CI

`.github/workflows/e2e.yml` (job **E2E**) runs the suite on every push and PR.
It checks out the **backend** repo (`Foxugly/trainingmanager_server`, `main`)
into `./backend`, installs + migrates + seeds it on SQLite with dummy CI env,
serves it on `:8000`, then `ng serve`s this frontend on `:4200` and runs
Playwright. The HTML report is uploaded as the `playwright-report` artifact.

> **Required one-time repo secret:** `E2E_BACKEND_TOKEN` — a token (classic PAT
> or fine-grained) with **read** (contents) access to
> `Foxugly/trainingmanager_server`, used for the cross-repo backend checkout.
> Without it the `Checkout backend` step fails. Add it under
> *Settings → Secrets and variables → Actions → New repository secret*.

## Deploy

Edit locally → commit → push to `main`. GitHub Actions (OIDC → AWS SSM) builds
and deploys automatically. Never deploy by hand from the server.
