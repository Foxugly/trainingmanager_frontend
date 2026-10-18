import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Set on a request whose 401 must NOT trigger a token refresh + replay
 * (e.g. the best-effort POST auth/logout/: the session is ending anyway).
 */
export const SKIP_REFRESH_ON_401 = new HttpContextToken<boolean>(() => false);

/**
 * Opt-in to the backend's HttpOnly refresh cookie (trainingmanager_server
 * `customuser/refresh_cookie.py`). Set on the auth calls ONLY: authInterceptor
 * then adds `X-Auth-Mode: cookie` + `withCredentials`, the server sets the
 * refresh token in a `HttpOnly; Secure; SameSite=Lax` cookie scoped to
 * `/api/v1/auth/` on the API host and leaves it out of the JSON body, so no
 * script (and no XSS) can read it. Every other API call stays plain Bearer,
 * without credentials.
 */
export const COOKIE_AUTH = new HttpContextToken<boolean>(() => false);

export const AUTH_MODE_HEADER = 'X-Auth-Mode';
export const AUTH_MODE_COOKIE = 'cookie';

/** Context for an auth call in cookie mode. */
export function cookieAuthContext(context: HttpContext = new HttpContext()): HttpContext {
  return context.set(COOKIE_AUTH, true);
}
