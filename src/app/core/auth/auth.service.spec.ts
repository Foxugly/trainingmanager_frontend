import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { TokenStorage } from './token.storage';
import { AuthService as ApiAuthService } from '../../api/api/auth.service';
import { MeService } from '../../api/api/me.service';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';

const fakeUser: Me = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Anderson',
  language: LanguageEnum.Fr,
  last_login: null,
  date_joined: '2026-01-01T00:00:00Z',
  is_staff: false,
  is_superuser: false,
  team_quota: { used: 0, max: 3, can_create: true },
};

describe('AuthService', () => {
  let service: AuthService;
  let tokenStorage: TokenStorage;
  let apiAuth: {
    authTokenCreate: ReturnType<typeof vi.fn>;
    authTokenRefreshCreate: ReturnType<typeof vi.fn>;
  };
  let meService: { meRetrieve: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    apiAuth = { authTokenCreate: vi.fn(), authTokenRefreshCreate: vi.fn() };
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

    const emitted = await new Promise<Me>((resolve) => service.login('alice', 'pw').subscribe(resolve));

    expect(apiAuth.authTokenCreate).toHaveBeenCalledWith({ username: 'alice', password: 'pw' });
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

  it('logout() clears tokens, resets currentUser, and navigates to /login', async () => {
    apiAuth.authTokenCreate.mockReturnValue(of({ access: 'a', refresh: 'r' }));
    meService.meRetrieve.mockReturnValue(of(fakeUser));
    await new Promise((resolve) => service.login('alice', 'pw').subscribe(resolve));
    expect(service.currentUser()).toEqual(fakeUser);

    service.logout();

    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('refresh() persists the new access token', async () => {
    tokenStorage.setRefresh('old-refresh');
    apiAuth.authTokenRefreshCreate.mockReturnValue(of({ access: 'new-access', refresh: 'old-refresh' }));

    await new Promise((resolve) => service.refresh().subscribe(resolve));

    expect(apiAuth.authTokenRefreshCreate).toHaveBeenCalledWith({ refresh: 'old-refresh' });
    expect(tokenStorage.getAccess()).toBe('new-access');
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
});
