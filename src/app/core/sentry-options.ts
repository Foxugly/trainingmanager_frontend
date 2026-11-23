/**
 * Options passed to `Sentry.init` (sentry-init.ts). Kept here so that
 * sentry-options.spec.ts can run them in a real Sentry client and check that
 * the token scrubbing still applies to transactions.
 */
import * as Sentry from '@sentry/angular';
import type { BrowserOptions } from '@sentry/angular';

import type { RuntimeSentryConfig } from './runtime-config';
import { scrubBreadcrumb, scrubEvent, scrubSpan } from './sentry-scrub';

export function buildSentryOptions(sentry: RuntimeSentryConfig): BrowserOptions {
  return {
    dsn: sentry.dsn,
    environment: sentry.environment,
    release: sentry.release || undefined,
    integrations: [Sentry.browserTracingIntegration()],
    // 10% of transactions traced in prod: a volume/cost compromise.
    tracesSampleRate: 0.1,
    // Propagate trace headers only to our own backend.
    tracePropagationTargets: [/^https:\/\/tm-api\.foxugly\.com\/api/],
    // Sentry 11 replaced `sendDefaultPii` with `dataCollection`, whose defaults
    // are more permissive: pin the restrictive v10 baseline explicitly.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      },
      httpBodies: [],
      urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
    // Sentry 11 streams spans by default and then ignores
    // `beforeSendTransaction`: the path token would ship in the pageload /
    // navigation transaction. Keep v10's "static" lifecycle so the scrubbing
    // below applies (sentry-options.spec.ts).
    traceLifecycle: 'static',
    // Tokens carried in URLs (confirm / reset / magic-link / invitation /
    // public event links) are masked in URLs, transaction names, spans and
    // breadcrumbs (core/sentry-scrub.ts).
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    // Standalone spans (INP) do not go through beforeSendTransaction.
    beforeSendSpan: Sentry.withStaticSpan((span) => scrubSpan(span)),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  };
}
