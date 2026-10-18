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
import { ACCESS_KEY, REFRESH_KEY, TokenStorage } from './token.storage';
import { SKIP_REFRESH_ON_401 } from './auth-context';
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
import { PasswordResetConfirmResponse } from '../../api/model/password-reset-confirm-response';
import { PasswordResetRequest } from '../../api/model/password-reset-request';
import { PasswordResetRequestResponse } from '../../api/model/password-reset-request-response';
import { EmailConfirmResponse } from '../../api/model/email-confirm-response';
import { EmailResendResponse } from '../../api/model/email-resend-response';
import { RegisterRequest } from '../../api/model/register-request';
import { RegisterResponse } from '../../api/model/register-response';
import { TokenRefresh } from '../../api/model/token-refresh';
import { VerifiedTokenObtainPairRequest } from '../../api/model/verified-token-obtain-pair-request';

/** Web Locks name serialising the refresh-token rotation across every tab of the origin. */
export const REFRESH_LOCK_NAME = 'tm.refresh';

export const NO_REFRESH_TOKEN = 'NO_REFRESH_TOKEN';

/** Seconds of margin under which an access token is treated as already expired. */
const ACCESS_EXPIRY_SKEW_S = 30;

/** Upper bound on the best-effort server logout before the local session is cleared anyway. */
const LOGOUT_TIMEOUT_MS = 5000;

/**
 * True when a refresh failure means the session is really over: the backend
 * rejected the refresh token (401/403 — expired, blacklisted, user gone) or
 * there is no refresh token left (logged out in another tab). A network error
 * or a 5xx (backend restarting during a deploy) is NOT: the tokens are kept and
 * the next call retries.
 */
export function isSessionEndingError(error: unknown): boolean {
  if (error instanceof Error && !(error instanceof HttpErrorResponse)) {
    return error.message === NO_REFRESH_TOKEN;
  }
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
}

