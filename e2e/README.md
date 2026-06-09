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
  auth.setup.ts    # logs in manager + athlete, persists storageState to e2e/.auth/*.json
  login.spec.ts    # logged-out: manager logs in and reaches /dashboard
  team.spec.ts     # manager: create a team
  event.spec.ts    # manager: create a session under the seeded program
  rsvp.spec.ts     # athlete: set RSVP to "going" on a team event
```

Playwright projects (see `playwright.config.ts`): `setup` runs first and the
authed projects (`chromium-manager`, `chromium-athlete`) reuse its
`storageState`; `chromium` runs the logged-out login spec.

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

### Required repo secret: `E2E_BACKEND_TOKEN`

The job checks out the **private** backend repo `Foxugly/trainingmanager_server`,
which the workflow's automatic `GITHUB_TOKEN` cannot access (it is scoped to
this repo only). Provide a token with **read access to the backend repo's
contents**:

1. Create a **fine-grained PAT** (recommended, least privilege):
   GitHub → Settings → Developer settings →
   *Fine-grained personal access tokens* → **Generate new token**
   - Resource owner: `Foxugly`
   - Repository access: *Only select repositories* → `trainingmanager_server`
   - Repository permissions: **Contents → Read-only** (nothing else)
   - Set an expiration (renew before it lapses).

   A classic PAT with the `repo` scope also works but is broader.

2. Add it as a repo secret on **this** repo:

   ```bash
   gh secret set E2E_BACKEND_TOKEN -R Foxugly/trainingmanager_frontend --body "<token>"
   gh secret list -R Foxugly/trainingmanager_frontend   # verify it appears
   ```

Without this secret the **Checkout backend** step fails and the whole job
stops there.
