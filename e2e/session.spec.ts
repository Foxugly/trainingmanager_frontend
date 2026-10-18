import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginAs } from './auth';

/**
 * Session robustness against the real backend, with the refresh token in the
 * backend's HttpOnly cookie (`tm_refresh`, opt-in `X-Auth-Mode: cookie`) and
 * the access token in memory only. Refresh tokens rotate + blacklist on every
 * refresh.
 *
 * - a reload restores the session from the cookie; no token is ever readable
 *   from script (localStorage / document.cookie);
 * - a 401 refreshes through the cookie and replays the request;
 * - a rejected / missing cookie sends the user to /login;
 * - a transient refresh failure (5xx) does not purge the session;
 * - logout revokes and clears the cookie (auth/logout/);
 * - a logout in one tab signs the other tabs out (storage event);
 * - tabs refreshing at the same time stay signed in (Web Lock);
 * - a refresh token left in localStorage by the pre-cookie SPA is migrated.
 */
const API_BASE = process.env['E2E_API_BASE_URL'] || 'http://localhost:8000';
const COOKIE = 'tm_refresh';
const HINT_KEY = 'tm.session';
const LEGACY_REFRESH_KEY = 'tm_refresh_token';
const REFRESH_PATH = '**/api/v1/auth/token/refresh/';

async function refreshCookie(context: BrowserContext): Promise<string | undefined> {
  // The cookie is scoped to /api/v1/auth/: ask for a URL under that path.
  const cookies = await context.cookies(`${API_BASE}/api/v1/auth/`);
  return cookies.find((c) => c.name === COOKIE)?.value;
}

async function hint(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), HINT_KEY);
}

async function logoutFromMenu(page: Page): Promise<void> {
  // The user-menu trigger (the language switcher also has aria-haspopup="menu").
  await page.locator('button.um-trigger').click();
  await page.locator('.p-menu-item:has(.pi-sign-out)').click();
}

async function expectSignedIn(page: Page): Promise<void> {
  await page.waitForURL(/\/dashboard$/);
  // The boot restore (refresh + /me/) runs before the first render.
  await expect(page.locator('button.um-trigger')).toBeVisible({ timeout: 15_000 });
}

test('login sets an HttpOnly cookie; reloads and 401s refresh through it', async ({
  page,
  context,
}) => {
  await loginAs(page, 'manager');

  const cookie = (await context.cookies(`${API_BASE}/api/v1/auth/`)).find((c) => c.name === COOKIE);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.path).toBe('/api/v1/auth/');

  // Nothing secret is readable from script.
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(storage).not.toMatch(/token|eyJ/);
  expect(await page.evaluate(() => document.cookie)).not.toContain(COOKIE);

  const refreshCall = page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/auth/token/refresh/') && res.request().method() === 'POST',
  );
  await page.reload();
  const refresh = await refreshCall;
  expect(refresh.status()).toBe(200);
  expect(refresh.request().headers()['x-auth-mode']).toBe('cookie');
  expect(await refresh.json()).not.toHaveProperty('refresh');
  await expectSignedIn(page);

  // A 401 refreshes through the cookie and replays the request.
  // The next /me/ call is answered 401 once, as if the access token expired.
  let rejected = 0;
  await page.route('**/api/v1/me/', async (route) => {
    if (rejected === 0 && route.request().method() === 'GET') {
      rejected += 1;
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });
  const refreshes: number[] = [];
  page.on('response', (res) => {
    if (res.url().endsWith('/api/v1/auth/token/refresh/') && res.request().method() === 'POST') {
      refreshes.push(res.status());
    }
  });

  // Boot: refresh -> /me/ 401 -> refresh again -> /me/ replayed -> profile.
  await page.goto('/profile');
  await page.waitForURL(/\/profile$/);
  await expect(page.locator('button.um-trigger')).toBeVisible();
  expect(rejected).toBe(1);
  expect(refreshes).toEqual([200, 200]);
});

