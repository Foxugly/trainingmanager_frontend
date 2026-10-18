import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKIP_REFRESH_ON_401 } from './auth-context';
import {
  AuthService,
  NO_REFRESH_TOKEN,
  REFRESH_LOCK_NAME,
  isSessionEndingError,
  jwtExp,
} from './auth.service';
import { REFRESH_KEY, TokenStorage } from './token.storage';
import { AuthService as ApiAuthService } from '../../api/api/auth.service';
import { MeService } from '../../api/api/me.service';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { TokenRefresh } from '../../api/model/token-refresh';

const fakeUser: Me = {
  id: 1,
  email: 'alice@example.com',
  email_confirmed: true,
  first_name: 'Alice',
  last_name: 'Anderson',
  language: LanguageEnum.Fr,
  last_login: null,
  date_joined: '2026-01-01T00:00:00Z',
  is_staff: false,
  is_superuser: false,
  member_id: null,
  team_quota: { used: 0, max: 3, can_create: true },
  subscription_bypass: false,
  calendar_token: 'tok-test',
};

describe('AuthService', () => {
  let service: AuthService;
  let tokenStorage: TokenStorage;
  let apiAuth: {
    authTokenCreate: ReturnType<typeof vi.fn>;
    authTokenRefreshCreate: ReturnType<typeof vi.fn>;
    authLogoutCreate: ReturnType<typeof vi.fn>;
    authPasswordResetCreate: ReturnType<typeof vi.fn>;
    authPasswordResetConfirmCreate: ReturnType<typeof vi.fn>;
  };
  let meService: { meRetrieve: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    apiAuth = {
      authTokenCreate: vi.fn(),
      authTokenRefreshCreate: vi.fn(),
      authLogoutCreate: vi.fn(),
      authPasswordResetCreate: vi.fn(),
      authPasswordResetConfirmCreate: vi.fn(),
    };
    meService = { meRetrieve: vi.fn() };
    router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        TokenStorage,
        AuthService,
        { provide: ApiAuthService, useValue: apiAuth },
        { provide: MeService, useValue: meService },
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(AuthService);
    tokenStorage = TestBed.inject(TokenStorage);
  });

  it('login() stores tokens, fetches Me, and exposes currentUser', async () => {
    apiAuth.authTokenCreate.mockReturnValue(of({ access: 'a1', refresh: 'r1' }));
    meService.meRetrieve.mockReturnValue(of(fakeUser));

    const emitted = await new Promise<Me>((resolve) =>
      service.login('alice@example.com', 'pw').subscribe(resolve),
    );

    expect(apiAuth.authTokenCreate).toHaveBeenCalledWith({
      verifiedTokenObtainPairRequest: {
        email: 'alice@example.com',
        password: 'pw',
        remember: false,
      },
    });
    expect(tokenStorage.getAccess()).toBe('a1');
    expect(tokenStorage.getRefresh()).toBe('r1');
    expect(service.currentUser()).toEqual(fakeUser);
    expect(service.isAuthenticated()).toBe(true);
    expect(emitted).toEqual(fakeUser);
  });

  it('login() failure leaves currentUser null and propagates the error', async () => {
    apiAuth.authTokenCreate.mockReturnValue(throwError(() => ({ status: 401 })));

    await new Promise<void>((resolve, reject) => {
      service.login('alice', 'wrong').subscribe({
        next: () => reject(new Error('login should not have succeeded')),
        error: () => resolve(),
      });
    });

    expect(tokenStorage.getAccess()).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('logout() revokes the refresh server-side, then clears tokens, resets currentUser, navigates to /login', async () => {
    apiAuth.authTokenCreate.mockReturnValue(of({ access: 'a', refresh: 'r' }));
    apiAuth.authLogoutCreate.mockReturnValue(of(null));
    meService.meRetrieve.mockReturnValue(of(fakeUser));
    await new Promise((resolve) => service.login('alice', 'pw').subscribe(resolve));
    expect(service.currentUser()).toEqual(fakeUser);

    service.logout();

    expect(apiAuth.authLogoutCreate).toHaveBeenCalledTimes(1);
    const [params, , , options] = apiAuth.authLogoutCreate.mock.calls[0];
    expect(params).toEqual({ logoutRequest: { refresh: 'r' } });
    // A 401 on the logout call must not trigger a refresh.
    expect(options.context.get(SKIP_REFRESH_ON_401)).toBe(true);

    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('refresh() persists the new access token', async () => {
    tokenStorage.setRefresh('old-refresh');
    apiAuth.authTokenRefreshCreate.mockReturnValue(
      of({ access: 'new-access', refresh: 'old-refresh' }),
    );

    await new Promise((resolve) => service.refresh().subscribe(resolve));

    expect(apiAuth.authTokenRefreshCreate).toHaveBeenCalledWith({
      tokenRefreshRequest: { refresh: 'old-refresh' },
    });
    expect(tokenStorage.getAccess()).toBe('new-access');
  });

  it('refresh() shares a single in-flight request across concurrent callers and persists the rotated token', () => {
    tokenStorage.setRefresh('old-refresh');
    const backend = new Subject<TokenRefresh>();
    apiAuth.authTokenRefreshCreate.mockReturnValue(backend.asObservable());

    const seen: TokenRefresh[] = [];
    service.refresh().subscribe((t) => seen.push(t));
    service.refresh().subscribe((t) => seen.push(t));

    // Both callers share the one in-flight POST — only one hits the backend,
    // so the second never presents the soon-to-be-blacklisted token.
    expect(apiAuth.authTokenRefreshCreate).toHaveBeenCalledTimes(1);

    backend.next({ access: 'new-access', refresh: 'rotated-refresh' });
    backend.complete();

    expect(seen).toHaveLength(2);
    expect(tokenStorage.getAccess()).toBe('new-access');
    expect(tokenStorage.getRefresh()).toBe('rotated-refresh');

    // After completion the shared observable is released, so a later refresh
    // issues a fresh request.
    apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a3', refresh: 'r3' }));
    service.refresh().subscribe();
    expect(apiAuth.authTokenRefreshCreate).toHaveBeenCalledTimes(2);
  });

  it('refresh() throws synchronously when no refresh token is stored', async () => {
    await new Promise<void>((resolve, reject) => {
      service.refresh().subscribe({
        next: () => reject(new Error('refresh should not have succeeded')),
        error: (err: Error) => {
          expect(err.message).toBe('NO_REFRESH_TOKEN');
          resolve();
        },
      });
    });

    expect(apiAuth.authTokenRefreshCreate).not.toHaveBeenCalled();
  });

  it('bootstrap() returns true and hydrates currentUser when refresh + fetchMe succeed', async () => {
    tokenStorage.setRefresh('r1');
    apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a2', refresh: 'r1' }));
    meService.meRetrieve.mockReturnValue(of(fakeUser));

    const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));

    expect(ok).toBe(true);
    expect(service.currentUser()).toEqual(fakeUser);
  });

  it('bootstrap() short-circuits to false when no refresh token is stored (no API calls)', async () => {
    const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));

    expect(ok).toBe(false);
    expect(apiAuth.authTokenRefreshCreate).not.toHaveBeenCalled();
    expect(meService.meRetrieve).not.toHaveBeenCalled();
  });

  it('bootstrap() with a stale refresh token clears storage and returns false', async () => {
    tokenStorage.setRefresh('stale');
    apiAuth.authTokenRefreshCreate.mockReturnValue(throwError(() => ({ status: 401 })));

    const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));

    expect(ok).toBe(false);
    expect(tokenStorage.getRefresh()).toBeNull();
    expect(tokenStorage.getAccess()).toBeNull();
    expect(service.currentUser()).toBeNull();
  });

  it('login(remember=true) propagates remember to authTokenCreate payload', async () => {
    apiAuth.authTokenCreate.mockReturnValue(of({ access: 'a', refresh: 'r' }));
    meService.meRetrieve.mockReturnValue(of(fakeUser));

    await new Promise((resolve) =>
      service.login('alice@example.com', 'pw', true).subscribe(resolve),
    );

    expect(apiAuth.authTokenCreate).toHaveBeenCalledWith({
      verifiedTokenObtainPairRequest: {
        email: 'alice@example.com',
        password: 'pw',
        remember: true,
      },
    });
  });

  it('requestPasswordReset() forwards the body to authPasswordResetCreate', async () => {
    apiAuth.authPasswordResetCreate.mockReturnValue(
      of({ detail: 'ok', code: 'password_reset_processed' }),
    );

    const res = await new Promise((resolve) =>
      service.requestPasswordReset({ email: 'a@b.com', turnstile_token: 'tok' }).subscribe(resolve),
    );

    expect(apiAuth.authPasswordResetCreate).toHaveBeenCalledWith({
      passwordResetRequestRequest: {
        email: 'a@b.com',
        turnstile_token: 'tok',
      },
    });
    expect(res).toEqual({ detail: 'ok', code: 'password_reset_processed' });
  });

  it('confirmPasswordReset() chains tokens onto loginWithTokens and exposes Me', async () => {
    apiAuth.authPasswordResetConfirmCreate.mockReturnValue(
      of({ access: 'a-new', refresh: 'r-new', user: fakeUser }),
    );
    meService.meRetrieve.mockReturnValue(of(fakeUser));

    const me = await new Promise<Me>((resolve) =>
      service.confirmPasswordReset('7-tok', 'longenough').subscribe(resolve),
    );

    expect(apiAuth.authPasswordResetConfirmCreate).toHaveBeenCalledWith({
      passwordResetConfirmRequest: {
        key: '7-tok',
        new_password: 'longenough',
      },
    });
    expect(tokenStorage.getAccess()).toBe('a-new');
    expect(tokenStorage.getRefresh()).toBe('r-new');
    expect(me).toEqual(fakeUser);
    expect(service.currentUser()).toEqual(fakeUser);
  });

  describe('logout() server revocation', () => {
    it('keeps the tokens until the server answers, then clears', () => {
      tokenStorage.setTokens('a', 'r');
      const server = new Subject<unknown>();
      apiAuth.authLogoutCreate.mockReturnValue(server.asObservable());

      service.logout();
      expect(tokenStorage.getRefresh()).toBe('r');

      server.next(null);
      server.complete();
      expect(tokenStorage.getRefresh()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('clears the local session even when the server call fails', () => {
      tokenStorage.setTokens('a', 'r');
      apiAuth.authLogoutCreate.mockReturnValue(throwError(() => ({ status: 502 })));

      service.logout();

      expect(tokenStorage.getAccess()).toBeNull();
      expect(tokenStorage.getRefresh()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('skips the server call when there is no session to revoke', () => {
      tokenStorage.setRefresh('r'); // no access token: the call could not authenticate
      service.logout();
      expect(apiAuth.authLogoutCreate).not.toHaveBeenCalled();
      expect(tokenStorage.getRefresh()).toBeNull();
    });

    it('clearSession() clears locally without any server call', () => {
      tokenStorage.setTokens('a', 'r');
      service.clearSession();
      expect(apiAuth.authLogoutCreate).not.toHaveBeenCalled();
      expect(tokenStorage.getRefresh()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('bootstrap() resilience', () => {
    const jwt = (exp: number) => `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;

    it('skips the refresh when the stored access token is still valid', async () => {
      tokenStorage.setTokens(jwt(Math.floor(Date.now() / 1000) + 600), 'r1');
      meService.meRetrieve.mockReturnValue(of(fakeUser));

      const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));

      expect(ok).toBe(true);
      expect(apiAuth.authTokenRefreshCreate).not.toHaveBeenCalled();
    });

    it('refreshes when the stored access token is expired', async () => {
      tokenStorage.setTokens(jwt(Math.floor(Date.now() / 1000) - 10), 'r1');
      apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a2', refresh: 'r2' }));
      meService.meRetrieve.mockReturnValue(of(fakeUser));

      await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));

      expect(apiAuth.authTokenRefreshCreate).toHaveBeenCalledTimes(1);
      expect(tokenStorage.getRefresh()).toBe('r2');
    });

    for (const status of [0, 502]) {
      it(`keeps the tokens when the refresh fails with ${status}`, async () => {
        tokenStorage.setRefresh('r1');
        apiAuth.authTokenRefreshCreate.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status, statusText: 'x' })),
        );

        const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));

        expect(ok).toBe(false);
        expect(tokenStorage.getRefresh()).toBe('r1');
        expect(service.currentUser()).toBeNull();
      });
    }
  });

  describe('cross-tab refresh', () => {
    let lockNames: string[];
    const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');

    beforeEach(() => {
      lockNames = [];
    });

    afterEach(() => {
      if (originalLocks) {
        Object.defineProperty(navigator, 'locks', originalLocks);
      } else {
        delete (navigator as unknown as { locks?: unknown }).locks;
      }
    });

    /** Fake Web Locks: runs `beforeGrant` (another tab's work) then the callback. */
    function installLocks(beforeGrant: () => void = () => {}): void {
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: {
          request: (name: string, cb: () => Promise<unknown>) => {
            lockNames.push(name);
            beforeGrant();
            return cb();
          },
        },
      });
    }

    it('runs the rotation under the shared Web Lock', async () => {
      installLocks();
      tokenStorage.setRefresh('r1');
      apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a2', refresh: 'r2' }));

      const tokens = await new Promise((resolve) => service.refresh().subscribe(resolve));

      expect(lockNames).toEqual([REFRESH_LOCK_NAME]);
      expect(tokens).toEqual({ access: 'a2', refresh: 'r2' });
      expect(tokenStorage.getRefresh()).toBe('r2');
    });

    it('adopts the pair another tab rotated while waiting for the lock (no POST)', async () => {
      tokenStorage.setTokens('a1', 'r1');
      installLocks(() => tokenStorage.setTokens('a-other', 'r-other'));

      const tokens = await new Promise((resolve) => service.refresh().subscribe(resolve));

      expect(apiAuth.authTokenRefreshCreate).not.toHaveBeenCalled();
      expect(tokens).toEqual({ access: 'a-other', refresh: 'r-other' });
    });

    it('fails with NO_REFRESH_TOKEN when another tab logged out while waiting', async () => {
      tokenStorage.setTokens('a1', 'r1');
      installLocks(() => tokenStorage.clear());

      const err = await new Promise<Error>((resolve) =>
        service.refresh().subscribe({ error: resolve }),
      );

      expect(err.message).toBe(NO_REFRESH_TOKEN);
      expect(apiAuth.authTokenRefreshCreate).not.toHaveBeenCalled();
    });
  });

  describe('storage events (other tabs)', () => {
    async function signIn(): Promise<void> {
      apiAuth.authTokenCreate.mockReturnValue(of({ access: 'a', refresh: 'r' }));
      meService.meRetrieve.mockReturnValue(of(fakeUser));
      await new Promise((resolve) => service.login('alice', 'pw').subscribe(resolve));
    }

    it('drops the user and goes to /login when another tab logged out', async () => {
      await signIn();
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: REFRESH_KEY, newValue: null }));

      expect(service.currentUser()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('keeps the user when another tab only rotated the tokens', async () => {
      await signIn();
      tokenStorage.setTokens('a2', 'r2');
      window.dispatchEvent(new StorageEvent('storage', { key: REFRESH_KEY, newValue: 'r2' }));

      expect(service.currentUser()).toEqual(fakeUser);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('loads /me/ when another tab signed in', () => {
      meService.meRetrieve.mockReturnValue(of(fakeUser));
      tokenStorage.setTokens('a', 'r');
      window.dispatchEvent(new StorageEvent('storage', { key: REFRESH_KEY, newValue: 'r' }));

      expect(service.currentUser()).toEqual(fakeUser);
    });

    it('ignores unrelated keys', () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tm_theme', newValue: 'dark' }));
      expect(meService.meRetrieve).not.toHaveBeenCalled();
    });
  });

  describe('helpers', () => {
    it('isSessionEndingError: only 401/403 and a missing refresh token end the session', () => {
      expect(isSessionEndingError(new HttpErrorResponse({ status: 401 }))).toBe(true);
      expect(isSessionEndingError(new HttpErrorResponse({ status: 403 }))).toBe(true);
      expect(isSessionEndingError(new Error(NO_REFRESH_TOKEN))).toBe(true);
      expect(isSessionEndingError(new HttpErrorResponse({ status: 0 }))).toBe(false);
      expect(isSessionEndingError(new HttpErrorResponse({ status: 502 }))).toBe(false);
      expect(isSessionEndingError(new Error('Timeout'))).toBe(false);
    });

    it('jwtExp decodes exp and tolerates garbage', () => {
      const token = `h.${btoa(JSON.stringify({ exp: 42 }))}.s`;
      expect(jwtExp(token)).toBe(42);
      expect(jwtExp('not-a-jwt')).toBeNull();
      expect(jwtExp('h.%%%.s')).toBeNull();
    });
  });
});
