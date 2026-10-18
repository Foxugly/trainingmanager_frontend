import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  defer,
  finalize,
  firstValueFrom,
  from,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timeout,
} from 'rxjs';
import { SESSION_HINT_KEY, TokenStorage } from './token.storage';
import { SKIP_REFRESH_ON_401, cookieAuthContext } from './auth-context';
import { AuthService as ApiAuthService } from '../../api/api/auth.service';
import { MeService } from '../../api/api/me.service';
import { EmailConfirmRequest } from '../../api/model/email-confirm-request';
import { EmailResendRequest } from '../../api/model/email-resend-request';
import { MagicLinkExchangeRequestRequest } from '../../api/model/magic-link-exchange-request-request';
import { MagicLinkRequestRequest } from '../../api/model/magic-link-request-request';
import { MagicLinkRequestResponse } from '../../api/model/magic-link-request-response';
import { Me } from '../../api/model/me';
import { PasswordChangeRequest } from '../../api/model/password-change-request';
import { PasswordChangeResponse } from '../../api/model/password-change-response';
import { PasswordResetConfirmRequest } from '../../api/model/password-reset-confirm-request';
import { PasswordResetRequest } from '../../api/model/password-reset-request';
import { PasswordResetRequestResponse } from '../../api/model/password-reset-request-response';
import { EmailResendResponse } from '../../api/model/email-resend-response';
import { RegisterRequest } from '../../api/model/register-request';
import { RegisterResponse } from '../../api/model/register-response';
import { TokenRefresh } from '../../api/model/token-refresh';
import { VerifiedTokenObtainPairRequest } from '../../api/model/verified-token-obtain-pair-request';

/** Web Locks name serialising the refresh-token rotation across every tab of the origin. */
export const REFRESH_LOCK_NAME = 'tm.refresh';

/** Error message of a refresh attempted with no session left to restore. */
export const NO_REFRESH_TOKEN = 'NO_REFRESH_TOKEN';

/** Upper bound on the best-effort server logout before the local session is cleared anyway. */
const LOGOUT_TIMEOUT_MS = 5000;

/** Upper bound on the boot-time restore, so a hung API never blocks the SPA. */
const RESTORE_TIMEOUT_MS = 10_000;

/**
 * True when a refresh failure means the session is really over: the backend
 * rejected the refresh cookie (401/403 — expired, blacklisted, absent, user
 * gone) or there is no session left (logged out in another tab). A network
 * error or a 5xx (backend restarting during a deploy) is NOT: the session is
 * kept and the next call retries.
 */
export function isSessionEndingError(error: unknown): boolean {
  if (error instanceof Error && !(error instanceof HttpErrorResponse)) {
    return error.message === NO_REFRESH_TOKEN;
  }
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
}