test('a 5xx on token refresh keeps the session, a missing cookie ends it', async ({
  page,
  context,
}) => {
  await loginAs(page, 'manager');
  const cookie = await refreshCookie(context);
  expect(cookie).toBeTruthy();

  await page.route(REFRESH_PATH, (route) => route.fulfill({ status: 502, body: 'Bad Gateway' }));
  await page.goto('/dashboard');
  // The boot could not refresh: the guard sends us to /login, but the session
  // (hint + cookie) is kept instead of being purged.
  await page.waitForURL(/\/login/);
  expect(await hint(page)).not.toBeNull();
  expect(await refreshCookie(context)).toBe(cookie);

  // Backend back: the next load restores the session from the cookie.
  await page.unroute(REFRESH_PATH);
  await page.goto('/dashboard');
  await expectSignedIn(page);

  // A missing (or rejected) cookie, on the other hand, ends the session.
  await context.clearCookies();
  await page.goto('/dashboard');
  await page.waitForURL(/\/login/);
  expect(await hint(page)).toBeNull();
});

test('logout revokes and clears the refresh cookie', async ({ page, context }) => {
  await loginAs(page, 'manager');
  const cookie = await refreshCookie(context);

  const logoutCall = page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/auth/logout/') && res.request().method() === 'POST',
  );
  await logoutFromMenu(page);
  const logout = await logoutCall;
  expect(logout.status()).toBe(204);
  // The cookie authenticates the call: no Bearer.
  expect(logout.request().headers()['authorization']).toBeUndefined();
  await page.waitForURL(/\/login/);
  expect(await hint(page)).toBeNull();
  expect(await refreshCookie(context)).toBeUndefined();

  // The revoked token can no longer mint tokens (body mode, as the app would).
  const replay = await page.request.post(`${API_BASE}/api/v1/auth/token/refresh/`, {
    data: { refresh: cookie },
  });
  expect(replay.status()).toBe(401);
});

test('logging out in one tab signs the other tab out', async ({ context }) => {
  const first = await context.newPage();
  await loginAs(first, 'manager');
  const second = await context.newPage();
  await second.goto('/dashboard');
  await expectSignedIn(second);

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
  const second = await context.newPage();

  // Both boots refresh (the access token lives in memory only); the backend
  // blacklists the first cookie presented, so without the cross-tab lock one
  // tab would be logged out.
  await Promise.all([first.goto('/dashboard'), second.goto('/dashboard')]);
  // A background tab may not render (no requestAnimationFrame): check each in front.
  await first.bringToFront();
  await expectSignedIn(first);
  await second.bringToFront();
  await expectSignedIn(second);
});

test('a refresh token left in localStorage by the old SPA is migrated to the cookie', async ({
  page,
  context,
}) => {
  await loginAs(page, 'manager');
  // Simulate a pre-cookie session: the token in localStorage, no cookie, no hint.
  const legacy = await refreshCookie(context);
  await context.clearCookies();
  await page.evaluate(
    ([hintKey, legacyKey, token]) => {
      localStorage.removeItem(hintKey);
      localStorage.setItem(legacyKey, token);
    },
    [HINT_KEY, LEGACY_REFRESH_KEY, legacy ?? ''],
  );

  const refreshCall = page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/auth/token/refresh/') && res.request().method() === 'POST',
  );
  await page.goto('/dashboard');
  const refresh = await refreshCall;
  expect(refresh.status()).toBe(200);
  expect(refresh.request().postDataJSON()).toEqual({ refresh: legacy });
  await expectSignedIn(page);

  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_REFRESH_KEY)).toBeNull();
  expect(await hint(page)).not.toBeNull();
  const migrated = await refreshCookie(context);
  expect(migrated).toBeTruthy();
  expect(migrated).not.toBe(legacy);

  // Next load: cookie only.
  const next = page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/auth/token/refresh/') && res.request().method() === 'POST',
  );
  await page.reload();
  expect((await next).request().postDataJSON() ?? {}).toEqual({});
  await expectSignedIn(page);
});
