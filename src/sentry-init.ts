/**
 * Initialise Sentry BEFORE the Angular bootstrap (imported first in main.ts) so
 * errors during app init are captured too. Errors raised inside Angular reach
 * Sentry through the ErrorHandler provided in app.config.ts.
 *
 * Values come from the runtime config (globals injected by nginx). If the DSN
 * is empty (dev, or a boot before SSM is seeded), Sentry.init is not called —
 * the SDK stays inert, no network calls. The options (token scrubbing
 * included) live in app/core/sentry-options.ts.
 */
import * as Sentry from '@sentry/angular';

import { getRuntimeConfig } from './app/core/runtime-config';
import { buildSentryOptions } from './app/core/sentry-options';

const { sentry } = getRuntimeConfig();

if (sentry.dsn) {
  Sentry.init(buildSentryOptions(sentry));
}
