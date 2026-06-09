import { test, expect } from '@playwright/test';
import { SEED } from './seed';
import { loginAs } from './auth';

test.beforeEach(async ({ page }) => {
  await loginAs(page, 'athlete');
});

/**
 * Athlete RSVP critical path (logged in fresh as the athlete — see e2e/auth.ts
 * for why this is a per-spec login and not a shared storageState).
 *
 * The seeded athlete is a member of the seeded rsvp_enabled "E2E Team", so any
 * event under that team exposes the RSVP ("Availability") tab to them. This
 * spec assumes `create_e2e_data` provisions at least one event under the team
 * that is visible to the athlete (ideally in the current calendar month so the
 * month-grid renders its link). We open the first event from the calendar.
 *
 * RSVP UI (event-rsvp.component): when isAthlete(), it renders a row of
 * <p-button>s, one per status (going / maybe / not_going). Each button carries
 * [ariaLabel]="events.rsvp.<status>" and [ariaPressed]=isMyStatus(status); the
 * chosen one becomes aria-pressed="true" + a colored (non-secondary) severity.
 * The control lives inside the events-detail "Availability" tab (p-tab).
 *
 * Selector notes: the events-detail tabs are PrimeNG <p-tab> (rendered as
 * role="tab"); the RSVP tab label is locale-dependent ("Availability"/
 * "Disponibilité"...). The status buttons expose a stable aria-label per the
 * transloco value ("Going"/"Présent"...) so we match on the localized set.
 */
const GOING_LABEL = /going|présent|present|aanwezig|presente|voy|disponible/i;
const AVAILABILITY_TAB = /availability|disponibilit|beschikbaarheid|disponibilità|disponibilidad/i;

test('athlete can set RSVP to going on an event', async ({ page }) => {
  // Open the first event from the calendar (athlete sees team events).
  await page.goto('/events');
  const firstEvent = page.locator('a[href*="/events/"]').first();
  await expect(firstEvent).toBeVisible({ timeout: 15_000 });
  await firstEvent.click();
  await page.waitForURL(/\/events\/\d+$/, { timeout: 15_000 });

  // Switch to the Availability (RSVP) tab.
  await page.getByRole('tab', { name: AVAILABILITY_TAB }).click();

  // Click the "Going" status button (athlete view).
  const goingButton = page.getByRole('button', { name: GOING_LABEL }).first();
  await goingButton.click();

  // Selection registers: the chosen status drops the unselected outlined/
  // secondary look and takes its severity (going -> success). NB: the app's
  // [ariaPressed] binding lands on the <p-button> host element, not on this
  // inner native <button> that getByRole matches, so we assert the visible
  // selected state (the success severity class) rather than aria-pressed.
  await expect(goingButton).toHaveClass(/p-button-success/);
});