/** `exp` (seconds) of a JWT, or null when the payload cannot be decoded. */
export function jwtExp(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

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
  // BLACKLIST_AFTER_ROTATION), so two parallel 401s each POSTing the same
  // refresh would let only the first win — the rest present a now-blacklisted
  // token, 401, and get logged out. Sharing one in-flight refresh prevents it.
  // Across tabs the same race exists, so the rotation also runs under a Web
  // Lock (see withRefreshLock / refreshOrAdopt).
  private refresh$: Observable<TokenRefresh> | null = null;

  constructor() {
    // Multi-tab: `storage` fires in the OTHER tabs on every localStorage write.
    // TokenStorage always reads localStorage, so rotated tokens are picked up
    // as-is; what needs resyncing is the in-memory user (logout / login
    // elsewhere).
    if (typeof window !== 'undefined') {
      const onStorage = (event: StorageEvent) => this.onStorageEvent(event);
      window.addEventListener('storage', onStorage);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
    }
  }

  bootstrap(): Observable<boolean> {
    if (!this.tokenStorage.hasRefresh()) {
      return of(false);
    }
    // A still-valid access token needs no refresh: otherwise every new tab
    // rotates the refresh token on open (and races its siblings).
    const tokens$: Observable<unknown> = this.hasValidAccess() ? of(null) : this.refresh();
    return tokens$.pipe(
      switchMap(() => this.fetchMe()),
      map(() => true),
      catchError((err: unknown) => {
        // Only a rejected refresh token ends the session. A network error or a
        // 5xx at boot keeps the tokens so the next load can recover.
        if (isSessionEndingError(err)) {
          this.tokenStorage.clear();
        }
        this._currentUser.set(null);
        return of(false);
      }),
    );
  }

  /** Whether the stored access token decodes and is not about to expire. */
  hasValidAccess(): boolean {
    const access = this.tokenStorage.getAccess();
    if (!access) {
      return false;
    }
    const exp = jwtExp(access);
    return exp !== null && exp - ACCESS_EXPIRY_SKEW_S > Date.now() / 1000;
  }

  login(email: string, password: string, remember = false): Observable<Me> {
    const payload: VerifiedTokenObtainPairRequest = { email, password, remember };
    return this.apiAuth.authTokenCreate({ verifiedTokenObtainPairRequest: payload }).pipe(
      tap((tokens) => this.tokenStorage.setTokens(tokens.access, tokens.refresh)),
      switchMap(() => this.fetchMe()),
    );
  }

  loginWithTokens(access: string, refresh: string): Observable<Me> {
    this.tokenStorage.setTokens(access, refresh);
    return this.fetchMe();
  }

  /**
   * User-initiated logout: revoke the refresh token server-side first
   * (POST auth/logout/ blacklists it and its rotation descendants), best-effort
   * and bounded by a timeout, then clear the local session whatever the
   * outcome. A 401 on that call must not trigger a refresh (SKIP_REFRESH_ON_401).
   */
  logout(): void {
    const refresh = this.tokenStorage.getRefresh();
    if (!refresh || !this.tokenStorage.getAccess()) {
      this.clearSession();
      return;
    }
    this.apiAuth
      .authLogoutCreate({ logoutRequest: { refresh } }, 'body', false, {
        context: new HttpContext().set(SKIP_REFRESH_ON_401, true),
      })
      .pipe(
        timeout(LOGOUT_TIMEOUT_MS),
        catchError(() => of(null)),
        finalize(() => this.clearSession()),
      )
      .subscribe();
  }

  /** Drop the local session (tokens + user) and go to /login. No server call. */
  clearSession(): void {
    this.tokenStorage.clear();
    this._currentUser.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Obtain a fresh token pair. Concurrent callers in this tab share one
   * request; across tabs the rotation is serialised with the Web Locks API
   * and, once inside the lock, storage is re-read: if another tab already
   * rotated the refresh token we adopt its pair instead of presenting the
   * (now blacklisted) one we hold.
   */
  refresh(): Observable<TokenRefresh> {
    const refreshToken = this.tokenStorage.getRefresh();
    if (!refreshToken) {
      return throwError(() => new Error(NO_REFRESH_TOKEN));
    }
    // De-duplicate concurrent refreshes: several requests can 401 in parallel
    // (cold start, mid-session expiry) and each would otherwise fire its own
    // POST with the same — soon blacklisted — refresh token.
    if (this.refresh$) {
      return this.refresh$;
    }
    this.refresh$ = defer(() => this.withRefreshLock(() => this.refreshOrAdopt(refreshToken))).pipe(
      finalize(() => {
        this.refresh$ = null;
      }),
      shareReplay(1),
    );
    return this.refresh$;
  }

  private refreshOrAdopt(usedRefresh: string): Observable<TokenRefresh> {
    const storedRefresh = this.tokenStorage.getRefresh();
    if (!storedRefresh) {
      // Logged out in another tab while we waited for the lock.
      return throwError(() => new Error(NO_REFRESH_TOKEN));
    }
    if (storedRefresh !== usedRefresh) {
      const access = this.tokenStorage.getAccess();
      if (access) {
        // Another tab rotated meanwhile: its pair is already in storage.
        return of({ access, refresh: storedRefresh });
      }
    }
    return this.postRefresh(storedRefresh);
  }

  private postRefresh(refresh: string): Observable<TokenRefresh> {
    return this.apiAuth.authTokenRefreshCreate({ tokenRefreshRequest: { refresh } }).pipe(
      tap((tokens) => {
        if (tokens.access) {
          this.tokenStorage.setAccess(tokens.access);
        }
        // Persist the rotated refresh from the response — the one we just
        // presented has been blacklisted server-side. Written after the access
        // so a tab reacting to it reads a matching pair.
        if (tokens.refresh) {
          this.tokenStorage.setRefresh(tokens.refresh);
        }
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
    if (event.key !== null && event.key !== REFRESH_KEY && event.key !== ACCESS_KEY) {
      return;
    }
    if (!this.tokenStorage.hasRefresh()) {
      // Logged out elsewhere (storage is already empty): drop our user.
      if (this._currentUser() !== null) {
        this._currentUser.set(null);
        this.router.navigate(['/login']);
      }
      return;
    }
    if (event.key === REFRESH_KEY && this._currentUser() === null) {
      // Signed in from another tab: pick the session up here too.
      this.refreshMe();
    }
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
      .authEmailConfirmCreate({ emailConfirmRequest: payload })
      .pipe(switchMap((res) => this.loginWithTokens(res.access, res.refresh)));
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
      .authPasswordResetConfirmCreate({ passwordResetConfirmRequest: payload })
      .pipe(switchMap((res) => this.loginWithTokens(res.access, res.refresh)));
  }

  /**
   * Change the signed-in user's password. The backend revokes EVERY refresh
   * token of the user (other devices must sign in again) and returns a fresh
   * {access, refresh} pair for this session: store it right away, otherwise
   * the next refresh presents a blacklisted token and the user is logged out.
   * setTokens writes the access before the refresh, so the other tabs of this
   * browser (which read the same localStorage, see onStorageEvent) pick up a
   * matching pair and stay signed in too.
   */
  changePassword(payload: PasswordChangeRequest): Observable<PasswordChangeResponse> {
    return this.apiAuth
      .authPasswordChangeCreate({ passwordChangeRequest: payload })
      .pipe(tap((res) => this.tokenStorage.setTokens(res.access, res.refresh)));
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
   * Trade a magic-link token for a JWT pair, then adopt those tokens and load
   * /me/ via the same helper the password-login path uses — the resulting auth
   * state is indistinguishable from a regular sign-in.
   */
  exchangeMagicLink(token: string): Observable<Me> {
    const payload: MagicLinkExchangeRequestRequest = { token };
    return this.apiAuth
      .authMagicLinkExchangeCreate({ magicLinkExchangeRequestRequest: payload })
      .pipe(switchMap((res) => this.loginWithTokens(res.access, res.refresh)));
  }
}
