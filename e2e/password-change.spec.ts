import { test, expect } from '@playwright/test';
import { loginAs } from './auth';
import { SEED } from './seed';

/**
 * Password change keeps the session (backend PR trainingmanager_server#44):
 * POST auth/password/change/ revokes EVERY refresh token of the user and
 * returns a fresh {detail, access, refresh}; the SPA must store that pair,
 * otherwise its next refresh presents a blacklisted token and logs it out.
 *
 * The real endpoint is NOT called: it would revoke the shared seed manager's
 * refresh tokens (and change its password) under the specs running in
 * parallel. It is answered instead with a genuine pair minted by the backend
 * (a refresh rotation, which also revokes the refresh the SPA held), so the
 * second half of the test exercises a real refresh with the stored pair.
 */
const ACCESS_KEY = 'tm_access_token';
const REFRESH_KEY = 'tm_refresh_token';
const API_BASE = process.env['E2E_API_BASE_URL'] || 'http://localhost:8000';

test('changing the password stores the new token pair and stays signed in', async ({ page }) => {
  await loginAs(page, 'manager');
  const oldRefresh = await page.evaluate((key) => localStorage.getItem(key), REFRESH_KEY);

  // Mint a genuine fresh pair WITHOUT another login (auth/token/ is throttled
  // per IP and the suite already logs in once per spec): rotating the stored
  // refresh blacklists it — just like the password change revokes the old
  // refresh tokens — so the session only survives if the SPA stores the pair.
  const minted = await page.request.post(`${API_BASE}/api/v1/auth/token/refresh/`, {
    data: { refresh: oldRefresh },
  });
  expect(minted.ok()).toBeTruthy();
  const pair = (await minted.json()) as { access: string; refresh: string };
  expect(pair.refresh).not.toBe(oldRefresh);

  await page.route('**/api/v1/auth/password/change/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Password updated.', ...pair }),
    }),
  );

  await page.goto('/profile/password');
  await page.locator('#current_password').fill(SEED.manager.password);
  await page.locator('#new_password').fill('e2e-N3w-Passw0rd!');
  await page.locator('#new_password_confirm').fill('e2e-N3w-Passw0rd!');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/\/profile$/);

  expect(await page.evaluate((key) => localStorage.getItem(key), ACCESS_KEY)).toBe(pair.access);
  expect(await page.evaluate((key) => localStorage.getItem(key), REFRESH_KEY)).toBe(pair.refresh);

  // Force the next boot to refresh: it must succeed with the stored pair.
  await page.evaluate((key) => localStorage.setItem(key, 'expired.access.token'), ACCESS_KEY);
  const refreshCall = page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/auth/token/refresh/') && res.request().method() === 'POST',
  );
  await page.goto('/dashboard');
  expect((await refreshCall).status()).toBe(200);
  await page.waitForURL(/\/dashboard$/);
  await expect(page.locator('button.um-trigger')).toBeVisible();
});
