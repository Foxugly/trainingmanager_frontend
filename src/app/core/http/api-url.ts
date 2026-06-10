import { getRuntimeConfig } from '../runtime-config';

/** Pathname of a request URL (absolute or relative), or null if unparseable. */
export function requestPathname(url: string): string | null {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

/** True only when the request targets the configured API origin (exact origin
 * match + path prefix), not merely a string that starts with the base — guards
 * against prefix confusion (`https://api.example.com.evil.com`). */
export function isApiUrl(url: string): boolean {
  try {
    const base = new URL(getRuntimeConfig().apiBaseUrl, window.location.origin);
    const target = new URL(url, window.location.origin);
    const basePath = base.pathname.replace(/\/+$/, '');
    return target.origin === base.origin && target.pathname.startsWith(basePath);
  } catch {
    return false;
  }
}
