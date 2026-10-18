/**
 * Strip the single-use / bearer tokens carried in URLs out of Sentry events.
 *
 * Several routes put the secret in the PATH: `/auth/confirm-email/:key`,
 * `/auth/confirm-email-change/:token`, `/auth/reset-password/:key`,
 * `/auth/magic-link/:token`, `/invitation/:token`, `/s/e/:token`,
 * `/team-join-requests/magic-action/:token`, and the matching API calls
 * (`/invitations/lookup/<token>/`, `/join-magic/<token>/`,
 * `/public/events/<token>/`). Unfiltered they reach Sentry in `request.url`,
 * the transaction name (pageload / navigation = pathname), spans and
 * navigation / fetch breadcrumbs — and, URL-encoded, inside a `returnUrl`
 * query parameter (the auth guard puts the magic-action URL there). Everything
 * after those prefixes is masked, as are the `uid` / `token` / `key` / `code`
 * query parameters wherever they appear.
 */
import type { Breadcrumb, Event } from '@sentry/angular';

export const FILTERED = '[Filtered]';

// `/` or its URL-encoded form, so a path nested in `?returnUrl=%2F...` is caught.
const SEP = '(?:/|%2F)';
const SENSITIVE_PREFIXES = [
  'confirm-email',
  'confirm-email-change',
  'reset-password',
  'magic-link',
  'invitation',
  `s${SEP}e`,
  'magic-action',
  `invitations${SEP}lookup`,
  'join-magic',
  `public${SEP}events`,
];
// Skips an already-masked value and a route pattern (`:token`, from TraceService).
const SENSITIVE_PATH = new RegExp(
  `(${SEP}(?:${SENSITIVE_PREFIXES.join('|')})${SEP})(?!\\[Filtered\\]|:)[^?#&\\s"']+`,
  'gi',
);
const SENSITIVE_QUERY = /([?&](?:uid|token|key|code)=)[^&#\s"']*/gi;

/** Mask the sensitive segments / parameters of a string containing a URL. */
export function scrubUrl(value: string): string;
export function scrubUrl(value: string | undefined): string | undefined;
export function scrubUrl(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  return value
    .replace(SENSITIVE_PATH, (_match, prefix: string) => `${prefix}${FILTERED}`)
    .replace(SENSITIVE_QUERY, (_match, prefix: string) => `${prefix}${FILTERED}`);
}

function scrubRecordUrls(data: Record<string, unknown> | undefined): void {
  if (!data) {
    return;
  }
  for (const key of ['url', 'from', 'to', 'http.url', 'http.query', 'url.full', 'http.target']) {
    const value = data[key];
    if (typeof value === 'string') {
      data[key] = scrubUrl(value);
    }
  }
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  scrubRecordUrls(breadcrumb.data);
  if (breadcrumb.message) {
    breadcrumb.message = scrubUrl(breadcrumb.message);
  }
  return breadcrumb;
}

/** Clean the fields shared by error events and transactions. */
export function scrubEvent<T extends Event>(event: T): T {
  if (event.request) {
    event.request.url = scrubUrl(event.request.url);
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubUrl(`?${event.request.query_string}`).slice(1);
    }
    const headers = event.request.headers;
    if (headers?.['Referer']) {
      headers['Referer'] = scrubUrl(headers['Referer']);
    }
  }
  if (event.transaction) {
    event.transaction = scrubUrl(event.transaction);
  }
  event.breadcrumbs?.forEach(scrubBreadcrumb);
  for (const span of event.spans ?? []) {
    if (span.description) {
      span.description = scrubUrl(span.description);
    }
    scrubRecordUrls(span.data as Record<string, unknown> | undefined);
  }
  scrubRecordUrls(event.contexts?.trace?.data as Record<string, unknown> | undefined);
  return event;
}
