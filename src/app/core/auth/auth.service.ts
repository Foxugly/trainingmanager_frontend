import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { TokenStorage } from './token.storage';
import { AuthService as ApiAuthService } from '../../api/api/auth.service';
import { MeService } from '../../api/api/me.service';
import { EmailConfirmRequest } from '../../api/model/email-confirm-request';
import { EmailResendRequest } from '../../api/model/email-resend-request';
import { MagicLinkExchangeRequestRequest } from '../../api/model/magic-link-exchange-request-request';
import { MagicLinkRequestRequest } from '../../api/model/magic-link-request-request';
import { MagicLinkRequestResponse } from '../../api/model/magic-link-request-response';
import { Me } from '../../api/model/me';
import { PasswordResetConfirmRequest } from '../../api/model/password-reset-confirm-request';
import { PasswordResetConfirmResponse } from '../../api/model/password-reset-confirm-response';
import { PasswordResetRequest } from '../../api/model/password-reset-request';
import { PasswordResetRequestResponse } from '../../api/model/password-reset-request-response';
import { Register } from '../../api/model/register';
import { TokenRefresh } from '../../api/model/token-refresh';
import { VerifiedTokenObtainPairRequest } from '../../api/model/verified-token-obtain-pair-request';

export interface RegisterResponse {
  readonly detail: string;
  readonly code: 'registration_pending_verification';
  readonly username: string;
  readonly email: string;
}

export interface EmailConfirmResponse {
  readonly access: string;
  readonly refresh: string;
  readonly user: Me;
}

export interface EmailResendResponse {
  readonly detail: string;
  readonly code?: string;
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

  bootstrap(): Observable<boolean> {
    if (!this.tokenStorage.hasRefresh()) {
      return of(false);
    }
    return this.refresh().pipe(
      switchMap(() => this.fetchMe()),
      map(() => true),
      catchError(() => {
        this.tokenStorage.clear();
        this._currentUser.set(null);
        return of(false);
      }),
    );
  }

  login(username: string, password: string, remember = false): Observable<Me> {
    const payload: VerifiedTokenObtainPairRequest = { username, password, remember };
    return this.apiAuth.authTokenCreate({ verifiedTokenObtainPairRequest: payload }).pipe(
      tap((tokens) => this.tokenStorage.setTokens(tokens.access, tokens.refresh)),
      switchMap(() => this.fetchMe()),
    );
  }

  loginWithTokens(access: string, refresh: string): Observable<Me> {
    this.tokenStorage.setTokens(access, refresh);
    return this.fetchMe();
  }

  logout(): void {
    this.tokenStorage.clear();
    this._currentUser.set(null);
    this.router.navigate(['/login']);
  }

  refresh(): Observable<TokenRefresh> {
    const refreshToken = this.tokenStorage.getRefresh();
    if (!refreshToken) {
      return throwError(() => new Error('NO_REFRESH_TOKEN'));
    }
    const payload = { refresh: refreshToken };
    return this.apiAuth.authTokenRefreshCreate({ tokenRefreshRequest: payload }).pipe(
      tap((tokens) => {
        if (tokens.access) {
          this.tokenStorage.setAccess(tokens.access);
        }
        if (tokens.refresh) {
          this.tokenStorage.setRefresh(tokens.refresh);
        }
      }),
    );
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

  register(payload: Register): Observable<RegisterResponse> {
    return this.apiAuth.authRegisterCreate({ registerRequest: payload }) as unknown as Observable<RegisterResponse>;
  }

  confirmEmail(key: string): Observable<Me> {
    const payload: EmailConfirmRequest = { key };
    return (this.apiAuth.authEmailConfirmCreate({ emailConfirmRequest: payload }) as unknown as Observable<EmailConfirmResponse>).pipe(
      switchMap((res) => this.loginWithTokens(res.access, res.refresh)),
    );
  }

  resendEmail(email: string): Observable<EmailResendResponse> {
    const payload: EmailResendRequest = { email };
    return this.apiAuth.authEmailResendCreate({ emailResendRequest: payload }) as unknown as Observable<EmailResendResponse>;
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
   * Request a passwordless sign-in email. The backend always answers 200 with
   * the same body (no user enumeration); the caller shows a neutral message.
   */
  requestMagicLink(email: string): Observable<MagicLinkRequestResponse> {
    const payload: MagicLinkRequestRequest = { email };
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
