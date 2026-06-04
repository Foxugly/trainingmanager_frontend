/**
 * Initialise Sentry BEFORE the Angular bootstrap (imported first in main.ts) so
 * errors during app init are captured too.
 *
 * Values come from the runtime config (globals injected by nginx). If the DSN
 * is empty (dev, or a boot before SSM is seeded), Sentry.init is not called —
 * the SDK stays inert, no network calls.
 */
import * as Sentry from '@sentry/angular';

import { getRuntimeConfig } from './app/core/runtime-config';

const { sentry } = getRuntimeConfig();

if (sentry.dsn) {
  Sentry.init({
    dsn: sentry.dsn,
    environment: sentry.environment,
    release: sentry.release || undefined,
    integrations: [Sentry.browserTracingIntegration()],
    // 10% of transactions traced in prod: a volume/cost compromise.
    tracesSampleRate: 0.1,
    // Propagate trace headers only to our own backend.
    tracePropagationTargets: [/^https:\/\/tm-api\.foxugly\.com\/api/],
  });
}
