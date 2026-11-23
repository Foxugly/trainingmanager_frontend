import * as Sentry from '@sentry/angular';
import { describe, expect, it } from 'vitest';
import type { BrowserOptions } from '@sentry/angular';

import { buildSentryOptions } from './sentry-options';
import { FILTERED } from './sentry-scrub';

/**
 * Run the real options in a real Sentry client (fake transport) and inspect the
 * envelopes that would be sent: proves the token scrubbing still applies to
 * transactions under Sentry 11, which ignores `beforeSendTransaction` outside
 * `traceLifecycle: 'static'`.
 */
async function sentEnvelopes(
  overrides: Pick<BrowserOptions, 'traceLifecycle'>,
  run: () => void,
): Promise<string> {
  const bodies: string[] = [];
  const decoder = new TextDecoder();
  const options = buildSentryOptions({
    dsn: 'https://public@o0.ingest.sentry.io/1',
    environment: 'test',
    release: '',
  });
  const client = new Sentry.BrowserClient({
    ...options,
    ...overrides,
    // Browser instrumentation is not what is under test.
    integrations: [],
    tracesSampleRate: 1,
    stackParser: Sentry.defaultStackParser,
    transport: (transportOptions) =>
      Sentry.createTransport(transportOptions, async (request) => {
        bodies.push(typeof request.body === 'string' ? request.body : decoder.decode(request.body));
        return { statusCode: 200 };
      }),
  });

  Sentry.withScope((scope) => {
    scope.setClient(client);
    client.init();
    run();
  });
  await client.flush(2000);
  return bodies.join('\n');
}

function navigateWithToken(): void {
  // Like browserTracingIntegration: until the route is resolved the name is the
  // raw pathname (source `url`, hence kept out of the trace context).
  Sentry.startSpan(
    {
      name: '/auth/reset-password/abc-123',
      op: 'navigation',
      forceTransaction: true,
      attributes: { 'sentry.segment.name.source': 'url' },
    },
    () => {
      Sentry.startSpan(
        {
          name: 'GET https://tm.foxugly.com/auth/magic-link/s3cr3t',
          op: 'http.client',
          attributes: { url: 'https://tm.foxugly.com/auth/magic-link/s3cr3t' },
        },
        () => undefined,
      );
    },
  );
}

describe('buildSentryOptions', () => {
  it('pins the restrictive v10 data-collection baseline and the static trace lifecycle', () => {
    const options = buildSentryOptions({ dsn: 'x', environment: 'production', release: '' });
    expect(options.traceLifecycle).toBe('static');
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
    });
    expect(options.release).toBeUndefined();
  });

  it('masks the one-time token in the transaction name and its spans before sending', async () => {
    const sent = await sentEnvelopes({}, navigateWithToken);

    expect(sent).toContain('"type":"transaction"');
    expect(sent).toContain(`/auth/reset-password/${FILTERED}`);
    expect(sent).toContain(`magic-link/${FILTERED}`);
    expect(sent).not.toContain('abc-123');
    expect(sent).not.toContain('s3cr3t');
  });

  it('would leak the token with the v11 default (streamed) lifecycle — why "static" is pinned', async () => {
    const sent = await sentEnvelopes({ traceLifecycle: 'stream' }, navigateWithToken);

    expect(sent).toContain('abc-123');
  });
});
