import { test, expect } from '@playwright/test';
import { SEED } from './seed';
import { loginAs } from './auth';

test.beforeEach(async ({ page }) => {
  await loginAs(page, 'manager');
});

/**
 * Team creation critical path (logged in fresh as the manager — see
 * e2e/auth.ts for why this is a per-spec login and not a shared storageState).
 *
 * Flow (teams-list -> teams-form):
 *   /teams  has a "New team" CTA -> /teams/new
 *   teams-form required fields: name (#name text input), sport_ids
 *     (<p-multiSelect inputId="sport_ids">) and default_sport_id
 *     (<p-select inputId="default_sport_id">, options = the picked sports).
 *     language defaults to 'fr' (already valid).
 *   Save = the form-footer submit button -> teamsCreate -> navigates to
 *     /teams/<id>/edit.
 * We then visit /teams and assert the new team shows in the grid (each card
 * renders an <h2> with team.name).
 *
 * Selector notes: PrimeNG widgets are driven via their stable `inputId` (the
 * label text would be locale-dependent — the app defaults to French). Sport
 * option text ("E2E Sport") comes from the seeded sport and is locale-stable.
 */
test('manager can create a team', async ({ page }) => {
  const teamName = `E2E Playwright Team ${Date.now()}`;

  await page.goto('/teams/new');

  // Name (plain pInputText with id="name").
  await page.locator('#name').fill(teamName);

  // Sports multiselect: open the panel, tick the seeded sport, close it.
  // PrimeNG puts inputId (#sport_ids) on a visually-hidden combobox input, not
  // on the clickable trigger, so click the <p-multiselect> host (its
  // onContainerClick opens the overlay); options land in an overlay as listbox
  // options.
  const multiselect = page.locator('p-multiselect:has(#sport_ids)');
  await multiselect.click();
  await page.getByRole('option', { name: SEED.sport }).click();

  // Close the overlay so the default-sport select is interactable, then wait for
  // it to actually detach — otherwise both overlays expose an "E2E Sport" option
  // at once and the next getByRole('option') hits a strict-mode violation.
  //
  // Two things were wrong here and made the test flaky (green on retry, so the
  // run stayed green and nobody saw it — reproduced on main, without any app
  // change, on 2026-07-31):
  //
  //   1. `Escape` only closes the overlay when focus is inside it. After
  //      clicking an option PrimeNG can leave focus on the host, and the key
  //      then goes nowhere. Clicking the host toggles the overlay shut whatever
  //      the focus is.
  //   2. Waiting on the option COUNT conflated "overlay gone" with "option gone"
  //      and silently depended on the option label. We now wait on the overlay
  //      element itself, which is what we actually mean.
  await multiselect.click();
  await expect(page.locator('.p-multiselect-overlay')).toHaveCount(0);

  // Default sport select: open and choose the same sport (now an option). Same
  // inputId-on-hidden-input rule as the multiselect — click the <p-select> host.
  await page.locator('p-select:has(#default_sport_id)').click();
  await expect(page.locator('.p-select-overlay')).toBeVisible();
  await page.getByRole('option', { name: SEED.sport }).click();

  // Save (form-footer). The footer renders a submit-style button; the text is
  // locale-dependent so target the button that triggers (save) — it is the
  // primary button in the footer. We click by its role+accessible name with a
  // fallback to the only enabled primary action.
  await page.getByRole('button', { name: /save|enregistrer|opslaan|salva|guardar/i }).click();

  // teamsCreate -> /teams/<id>/edit.
  await page.waitForURL(/\/teams\/\d+\/edit$/, { timeout: 15_000 });

  // Confirm it appears in the list.
  await page.goto('/teams');
  await expect(page.getByRole('heading', { name: teamName })).toBeVisible();
});
