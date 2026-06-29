import { test, expect } from '@playwright/test';

/**
 * Android App Links association file. It must be served at the well-known path so
 * HTTPS deep links (https://tm.foxugly.com/auth/..., /invitation/...) open the app
 * instead of the browser. Served statically from public/.well-known/ (copied to the
 * build root; nginx `try_files $uri` serves it before the SPA fallback). Runs
 * logged-out — no auth needed.
 */
test('assetlinks.json is served and declares the Android app', async ({ request }) => {
  const res = await request.get('/.well-known/assetlinks.json');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type'] ?? '').toContain('application/json');

  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);

  const statement = body[0];
  expect(statement?.relation).toContain('delegate_permission/common.handle_all_urls');
  expect(statement?.target?.namespace).toBe('android_app');
  expect(statement?.target?.package_name).toBe('com.foxugly.trainingmanager_app');

  const fps = statement?.target?.sha256_cert_fingerprints;
  expect(Array.isArray(fps)).toBe(true);
  expect(fps.length).toBeGreaterThan(0);
  // Fingerprints are colon-separated uppercase hex (32 bytes → 64 hex chars).
  for (const fp of fps) {
    expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  }
});
