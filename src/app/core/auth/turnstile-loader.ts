/**
 * Loads Cloudflare Turnstile's script on demand.
 *
 * The script used to sit in index.html, so a third-party script ran on every
 * route (with the JWTs in localStorage). Only the forms that render a widget
 * (register, forgot password, magic-link login) need it: they call
 * `ensureTurnstileScript()` before their render/retry loop. The CSP already
 * allowlists https://challenges.cloudflare.com in script-src (host-source, so a
 * dynamically inserted script is admitted).
 */
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

const MARKER = 'data-turnstile-loader';

export function ensureTurnstileScript(doc: Document = document): void {
  const w = (typeof window === 'undefined' ? undefined : window) as
    { turnstile?: { render?: unknown } } | undefined;
  if (w?.turnstile?.render) return;
  if (doc.querySelector(`script[${MARKER}]`)) return;
  const script = doc.createElement('script');
  script.src = TURNSTILE_SCRIPT_URL;
  script.async = true;
  script.defer = true;
  script.setAttribute(MARKER, '');
  // A failed load (network, blocker) removes the tag so a later retry re-adds it.
  script.addEventListener('error', () => script.remove());
  doc.head.appendChild(script);
}
