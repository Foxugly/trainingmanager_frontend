import { test, expect } from '@playwright/test';
import { loginAs } from './auth';
import { SEED } from './seed';

/**
 * Password change keeps the session (backend PR trainingmanager_server#44):
 * POST auth/password/change/ revokes EVERY refresh token of the user and
 * issues a fresh pair. In cookie mode the new refresh token replaces the
 * HttpOnly cookie and only `{detail, access}` comes back in the body.
 *
 * The real endpoint is NOT called: it would revoke the shared seed manager's
 * refresh tokens (and change its password) under the specs running in
 * parallel. Its effect on this browser is reproduced instead: a cookie-mode
 * refresh through the page's own cookie jar rotates the cookie (revoking the
 * one the SPA started with, as the password change does), and the mocked
 * response hands the SPA the access token it minted. The second half of the
 * test then exercises a real refresh with the rotated cookie.
 */
const API_BASE = process.env['E2E_API_BASE_URL'] || 'http://localhost:8000';

test('changing the password keeps the session through the rotated cookie', async ({
  page,
  baseURL,
}) => {
  await loginAs(page, 'manager');

  // page.request shares the browser context's cookies: the rotated token
  // lands in the same HttpOnly cookie the SPA uses.
  const minted = await page.request.post(`${API_BASE}/api/v1/auth/token/refresh/`, {
    headers: { 'X-Auth-Mode': 'cookie', Origin: new URL(baseURL ?? '').origin },
    data: {},
  });
  expect(minted.ok()).toBeTruthy();
  const { access } = (await minted.json()) as { access: string };
  expect(access).toBeTruthy();

  let changeRequest: { headers: Record<string, string> } | null = null;
  await page.route('**/api/v1/auth/password/change/', (route) => {
    changeRequest = { headers: route.request().headers() };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Password updated.', access }),
    });
  });

  await page.goto('/profile/password');
  await page.locator('#current_password').fill(SEED.manager.password);
  await page.locator('#new_password').fill('e2e-N3w-Passw0rd!');
  await page.locator('#new_password_confirm').fill('e2e-N3w-Passw0rd!');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/\/profile$/);

  expect(changeRequest).not.toBeNull();
  expect(changeRequest!.headers['x-auth-mode']).toBe('cookie');
  // No token ever lands in storage.
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toMatch(/token|eyJ/);

  // The next boot refreshes with the rotated cookie and stays signed in.
  const refreshCall = page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/auth/token/refresh/') && res.request().method() === 'POST',
  );
  await page.goto('/dashboard');
  expect((await refreshCall).status()).toBe(200);
  await page.waitForURL(/\/dashboard$/);
  await expect(page.locator('button.um-trigger')).toBeVisible();
});
