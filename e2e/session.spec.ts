import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './auth';

/**
 * Session robustness (audit 2026-10-18, F-I1/F-I2/F-I3), against the real
 * backend: refresh tokens rotate + blacklist on every refresh.
 *
 * - a transient refresh failure (5xx) does not purge the session;
 * - logout revokes the refresh token server-side (auth/logout/);
 * - a logout in one tab signs the other tabs out (storage event);
 * - tabs refreshing at the same time stay signed in (Web Lock + adoption of
 *   the pair another tab already rotated).
 */
const ACCESS_KEY = 'tm_access_token';
const REFRESH_KEY = 'tm_refresh_token';
const API_BASE = process.env['E2E_API_BASE_URL'] || 'http://localhost:8000';

async function storedRefresh(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), REFRESH_KEY);
}

/** Make the stored access token unusable so the next boot has to refresh. */
async function breakAccessToken(page: Page): Promise<void> {
  await page.evaluate((key) => localStorage.setItem(key, 'expired.access.token'), ACCESS_KEY);
}

async function logoutFromMenu(page: Page): Promise<void> {
  // The user-menu trigger (the language switcher also has aria-haspopup="menu").
  await page.locator('button.um-trigger').click();
  await page.locator('.p-menu-item:has(.pi-sign-out)').click();
}

test('a 5xx on token refresh keeps the session', async ({ page }) => {
  await loginAs(page, 'manager');
  const refresh = await storedRefresh(page);
  expect(refresh).toBeTruthy();

  await breakAccessToken(page);
  await page.route('**/api/v1/auth/token/refresh/', (route) =>
    route.fulfill({ status: 502, body: 'Bad Gateway' }),
  );
  await page.goto('/dashboard');
  // The boot could not refresh: the guard sends us to /login, but the tokens
  // are kept instead of being purged.
  await page.waitForURL(/\/login/);
  expect(await storedRefresh(page)).toBe(refresh);

  // Backend back: the next load restores the session from the kept tokens.
  await page.unroute('**/api/v1/auth/token/refresh/');
  await page.goto('/dashboard');
  await page.waitForURL(/\/dashboard$/);
  await expect(page.locator('button.um-trigger')).toBeVisible();
});

test('logout revokes the refresh token on the server', async ({ page }) => {
  await loginAs(page, 'manager');
  const refresh = await storedRefresh(page);

  const logoutCall = page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/auth/logout/') && res.request().method() === 'POST',
  );
  await logoutFromMenu(page);
  expect((await logoutCall).status()).toBe(204);
  await page.waitForURL(/\/login/);
  expect(await storedRefresh(page)).toBeNull();

  // The revoked refresh can no longer mint tokens.
  const replay = await page.request.post(`${API_BASE}/api/v1/auth/token/refresh/`, {
    data: { refresh },
  });
  expect(replay.status()).toBe(401);
});

test('logging out in one tab signs the other tab out', async ({ context }) => {
  const first = await context.newPage();
  await loginAs(first, 'manager');
  const second = await context.newPage();
  await second.goto('/dashboard');
  await second.waitForURL(/\/dashboard$/);

  // PrimeNG's popup menu animates on requestAnimationFrame, which a background
  // tab does not run.
  await first.bringToFront();
  await logoutFromMenu(first);
  await first.waitForURL(/\/login/);
  await second.waitForURL(/\/login/);
});

test('two tabs refreshing at the same time both stay signed in', async ({ context }) => {
  const first = await context.newPage();
  await loginAs(first, 'manager');
  await breakAccessToken(first);
  const second = await context.newPage();

  // Both boots need a refresh; the backend blacklists the first refresh token
  // presented, so without the cross-tab lock one tab would be logged out.
  await Promise.all([first.goto('/dashboard'), second.goto('/dashboard')]);
  await first.waitForURL(/\/dashboard$/);
  await second.waitForURL(/\/dashboard$/);
  await expect(first.locator('button.um-trigger')).toBeVisible();
  await expect(second.locator('button.um-trigger')).toBeVisible();
});
