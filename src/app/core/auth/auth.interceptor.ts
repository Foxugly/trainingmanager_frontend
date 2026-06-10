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

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorage);
  const authService = inject(AuthService);

  const isAuthEndpoint = AUTH_PATHS.some((path) => req.url.includes(path));
  const isApiCall = req.url.startsWith(getRuntimeConfig().apiBaseUrl);

  if (!isApiCall || isAuthEndpoint) {
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
