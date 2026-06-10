/**
 * Sanitise a user-supplied `returnUrl` against open-redirect.
 *
 * Only same-origin, app-internal absolute paths are allowed. A bare
 * `startsWith('/')` is not enough: it lets through protocol-relative
 * (`//evil.com`), backslash (`/\evil.com`) and absolute-URL (`scheme://…`)
 * forms that the router / a browser may treat as cross-origin. Anything that
 * fails the check falls back to `fallback`.
 */
export function safeReturnUrl(raw: string | null | undefined, fallback: string): string {
  return raw &&
    raw.startsWith('/') &&
    !raw.startsWith('//') &&
    !raw.startsWith('/\\') &&
    !raw.includes('://')
    ? raw
    : fallback;
}
