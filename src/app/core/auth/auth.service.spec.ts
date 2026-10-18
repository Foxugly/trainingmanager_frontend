import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COOKIE_AUTH, SKIP_REFRESH_ON_401 } from './auth-context';
import {
  AuthService,
  NO_REFRESH_TOKEN,
  REFRESH_LOCK_NAME,
  isSessionEndingError,
} from './auth.service';
import {
  LEGACY_ACCESS_KEY,
  LEGACY_REFRESH_KEY,
  SESSION_HINT_KEY,
  TokenStorage,
} from './token.storage';
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

/** The options argument (4th) of a generated-client call. */
function optionsOf(mock: ReturnType<typeof vi.fn>, call = 0) {
  return mock.mock.calls[call][3] as { context: { get: (token: unknown) => unknown } };
}

/** No token (access, refresh, legacy) is ever left in localStorage. */
function expectNoTokenInStorage(): void {
  const values = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`);
  expect(values.join(';')).not.toMatch(/a1|a2|a-new|r1|legacy-r|token/);
}

describe('AuthService', () => {
  let service: AuthService;
  let tokenStorage: TokenStorage;
  let apiAuth: {
    authTokenCreate: ReturnType<typeof vi.fn>;
    authTokenRefreshCreate: ReturnType<typeof vi.fn>;
    authLogoutCreate: ReturnType<typeof vi.fn>;
    authEmailConfirmCreate: ReturnType<typeof vi.fn>;
    authMagicLinkExchangeCreate: ReturnType<typeof vi.fn>;
    authPasswordResetCreate: ReturnType<typeof vi.fn>;
    authPasswordResetConfirmCreate: ReturnType<typeof vi.fn>;
    authPasswordChangeCreate: ReturnType<typeof vi.fn>;
  };
  let meService: { meRetrieve: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    apiAuth = {
      authTokenCreate: vi.fn(),
      authTokenRefreshCreate: vi.fn(),
      authLogoutCreate: vi.fn(),
      authEmailConfirmCreate: vi.fn(),
      authMagicLinkExchangeCreate: vi.fn(),
      authPasswordResetCreate: vi.fn(),
      authPasswordResetConfirmCreate: vi.fn(),
      authPasswordChangeCreate: vi.fn(),
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

  async function signIn(): Promise<void> {
    apiAuth.authTokenCreate.mockReturnValue(of({ access: 'a1' }));
    meService.meRetrieve.mockReturnValue(of(fakeUser));
    await new Promise((resolve) => service.login('alice@example.com', 'pw').subscribe(resolve));
  }

  describe('login()', () => {
    it('uses cookie mode, keeps the access token in memory only and sets the hint', async () => {
      await signIn();

      const [params] = apiAuth.authTokenCreate.mock.calls[0];
      expect(params).toEqual({
        verifiedTokenObtainPairRequest: {
          email: 'alice@example.com',
          password: 'pw',
          remember: false,
        },
      });
      expect(optionsOf(apiAuth.authTokenCreate).context.get(COOKIE_AUTH)).toBe(true);
      expect(tokenStorage.getAccess()).toBe('a1');
      expect(localStorage.getItem(SESSION_HINT_KEY)).not.toBeNull();
      expectNoTokenInStorage();
      expect(service.currentUser()).toEqual(fakeUser);
      expect(service.isAuthenticated()).toBe(true);
    });

    it('forwards remember (30-day cookie server-side)', async () => {
      apiAuth.authTokenCreate.mockReturnValue(of({ access: 'a1' }));
      meService.meRetrieve.mockReturnValue(of(fakeUser));
      await new Promise((resolve) =>
        service.login('alice@example.com', 'pw', true).subscribe(resolve),
      );

      expect(apiAuth.authTokenCreate.mock.calls[0][0].verifiedTokenObtainPairRequest.remember).toBe(
        true,
      );
    });

    it('drops tokens left by the pre-cookie SPA', async () => {
      localStorage.setItem(LEGACY_ACCESS_KEY, 'legacy-a');
      localStorage.setItem(LEGACY_REFRESH_KEY, 'legacy-r');
      await signIn();
      expect(localStorage.getItem(LEGACY_ACCESS_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBeNull();
    });

    it('failure leaves no session and propagates the error', async () => {
      apiAuth.authTokenCreate.mockReturnValue(throwError(() => ({ status: 401 })));

      await new Promise<void>((resolve, reject) => {
        service.login('alice', 'wrong').subscribe({
          next: () => reject(new Error('login should not have succeeded')),
          error: () => resolve(),
        });
      });

      expect(tokenStorage.getAccess()).toBeNull();
      expect(tokenStorage.hasSession()).toBe(false);
      expect(service.currentUser()).toBeNull();
    });
  });

  describe('other sign-in flows use cookie mode', () => {
    beforeEach(() => meService.meRetrieve.mockReturnValue(of(fakeUser)));

    it('confirmPasswordReset()', async () => {
      apiAuth.authPasswordResetConfirmCreate.mockReturnValue(
        of({ access: 'a-new', user: fakeUser }),
      );

      const me = await new Promise<Me>((resolve) =>
        service.confirmPasswordReset('7-tok', 'longenough').subscribe(resolve),
      );

      expect(apiAuth.authPasswordResetConfirmCreate.mock.calls[0][0]).toEqual({
        passwordResetConfirmRequest: { key: '7-tok', new_password: 'longenough' },
      });
      expect(optionsOf(apiAuth.authPasswordResetConfirmCreate).context.get(COOKIE_AUTH)).toBe(true);
      expect(tokenStorage.getAccess()).toBe('a-new');
      expect(tokenStorage.hasHint()).toBe(true);
      expect(me).toEqual(fakeUser);
    });

    it('confirmEmail()', async () => {
      apiAuth.authEmailConfirmCreate.mockReturnValue(of({ access: 'a-new', user: fakeUser }));
      await new Promise((resolve) => service.confirmEmail('k').subscribe(resolve));
      expect(optionsOf(apiAuth.authEmailConfirmCreate).context.get(COOKIE_AUTH)).toBe(true);
      expect(tokenStorage.getAccess()).toBe('a-new');
    });

    it('exchangeMagicLink()', async () => {
      apiAuth.authMagicLinkExchangeCreate.mockReturnValue(of({ access: 'a-new' }));
      await new Promise((resolve) => service.exchangeMagicLink('t').subscribe(resolve));
      expect(optionsOf(apiAuth.authMagicLinkExchangeCreate).context.get(COOKIE_AUTH)).toBe(true);
      expect(tokenStorage.getAccess()).toBe('a-new');
      expectNoTokenInStorage();
    });
  });

  describe('logout()', () => {
    it('revokes the cookie server-side (cookie mode, no refresh on 401), then clears', async () => {
      await signIn();
      apiAuth.authLogoutCreate.mockReturnValue(of(null));

      service.logout();

      const [params] = apiAuth.authLogoutCreate.mock.calls[0];
      expect(params).toEqual({ logoutRequest: {} });
      const { context } = optionsOf(apiAuth.authLogoutCreate);
      expect(context.get(COOKIE_AUTH)).toBe(true);
      expect(context.get(SKIP_REFRESH_ON_401)).toBe(true);
      expect(tokenStorage.getAccess()).toBeNull();
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('works without an access token (expired / reloaded tab)', () => {
      tokenStorage.announceSession();
      apiAuth.authLogoutCreate.mockReturnValue(of(null));
      service.logout();
      expect(apiAuth.authLogoutCreate).toHaveBeenCalledTimes(1);
      expect(tokenStorage.hasSession()).toBe(false);
    });

    it('revokes a legacy token that was never migrated', () => {
      localStorage.setItem(LEGACY_REFRESH_KEY, 'legacy-r');
      apiAuth.authLogoutCreate.mockReturnValue(of(null));
      service.logout();
      expect(apiAuth.authLogoutCreate.mock.calls[0][0]).toEqual({
        logoutRequest: { refresh: 'legacy-r' },
      });
      expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBeNull();
    });

    it('keeps the session until the server answers, then clears', async () => {
      await signIn();
      const server = new Subject<unknown>();
      apiAuth.authLogoutCreate.mockReturnValue(server.asObservable());

      service.logout();
      expect(tokenStorage.hasHint()).toBe(true);

      server.next(null);
      server.complete();
      expect(tokenStorage.hasHint()).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('clears the local session even when the server call fails', async () => {
      await signIn();
      apiAuth.authLogoutCreate.mockReturnValue(throwError(() => ({ status: 502 })));
      service.logout();
      expect(tokenStorage.hasSession()).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('clearSession() clears locally without any server call', async () => {
      await signIn();
      service.clearSession();
      expect(apiAuth.authLogoutCreate).not.toHaveBeenCalled();
      expect(tokenStorage.hasSession()).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('refresh()', () => {
    it('refreshes through the cookie (empty body, cookie mode) and keeps the access in memory', async () => {
      tokenStorage.announceSession();
      apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a2' }));

      await new Promise((resolve) => service.refresh().subscribe(resolve));

      expect(apiAuth.authTokenRefreshCreate.mock.calls[0][0]).toEqual({ tokenRefreshRequest: {} });
      expect(optionsOf(apiAuth.authTokenRefreshCreate).context.get(COOKIE_AUTH)).toBe(true);
      expect(tokenStorage.getAccess()).toBe('a2');
      expectNoTokenInStorage();
    });

    it('shares a single in-flight request across concurrent callers', () => {
      tokenStorage.announceSession();
      const backend = new Subject<TokenRefresh>();
      apiAuth.authTokenRefreshCreate.mockReturnValue(backend.asObservable());

      const seen: TokenRefresh[] = [];
      service.refresh().subscribe((t) => seen.push(t));
      service.refresh().subscribe((t) => seen.push(t));
      // One POST only: the second caller would present the soon-rotated cookie.
      expect(apiAuth.authTokenRefreshCreate).toHaveBeenCalledTimes(1);

      backend.next({ access: 'a2' });
      backend.complete();
      expect(seen).toHaveLength(2);

      apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a3' }));
      service.refresh().subscribe();
      expect(apiAuth.authTokenRefreshCreate).toHaveBeenCalledTimes(2);
    });

    it('fails with NO_REFRESH_TOKEN when there is no session', async () => {
      const err = await new Promise<Error>((resolve) =>
        service.refresh().subscribe({ error: resolve }),
      );
      expect(err.message).toBe(NO_REFRESH_TOKEN);
      expect(apiAuth.authTokenRefreshCreate).not.toHaveBeenCalled();
    });
  });

  describe('legacy token migration', () => {
    beforeEach(() => {
      localStorage.setItem(LEGACY_ACCESS_KEY, 'legacy-a');
      localStorage.setItem(LEGACY_REFRESH_KEY, 'legacy-r');
      meService.meRetrieve.mockReturnValue(of(fakeUser));
    });

    it('presents the stored refresh once (cookie mode), then deletes it and sets the hint', async () => {
      apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a2' }));

      const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));

      expect(ok).toBe(true);
      expect(apiAuth.authTokenRefreshCreate.mock.calls[0][0]).toEqual({
        tokenRefreshRequest: { refresh: 'legacy-r' },
      });
      expect(optionsOf(apiAuth.authTokenRefreshCreate).context.get(COOKIE_AUTH)).toBe(true);
      expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_ACCESS_KEY)).toBeNull();
      expect(tokenStorage.hasHint()).toBe(true);
      expectNoTokenInStorage();

      // The next refresh uses the cookie only.
      service.refresh().subscribe();
      expect(apiAuth.authTokenRefreshCreate.mock.calls[1][0]).toEqual({ tokenRefreshRequest: {} });
    });

    it('drops a rejected legacy token', async () => {
      apiAuth.authTokenRefreshCreate.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401 })),
      );
      const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));
      expect(ok).toBe(false);
      expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBeNull();
      expect(tokenStorage.hasSession()).toBe(false);
    });

    it('keeps the legacy token on a network error / 5xx', async () => {
      apiAuth.authTokenRefreshCreate.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 502 })),
      );
      await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));
      expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBe('legacy-r');
    });
  });

  describe('bootstrap() (silent restore)', () => {
    it('makes no call for an anonymous visitor (no hint)', async () => {
      const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));
      expect(ok).toBe(false);
      expect(apiAuth.authTokenRefreshCreate).not.toHaveBeenCalled();
      expect(meService.meRetrieve).not.toHaveBeenCalled();
    });

    it('restores the session from the cookie when the hint exists', async () => {
      tokenStorage.announceSession();
      apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a2' }));
      meService.meRetrieve.mockReturnValue(of(fakeUser));

      const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));

      expect(ok).toBe(true);
      expect(tokenStorage.getAccess()).toBe('a2');
      expect(service.currentUser()).toEqual(fakeUser);
    });

    for (const status of [401, 403]) {
      it(`ends the session when the cookie is rejected (${status})`, async () => {
        tokenStorage.announceSession();
        apiAuth.authTokenRefreshCreate.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status })),
        );
        const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));
        expect(ok).toBe(false);
        expect(tokenStorage.hasHint()).toBe(false);
        expect(service.currentUser()).toBeNull();
      });
    }

    for (const status of [0, 502]) {
      it(`keeps the hint when the refresh fails with ${status}`, async () => {
        tokenStorage.announceSession();
        apiAuth.authTokenRefreshCreate.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status, statusText: 'x' })),
        );
        const ok = await new Promise<boolean>((resolve) => service.bootstrap().subscribe(resolve));
        expect(ok).toBe(false);
        expect(tokenStorage.hasHint()).toBe(true);
        expect(service.currentUser()).toBeNull();
      });
    }
  });

  describe('changePassword()', () => {
    it('keeps the fresh access token (the new refresh is in the cookie) and tells the other tabs', async () => {
      await signIn();
      const hintBefore = localStorage.getItem(SESSION_HINT_KEY);
      apiAuth.authPasswordChangeCreate.mockReturnValue(
        of({ detail: 'Password updated.', access: 'a-new' }),
      );
      vi.useFakeTimers({ now: Date.now() + 1000, toFake: ['Date'] });
      try {
        await new Promise((resolve) =>
          service
            .changePassword({ current_password: 'old', new_password: 'newpass1' })
            .subscribe(resolve),
        );
      } finally {
        vi.useRealTimers();
      }

      expect(apiAuth.authPasswordChangeCreate.mock.calls[0][0]).toEqual({
        passwordChangeRequest: { current_password: 'old', new_password: 'newpass1' },
      });
      expect(optionsOf(apiAuth.authPasswordChangeCreate).context.get(COOKIE_AUTH)).toBe(true);
      expect(tokenStorage.getAccess()).toBe('a-new');
      expect(localStorage.getItem(SESSION_HINT_KEY)).not.toBe(hintBefore);
      expectNoTokenInStorage();
      expect(service.currentUser()).toEqual(fakeUser);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keeps the current access token when the change is refused', async () => {
      await signIn();
      apiAuth.authPasswordChangeCreate.mockReturnValue(
        throwError(() => ({ status: 400, error: { code: 'current_password_invalid' } })),
      );
      await new Promise<void>((resolve) =>
        service
          .changePassword({ current_password: 'bad', new_password: 'newpass1' })
          .subscribe({ error: () => resolve() }),
      );
      expect(tokenStorage.getAccess()).toBe('a1');
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
      passwordResetRequestRequest: { email: 'a@b.com', turnstile_token: 'tok' },
    });
    expect(res).toEqual({ detail: 'ok', code: 'password_reset_processed' });
  });

  describe('cross-tab refresh (Web Lock)', () => {
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
      tokenStorage.announceSession();
      apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a2' }));

      const tokens = await new Promise((resolve) => service.refresh().subscribe(resolve));

      expect(lockNames).toEqual([REFRESH_LOCK_NAME]);
      expect(tokens).toEqual({ access: 'a2' });
    });

    it('fails with NO_REFRESH_TOKEN when another tab logged out while waiting', async () => {
      tokenStorage.announceSession();
      installLocks(() => localStorage.removeItem(SESSION_HINT_KEY));

      const err = await new Promise<Error>((resolve) =>
        service.refresh().subscribe({ error: resolve }),
      );

      expect(err.message).toBe(NO_REFRESH_TOKEN);
      expect(apiAuth.authTokenRefreshCreate).not.toHaveBeenCalled();
    });
  });

  describe('storage events (other tabs)', () => {
    it('drops the user and goes to /login when another tab logged out (hint removed)', async () => {
      await signIn();
      localStorage.removeItem(SESSION_HINT_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_HINT_KEY, newValue: null }));

      expect(service.currentUser()).toBeNull();
      expect(tokenStorage.getAccess()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('restores from the shared cookie when another tab signed in', () => {
      apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'a2' }));
      meService.meRetrieve.mockReturnValue(of(fakeUser));
      localStorage.setItem(SESSION_HINT_KEY, '1');
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_HINT_KEY, newValue: '1' }));

      expect(apiAuth.authTokenRefreshCreate).toHaveBeenCalledTimes(1);
      expect(tokenStorage.getAccess()).toBe('a2');
      expect(service.currentUser()).toEqual(fakeUser);
    });

    it('keeps a signed-in tab signed in when that re-restore hits a 5xx', async () => {
      await signIn();
      apiAuth.authTokenRefreshCreate.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 502 })),
      );
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_HINT_KEY, newValue: '2' }));

      expect(service.currentUser()).toEqual(fakeUser);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('ignores unrelated keys', () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tm_theme', newValue: 'dark' }));
      expect(meService.meRetrieve).not.toHaveBeenCalled();
      expect(apiAuth.authTokenRefreshCreate).not.toHaveBeenCalled();
    });
  });

  it('isSessionEndingError: only 401/403 and a missing session end the session', () => {
    expect(isSessionEndingError(new HttpErrorResponse({ status: 401 }))).toBe(true);
    expect(isSessionEndingError(new HttpErrorResponse({ status: 403 }))).toBe(true);
    expect(isSessionEndingError(new Error(NO_REFRESH_TOKEN))).toBe(true);
    expect(isSessionEndingError(new HttpErrorResponse({ status: 0 }))).toBe(false);
    expect(isSessionEndingError(new HttpErrorResponse({ status: 502 }))).toBe(false);
    expect(isSessionEndingError(new Error('Timeout'))).toBe(false);
  });
});
