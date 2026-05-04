import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { TokenStorage } from './token.storage';
import { AuthService as ApiAuthService } from '../../api/api/auth.service';
import { MeService } from '../../api/api/me.service';
import { EmailConfirm } from '../../api/model/email-confirm';
import { EmailResend } from '../../api/model/email-resend';
import { Me } from '../../api/model/me';
import { Register } from '../../api/model/register';
import { TokenRefresh } from '../../api/model/token-refresh';
import { VerifiedTokenObtainPair } from '../../api/model/verified-token-obtain-pair';

interface TokenPair {
  readonly access: string;
  readonly refresh: string;
}

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

  login(username: string, password: string): Observable<Me> {
    const payload: VerifiedTokenObtainPair = { username, password };
    return (this.apiAuth.authTokenCreate(payload) as unknown as Observable<TokenPair>).pipe(
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
    const payload = { refresh: refreshToken } as unknown as TokenRefresh;
    return this.apiAuth.authTokenRefreshCreate(payload).pipe(
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

  setCurrentUser(user: Me): void {
    this._currentUser.set(user);
  }

  register(payload: Register): Observable<RegisterResponse> {
    return this.apiAuth.authRegisterCreate(payload) as unknown as Observable<RegisterResponse>;
  }

  confirmEmail(key: string): Observable<Me> {
    const payload: EmailConfirm = { key };
    return (this.apiAuth.authEmailConfirmCreate(payload) as unknown as Observable<EmailConfirmResponse>).pipe(
      switchMap((res) => this.loginWithTokens(res.access, res.refresh)),
    );
  }

  resendEmail(email: string): Observable<EmailResendResponse> {
    const payload: EmailResend = { email };
    return this.apiAuth.authEmailResendCreate(payload) as unknown as Observable<EmailResendResponse>;
  }
}
