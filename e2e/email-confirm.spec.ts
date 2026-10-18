import { test, expect } from '@playwright/test';

/**
 * Confirmation links are single-use (trainingmanager_server#44): a second
 * click answers 400 invalid_or_expired_token, exactly like an invalid or
 * expired key. The page must not leave the user stuck: it explains the link
 * may already have been used and offers to sign in.
 */
test('an invalid or already-used confirmation link offers to sign in', async ({ page }) => {
  const confirmCall = page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/auth/email/confirm/') && res.request().method() === 'POST',
  );
  await page.goto('/auth/confirm-email/1-already-used-token');
  const res = await confirmCall;
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe('invalid_or_expired_token');

  // Anonymous visitors get the browser-default locale: assert on stable ids.
  await expect(page.locator('.email-confirm__text')).toBeVisible();
  await page.getByTestId('email-confirm-sign-in').click();
  await page.waitForURL(/\/login$/);
});
