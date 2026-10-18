import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { isApiUrl, requestPathname } from '../http/api-url';
import {
  AUTH_MODE_COOKIE,
  AUTH_MODE_HEADER,
  COOKIE_AUTH,
  SKIP_REFRESH_ON_401,
} from './auth-context';
import { AuthService, isSessionEndingError } from './auth.service';
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
  // Cookie mode: logout authenticates with the HttpOnly refresh cookie, not a
  // Bearer (an expired in-memory access token must not turn it into a 401).
  '/auth/logout/',
];

export const authInterceptor: HttpInterceptorFn = (originalReq, next) => {
  const tokenStorage = inject(TokenStorage);

  // Cookie mode (auth calls only): opt in to the HttpOnly refresh cookie and
  // let the browser store / send it on this cross-origin call. Every other API
  // call stays plain Bearer, without credentials.
  const req =
    originalReq.context.get(COOKIE_AUTH) && isApiUrl(originalReq.url)
      ? originalReq.clone({
          setHeaders: { [AUTH_MODE_HEADER]: AUTH_MODE_COOKIE },
          withCredentials: true,
        })
      : originalReq;

  // Anchor the auth-path match to the request PATHNAME (endsWith) instead of a
  // bare substring, so a query param or resource path containing '/auth/...'
  // can't flip a normal API call into the no-token branch.
  const path = requestPathname(req.url);
  const isAuthEndpoint = path !== null && AUTH_PATHS.some((p) => path.endsWith(p));

  if (!isApiUrl(req.url) || isAuthEndpoint) {
    return next(req);
  }

  // Injected only for API calls: the i18n catalog request fires while
  // AuthService is still being constructed (its Router dependency builds the
  // title strategy, which loads translations); injecting it for that request
  // raised NG0200 (circular dependency) and failed the translation load.
  const authService = inject(AuthService);

  const access = tokenStorage.getAccess();
  const authedReq = access ? req.clone({ setHeaders: { Authorization: `Bearer ${access}` } }) : req;

  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || req.context.get(SKIP_REFRESH_ON_401)) {
        return throwError(() => err);
      }
      // Anonymous visitor (no session at all, e.g. on a public page): a 401 is
      // a plain error for the caller, not an expired session — no refresh, no
      // redirect to /login.
      if (!tokenStorage.hasSession()) {
        return throwError(() => err);
      }
      return authService.refresh().pipe(
        // Placed BEFORE the replay so it only sees refresh failures: an error of
        // the replayed request (e.g. a legitimate 403 on the resource) must not
        // end the session.
        catchError((refreshErr: unknown) => {
          // Only a rejected refresh token (401/403) or a session already gone
          // in another tab ends the session. A network error or a 5xx (backend
          // restarting during a deploy) keeps the tokens: the error reaches the
          // caller and the next call retries the refresh.
          if (isSessionEndingError(refreshErr)) {
            authService.clearSession();
          }
          return throwError(() => refreshErr);
        }),
        switchMap(() => {
          const newAccess = tokenStorage.getAccess();
          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${newAccess ?? ''}` },
          });
          return next(retried);
        }),
      );
    }),
  );
};
