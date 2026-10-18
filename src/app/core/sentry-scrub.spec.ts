import type { Breadcrumb, Event } from '@sentry/angular';
import { describe, expect, it } from 'vitest';
import { FILTERED, scrubBreadcrumb, scrubEvent, scrubUrl } from './sentry-scrub';

describe('scrubUrl', () => {
  const cases: [string, string][] = [
    [
      'https://tm.foxugly.com/auth/confirm-email/MQ-abc123',
      `https://tm.foxugly.com/auth/confirm-email/${FILTERED}`,
    ],
    ['/auth/confirm-email-change/tok.en:sig', `/auth/confirm-email-change/${FILTERED}`],
    ['/auth/reset-password/7-c4z2f9?x=1', `/auth/reset-password/${FILTERED}?x=1`],
    ['/auth/magic-link/eyJhbGciOi', `/auth/magic-link/${FILTERED}`],
    ['/invitation/abc-def', `/invitation/${FILTERED}`],
    ['/s/e/pub-token#rsvp', `/s/e/${FILTERED}#rsvp`],
    ['/team-join-requests/magic-action/tok123', `/team-join-requests/magic-action/${FILTERED}`],
    [
      'https://tm-api.foxugly.com/api/v1/invitations/lookup/tok/',
      `https://tm-api.foxugly.com/api/v1/invitations/lookup/${FILTERED}`,
    ],
    [
      'https://tm-api.foxugly.com/api/v1/join-magic/tok/',
      `https://tm-api.foxugly.com/api/v1/join-magic/${FILTERED}`,
    ],
    [
      'https://tm-api.foxugly.com/api/v1/public/events/tok/',
      `https://tm-api.foxugly.com/api/v1/public/events/${FILTERED}`,
    ],
    // Nested, URL-encoded in the auth guard's returnUrl.
    [
      '/login?returnUrl=%2Fteam-join-requests%2Fmagic-action%2Ftok123&x=1',
      `/login?returnUrl=%2Fteam-join-requests%2Fmagic-action%2F${FILTERED}&x=1`,
    ],
    [
      '/x?uid=MQ&token=abc&code=42&key=k&page=2',
      `/x?uid=${FILTERED}&token=${FILTERED}&code=${FILTERED}&key=${FILTERED}&page=2`,
    ],
  ];

  for (const [input, expected] of cases) {
    it(`masks ${input}`, () => {
      expect(scrubUrl(input)).toBe(expected);
    });
  }

  it('leaves route patterns, unrelated URLs and empty values alone', () => {
    expect(scrubUrl('/auth/magic-link/:token')).toBe('/auth/magic-link/:token');
    expect(scrubUrl('/api/v1/invitations/')).toBe('/api/v1/invitations/');
    expect(scrubUrl('/teams/42/events')).toBe('/teams/42/events');
    expect(scrubUrl(undefined)).toBeUndefined();
    expect(scrubUrl('')).toBe('');
  });

  it('is idempotent', () => {
    const once = scrubUrl('/auth/magic-link/abc');
    expect(scrubUrl(once)).toBe(once);
  });
});

describe('scrubEvent / scrubBreadcrumb', () => {
  it('masks request, transaction, breadcrumbs, spans and trace data', () => {
    const event = {
      request: {
        url: 'https://tm.foxugly.com/invitation/secret1',
        query_string: 'token=secret2',
        headers: { Referer: 'https://tm.foxugly.com/auth/reset-password/secret3' },
      },
      transaction: '/auth/magic-link/secret4',
      breadcrumbs: [{ category: 'navigation', data: { from: '/s/e/secret5', to: '/dashboard' } }],
      spans: [
        {
          description: 'GET https://tm-api.foxugly.com/api/v1/join-magic/secret6/',
          data: { 'http.url': 'https://tm-api.foxugly.com/api/v1/join-magic/secret6/' },
        },
      ],
      contexts: { trace: { data: { url: '/auth/confirm-email/secret7' } } },
    } as unknown as Event;

    const json = JSON.stringify(scrubEvent(event));

    expect(json).not.toMatch(/secret\d/);
    expect(json).toContain(FILTERED);
  });

  it('masks fetch breadcrumb data and messages', () => {
    const crumb: Breadcrumb = {
      category: 'fetch',
      message: 'GET /api/v1/public/events/secret/',
      data: { url: 'https://tm-api.foxugly.com/api/v1/invitations/lookup/secret/' },
    };
    expect(JSON.stringify(scrubBreadcrumb(crumb))).not.toContain('secret');
  });
});
