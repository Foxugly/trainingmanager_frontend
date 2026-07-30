# End-to-end tests (Playwright)

Critical-path Playwright suite for the Training Manager Angular SPA, covering
**login → create team → create event → RSVP**. The frontend and backend live in
separate repos, so the suite drives the real SPA against a real backend.

| Piece | Where |
|---|---|
| Specs + config | this repo (`e2e/`, `playwright.config.ts`) |
| Backend + seed | `Foxugly/trainingmanager_server` (mgmt command `create_e2e_data`) |
| CI | `.github/workflows/e2e.yml` (rebuilds the whole stack on every push/PR) |

## Layout

```
e2e/
  seed.ts          # the seed-data contract — must mirror the backend create_e2e_data command
  auth.ts          # loginAs(page, role) — fresh per-spec UI login helper
  login.spec.ts    # logged-out: manager logs in and reaches /dashboard
  team.spec.ts     # manager: create a team
  event.spec.ts    # manager: create a session under the seeded program
  rsvp.spec.ts     # athlete: set RSVP to "going" on a team event
```

Playwright projects (see `playwright.config.ts`): `chromium` runs the
logged-out login spec; `chromium-manager` (team + event) and `chromium-athlete`
(rsvp) each authenticate **fresh per spec** via a `beforeEach` calling
`loginAs`. We deliberately do **not** share a saved `storageState`: the backend
rotates and blacklists refresh tokens (`SIMPLE_JWT ROTATE_REFRESH_TOKENS +
BLACKLIST_AFTER_ROTATION`), so the SPA's cold-boot refresh consumes the saved
token and replaying one frozen token across specs/retries 401s and logs the app
out. A fresh login per spec gives each test its own single-use token pair. See
the header comment in `e2e/auth.ts`.

## Running locally

The config starts **no servers** — bring up both yourself first:

```bash
# 1. Backend (in the trainingmanager_server checkout): migrate, seed, serve :8000
python manage.py migrate
python manage.py create_e2e_data        # idempotent; refuses to run against prod
python manage.py runserver 8000

# 2. Frontend (this repo): serve :4200
npm start

# 3. Run the suite (in a third shell)
npm run e2e          # headless
npm run e2e:ui       # Playwright UI mode
```

Point the suite at another deployment with `E2E_BASE_URL` (default
`http://localhost:4200`).

The seeded credentials (mirrored in `seed.ts`) are
`e2e-manager@foxugly.com` / `e2e-athlete@foxugly.com`, password
`e2e-Passw0rd!`. Keep `seed.ts` and the backend `create_e2e_data` constants in
lock-step — the specs match on these exact strings and on the seeded
`E2E Team` / `E2E Program` / `E2E Sport` names.

## CI

`.github/workflows/e2e.yml` runs on every push and PR (and via manual
**Run workflow** / `workflow_dispatch`). It checks out this repo **and** the
backend repo, installs both, writes a CI `.env` (sqlite, `DEBUG=True` +
`STATE=INT` so the `create_e2e_data` prod-guard passes), migrates, seeds,
serves backend :8000 + frontend :4200, then runs `playwright test`. The HTML
report and server logs are uploaded as the `playwright-report` artifact
(14-day retention) on every run, pass or fail.

### No repo secret needed (and don't add one back)

The backend checkout needs **no token**. `Foxugly/trainingmanager_server` is a
**public** repo, and the workflow's automatic `GITHUB_TOKEN` can read any public
repo.

This section used to require an `E2E_BACKEND_TOKEN` secret, from the days when
the backend was private. That requirement was removed on **2026-07-30** because
it silently broke every Dependabot pull request:

```
##[error]Input required and not supplied: token
```

Dependabot runs use a **separate secret store** from Actions (the run log shows
`Secret source: Dependabot`). A secret set with `gh secret set` lands in the
*Actions* store only, so `secrets.E2E_BACKEND_TOKEN` resolved to an empty string
on Dependabot PRs and `actions/checkout` aborted before installing anything —
no matter what the PR contained.

If the backend ever goes private again, do **not** simply restore the old
recipe. Set the token in **both** stores, or the Dependabot breakage returns:

```bash
gh secret set E2E_BACKEND_TOKEN -R Foxugly/trainingmanager_frontend --body "<token>"
gh secret set E2E_BACKEND_TOKEN -R Foxugly/trainingmanager_frontend --app dependabot --body "<token>"
```
