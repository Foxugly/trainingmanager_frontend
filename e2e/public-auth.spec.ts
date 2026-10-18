import { test, expect } from '@playwright/test';

/**
 * Public auth pages, logged out.
 *
 * - Cloudflare Turnstile is a third-party script: it is injected only by the
 *   forms that render a widget (register, forgot password, magic-link request),
 *   never on the other routes (audit 2026-10-18 F-I4). Cloudflare is stubbed
 *   here so the suite does not depend on it; the <script> tag is what
 *   is asserted.
 * - A bogus magic link lands on the invalid-link state and does not sign in.
 */
const TURNSTILE = 'script[src*="challenges.cloudflare.com"]';

test.beforeEach(async ({ page }) => {
  // Answer with an empty script: the tag loads (and stays) without Cloudflare.
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
});

test('Turnstile loads on register but not on the password login', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator(TURNSTILE)).toHaveCount(0);

  await page.goto('/register');
  await expect(page.locator('#first_name')).toBeVisible();
  await expect(page.locator(TURNSTILE)).toHaveCount(1);
});

test('Turnstile loads on the forgot-password form', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator(TURNSTILE)).toHaveCount(1);
});

test('an invalid magic link shows the invalid state and does not sign in', async ({ page }) => {
  await page.goto('/auth/magic-link/not-a-real-token');
  await expect(page.locator('.magic__state-text')).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/magic-link\//);
  expect(await page.evaluate(() => Object.keys(localStorage).join(','))).not.toMatch(/token/i);
});
