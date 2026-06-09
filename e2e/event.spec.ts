import { test, expect } from '@playwright/test';
import { SEED } from './seed';
import { loginAs } from './auth';

test.beforeEach(async ({ page }) => {
  await loginAs(page, 'manager');
});

/**
 * Event (session) creation critical path (logged in fresh as the manager — see
 * e2e/auth.ts for why this is a per-spec login and not a shared storageState).
 *
 * IMPORTANT — the events-form has NO program picker. `refer_program_id` is
 * required but is only ever set via the `?program=<id>` query param, which the
 * form reads on init, patches in, and DISABLES. The single UI entry point that
 * provides it is the "New session" button on a program's detail page
 * (programs-detail -> [routerLink]="['/events','new']" [queryParams]="{program: p.id}").
 * So the realistic flow is: open the seeded program, click "New session".
 *
 * events-form required fields:
 *   - name  (#name pInputText)
 *   - date  (<p-datepicker inputId="date" dateFormat="dd/mm/yy">)
 *   - program is pre-filled + disabled from the query param.
 * Save -> eventsCreate -> navigates to /events/<id>.
 *
 * Selector notes: program is reached by its seeded name "E2E Program" (the card
 * is an <a> wrapping an <h2> with the name). The datepicker accepts typed input
 * in dd/mm/yy format.
 */
test('manager can create an event under the seeded program', async ({ page }) => {
  const eventName = `E2E Playwright Session ${Date.now()}`;

  // 1. Open the seeded program from the programs list.
  await page.goto('/programs');
  await page.getByRole('link', { name: new RegExp(SEED.program) }).click();
  await page.waitForURL(/\/programs\/\d+$/, { timeout: 15_000 });

  // 2. "New session" button -> /events/new?program=<id>.
  await page
    .getByRole('button', { name: /new session|nouvelle séance|nouvelle seance|nieuwe sessie|nuova sessione|nueva sesión/i })
    .click();
  await page.waitForURL(/\/events\/new\?program=\d+/, { timeout: 15_000 });

  // 3. Fill name, then pick a date from the calendar overlay.
  await page.locator('#name').fill(eventName);
  // Typing into the PrimeNG datepicker does NOT commit to the reactive form
  // control (the input stays empty, form.invalid stays true and the footer Save
  // button stays disabled). Open the picker and click a day in the month it
  // opens on (the current month) — day 15 always exists and is unambiguous.
  await page.getByRole('combobox', { name: 'Date', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Choose Date' })
    .getByRole('gridcell', { name: '15', exact: true })
    .click();

  // 4. Save (form-footer primary button).
  await page.getByRole('button', { name: /save|enregistrer|opslaan|salva|guardar/i }).click();

  // eventsCreate -> /events/<id>.
  await page.waitForURL(/\/events\/\d+$/, { timeout: 15_000 });

  // The new event's name is shown on its detail page.
  await expect(page.getByText(eventName).first()).toBeVisible();
});
