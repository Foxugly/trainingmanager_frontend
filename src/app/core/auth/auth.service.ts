import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { TokenStorage } from './token.storage';
import { AuthService as ApiAuthService } from '../../api/api/auth.service';
import { MeService } from '../../api/api/me.service';
import { Me } from '../../api/model/me';
import { TokenObtainPair } from '../../api/model/token-obtain-pair';
import { TokenRefresh } from '../../api/model/token-refresh';

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
    const payload = { username, password } as unknown as TokenObtainPair;
    return this.apiAuth.authTokenCreate(payload).pipe(
      tap((tokens) => this.tokenStorage.setTokens(tokens.access, tokens.refresh)),
      switchMap(() => this.fetchMe()),
    );
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
}
