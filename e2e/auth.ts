import { type Page } from '@playwright/test';
import { SEED } from './seed';

/**
 * Fresh per-spec UI login for the authenticated specs.
 *
 * Why a fresh login per spec instead of a single shared storageState: the
 * backend rotates AND blacklists refresh tokens (SIMPLE_JWT
 * ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION), so each refresh token is
 * single-use. The SPA refreshes once on every cold boot
 * (provideAppInitializer -> AuthService.bootstrap()), which rotates and
 * blacklists whatever refresh token it was handed. A storageState file freezes
 * ONE refresh token; replaying it across specs and retries presents an
 * already-blacklisted token -> refresh 401 -> bootstrap clears the session and
 * redirects to /login -> the authed page never renders. Logging in fresh gives
 * each spec its own token pair, so no refresh token is ever presented twice.
 *
 * Login form (src/app/features/auth/login): #username (pInputText — the backend
 * accepts the email as username) + #password (inner input of <p-password>) + a
 * submit button. On success AuthService navigates to `/`, which redirects an
 * authenticated user to /dashboard.
 */
export type SeedRole = 'manager' | 'athlete';

export async function loginAs(page: Page, role: SeedRole): Promise<void> {
  const { email, password } = SEED[role];
  await page.goto('/login');
  // Stable, locale-independent ids from the login template.
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
  // Authenticated landing is /dashboard (post-login redirect via `/`).
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
}
