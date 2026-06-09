import { test, expect } from '@playwright/test';
import { SEED } from './seed';

/**
 * Team creation critical path (manager storageState).
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
  // PrimeNG renders the trigger as a div with id = inputId; options land in an
  // overlay panel as listbox options.
  await page.locator('#sport_ids').click();
  await page.getByRole('option', { name: SEED.sport }).click();
  // Close the overlay so the default-sport select is interactable.
  await page.keyboard.press('Escape');

  // Default sport select: open and choose the same sport (now an option).
  await page.locator('#default_sport_id').click();
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
