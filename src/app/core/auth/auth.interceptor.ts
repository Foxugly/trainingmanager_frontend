import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { getRuntimeConfig } from '../runtime-config';
import { AuthService } from './auth.service';
import { TokenStorage } from './token.storage';

const AUTH_PATHS = [
  '/auth/token/',
  '/auth/token/refresh/',
  '/auth/register/',
  '/auth/email/confirm/',
  '/auth/email/resend/',
  '/auth/password/reset/',
  '/auth/password/reset/confirm/',
  // Public — confirming an email change works from the link even if logged out.
  // (The REQUEST endpoint /me/email/change/ stays authenticated, not listed here.)
  '/auth/email/change/confirm/',
  '/auth/magic-link/request/',
  '/auth/magic-link/exchange/',
];

/** Pathname of a request URL (absolute or relative), or null if unparseable. */
function requestPathname(url: string): string | null {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

/** True only when the request targets the configured API origin (exact origin
 * match + path prefix), not merely a string that starts with the base — guards
 * against prefix confusion (`https://api.example.com.evil.com`). */
function isApiUrl(url: string): boolean {
  try {
    const base = new URL(getRuntimeConfig().apiBaseUrl, window.location.origin);
    const target = new URL(url, window.location.origin);
    const basePath = base.pathname.replace(/\/+$/, '');
    return target.origin === base.origin && target.pathname.startsWith(basePath);
  } catch {
    return false;
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorage);
  const authService = inject(AuthService);

  // Anchor the auth-path match to the request PATHNAME (endsWith) instead of a
  // bare substring, so a query param or resource path containing '/auth/...'
  // can't flip a normal API call into the no-token branch.
  const path = requestPathname(req.url);
  const isAuthEndpoint = path !== null && AUTH_PATHS.some((p) => path.endsWith(p));

  if (!isApiUrl(req.url) || isAuthEndpoint) {
    return next(req);
  }

  const access = tokenStorage.getAccess();
  const authedReq = access
    ? req.clone({ setHeaders: { Authorization: `Bearer ${access}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401) {
        return throwError(() => err);
      }
      return authService.refresh().pipe(
        switchMap(() => {
          const newAccess = tokenStorage.getAccess();
          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${newAccess ?? ''}` },
          });
          return next(retried);
        }),
        catchError((refreshErr) => {
          authService.logout();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