/**
 * Session lifecycle. The refresh token lives in the backend's HttpOnly cookie
 * (cookie mode on the auth calls, see auth-context.ts) and the access token in
 * memory only (TokenStorage). A reload restores the session through
 * `POST auth/token/refresh/` + `GET me/` (bootstrap).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenStorage = inject(TokenStorage);
  private readonly apiAuth = inject(ApiAuthService);
  private readonly meService = inject(MeService);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<Me | null>(null);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);

  // In-flight refresh shared across concurrent callers. The backend rotates +
  // blacklists the refresh token on every refresh (ROTATE_REFRESH_TOKENS +
  // BLACKLIST_AFTER_ROTATION), so two parallel refreshes would present the same
  // cookie and the second would be rejected. Sharing one in-flight refresh
  // prevents it in this tab; across tabs the rotation runs under a Web Lock.
  private refresh$: Observable<TokenRefresh> | null = null;

  constructor() {
    // Multi-tab: `storage` fires in the OTHER tabs when the session hint
    // changes ("session changed") or disappears ("logged out"). It never
    // carries a token: the other tabs re-restore from the shared cookie.
    if (typeof window !== 'undefined') {
      const onStorage = (event: StorageEvent) => this.onStorageEvent(event);
      window.addEventListener('storage', onStorage);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
    }
  }

  /**
   * Silent restore (app initializer, and when another tab signs in): refresh
   * through the cookie, then load `/me/`. Runs only when there is a session to
   * restore (hint, or a legacy token to migrate), so anonymous visitors make no
   * call. Never errors: a rejected refresh (401/403) ends the session; a
   * network error or a 5xx keeps the hint so the next load retries.
   */
  bootstrap(): Observable<boolean> {
    if (!this.tokenStorage.hasSession()) {
      return of(false);
    }
    return this.refresh().pipe(
      switchMap(() => this.fetchMe()),
      timeout(RESTORE_TIMEOUT_MS),
      tap(() => {
        if (!this.tokenStorage.hasHint()) {
          // Migrated from a legacy token: start announcing the session.
          this.tokenStorage.announceSession();
        }
      }),
      map(() => true),
      catchError((err: unknown) => {
        // At boot the user is still null, so a network error / 5xx renders as
        // signed out until a later retry; a tab already signed in keeps its user.
        if (isSessionEndingError(err)) {
          this.tokenStorage.clear();
          this._currentUser.set(null);
        }
        return of(false);
      }),
    );
  }

  login(email: string, password: string, remember = false): Observable<Me> {
    // `remember` picks the refresh lifetime server-side (30 days instead of 7),
    // and with it the cookie's Max-Age.
    const payload: VerifiedTokenObtainPairRequest = { email, password, remember };
    return this.apiAuth
      .authTokenCreate({ verifiedTokenObtainPairRequest: payload }, 'body', false, {
        context: cookieAuthContext(),
      })
      .pipe(switchMap((tokens) => this.startSession(tokens.access)));
  }

  /**
   * Adopt the access token of a cookie-mode sign-in response (login, magic
   * link, email confirm, password reset, invitation): the refresh token is
   * already in the HttpOnly cookie. Loads /me/ and tells the other tabs.
   */
  startSession(access: string): Observable<Me> {
    this.tokenStorage.setAccess(access);
    this.tokenStorage.dropLegacy();
    this.tokenStorage.announceSession();
    return this.fetchMe();
  }

  /**
   * User-initiated logout: revoke the refresh cookie server-side first
   * (POST auth/logout/ blacklists and clears it; no Bearer needed, so an
   * expired access token cannot turn it into a 401), best-effort and bounded
   * by a timeout, then clear the local session whatever the outcome.
   */
  logout(): void {
    const legacy = this.tokenStorage.getLegacyRefresh();
    this.apiAuth
      .authLogoutCreate({ logoutRequest: legacy ? { refresh: legacy } : {} }, 'body', false, {
        context: cookieAuthContext(new HttpContext().set(SKIP_REFRESH_ON_401, true)),
      })
      .pipe(
        timeout(LOGOUT_TIMEOUT_MS),
        catchError(() => of(null)),
        finalize(() => this.clearSession()),
      )
      .subscribe();
  }

  /** Drop the local session (token + hint + user) and go to /login. No server call. */
  clearSession(): void {
    this.tokenStorage.clear();
    this._currentUser.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Obtain a fresh access token from the refresh cookie. Concurrent callers in
   * this tab share one request; across tabs the rotation is serialised with the
   * Web Locks API, so two tabs never present the same cookie. The browser sends
   * whatever cookie is current when the request leaves, so a tab that waited
   * for the lock uses the token the other tab just rotated.
   */
  refresh(): Observable<TokenRefresh> {
    if (!this.tokenStorage.hasSession()) {
      return throwError(() => new Error(NO_REFRESH_TOKEN));
    }
    if (this.refresh$) {
      return this.refresh$;
    }
    this.refresh$ = defer(() => this.withRefreshLock(() => this.postRefresh())).pipe(
      finalize(() => {
        this.refresh$ = null;
      }),
      shareReplay(1),
    );
    return this.refresh$;
  }

  private postRefresh(): Observable<TokenRefresh> {
    if (!this.tokenStorage.hasSession()) {
      // Logged out in another tab while we waited for the lock.
      return throwError(() => new Error(NO_REFRESH_TOKEN));
    }
    // Migration: a token left in localStorage by the pre-cookie SPA is
    // presented once in the body (cookie mode on, so the rotated token lands in
    // the cookie), then deleted. Read inside the lock: another tab may already
    // have migrated it.
    const legacy = this.tokenStorage.getLegacyRefresh();
    return this.apiAuth
      .authTokenRefreshCreate(
        { tokenRefreshRequest: legacy ? { refresh: legacy } : {} },
        'body',
        false,
        { context: cookieAuthContext() },
      )
      .pipe(
        tap({
          next: (tokens) => {
            this.tokenStorage.setAccess(tokens.access);
            if (legacy) {
              this.tokenStorage.dropLegacy();
            }
          },
          error: (error: unknown) => {
            // A rejected legacy token is dead: drop it. A network error / 5xx
            // keeps it for the next attempt.
            if (legacy && isSessionEndingError(error)) {
              this.tokenStorage.dropLegacy();
            }
          },
        }),
      );
  }

  /** Run `task` under the cross-tab refresh lock; plain call when Web Locks is unavailable. */
  private withRefreshLock<T>(task: () => Observable<T>): Observable<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks?.request) {
      return task();
    }
    return from(locks.request(REFRESH_LOCK_NAME, () => firstValueFrom(task())) as Promise<T>);
  }

  private onStorageEvent(event: StorageEvent): void {
    // event.key === null <=> localStorage.clear() in another tab.
    if (event.key !== null && event.key !== SESSION_HINT_KEY) {
      return;
    }
    if (!this.tokenStorage.hasHint()) {
      // Logged out elsewhere (the cookie is gone too): drop our copy.
      const hadSession = this._currentUser() !== null;
      this.tokenStorage.clear();
      this._currentUser.set(null);
      if (hadSession) {
        this.router.navigate(['/login']);
      }
      return;
    }
    // Signed in / password changed elsewhere: the shared cookie already holds
    // the new session; pick it up (access token + user).
    this.bootstrap().subscribe();
  }

  fetchMe(): Observable<Me> {
    return this.meService.meRetrieve().pipe(tap((user) => this._currentUser.set(user)));
  }

  /**
   * Fire-and-forget /me/ resync. Use after actions that change derived
   * fields like team_quota (team create, archive, restore). Errors are
   * swallowed — the worst case is a slightly stale UI until the next
   * navigation triggers a fresh load.
   */
  refreshMe(): void {
    this.fetchMe().subscribe({ error: () => {} });
  }

  setCurrentUser(user: Me): void {
    this._currentUser.set(user);
  }

  register(payload: RegisterRequest): Observable<RegisterResponse> {
    return this.apiAuth.authRegisterCreate({ registerRequest: payload });
  }

  confirmEmail(key: string): Observable<Me> {
    const payload: EmailConfirmRequest = { key };
    return this.apiAuth
      .authEmailConfirmCreate({ emailConfirmRequest: payload }, 'body', false, {
        context: cookieAuthContext(),
      })
      .pipe(switchMap((res) => this.startSession(res.access)));
  }

  resendEmail(email: string): Observable<EmailResendResponse> {
    const payload: EmailResendRequest = { email };
    return this.apiAuth.authEmailResendCreate({ emailResendRequest: payload });
  }

  requestPasswordReset(payload: PasswordResetRequest): Observable<PasswordResetRequestResponse> {
    return this.apiAuth.authPasswordResetCreate({ passwordResetRequestRequest: payload });
  }

  confirmPasswordReset(key: string, newPassword: string): Observable<Me> {
    const payload: PasswordResetConfirmRequest = { key, new_password: newPassword };
    return this.apiAuth
      .authPasswordResetConfirmCreate({ passwordResetConfirmRequest: payload }, 'body', false, {
        context: cookieAuthContext(),
      })
      .pipe(switchMap((res) => this.startSession(res.access)));
  }

  /**
   * Change the signed-in user's password. The backend revokes EVERY refresh
   * token of the user (other devices must sign in again) and issues a fresh
   * pair for this session: in cookie mode the new refresh token replaces the
   * HttpOnly cookie (shared by every tab of this browser, which re-restore on
   * the session hint) and only the access token comes back in the body.
   */
  changePassword(payload: PasswordChangeRequest): Observable<PasswordChangeResponse> {
    return this.apiAuth
      .authPasswordChangeCreate({ passwordChangeRequest: payload }, 'body', false, {
        context: cookieAuthContext(),
      })
      .pipe(
        tap((res) => {
          this.tokenStorage.setAccess(res.access);
          this.tokenStorage.announceSession();
        }),
      );
  }

  /**
   * Request a passwordless sign-in email. The backend always answers 200 with
   * the same body (no user enumeration); the caller shows a neutral message.
   * `turnstileToken` is the Cloudflare Turnstile response (checked server-side).
   */
  requestMagicLink(email: string, turnstileToken?: string): Observable<MagicLinkRequestResponse> {
    const payload: MagicLinkRequestRequest = turnstileToken
      ? { email, turnstile_token: turnstileToken }
      : { email };
    return this.apiAuth.authMagicLinkRequestCreate({ magicLinkRequestRequest: payload });
  }

  /**
   * Trade a magic-link token for a session, then adopt the access token and
   * load /me/ via the same helper the password-login path uses — the resulting
   * auth state is indistinguishable from a regular sign-in.
   */
  exchangeMagicLink(token: string): Observable<Me> {
    const payload: MagicLinkExchangeRequestRequest = { token };
    return this.apiAuth
      .authMagicLinkExchangeCreate({ magicLinkExchangeRequestRequest: payload }, 'body', false, {
        context: cookieAuthContext(),
      })
      .pipe(switchMap((res) => this.startSession(res.access)));
  }
}
