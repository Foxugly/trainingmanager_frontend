import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { SKIP_REFRESH_ON_401 } from './auth-context';
import { AuthService, NO_REFRESH_TOKEN } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { TokenStorage } from './token.storage';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenStorage: TokenStorage;
  let authMock: {
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    clearSession: ReturnType<typeof vi.fn>;
  };

  const apiUrl = `${environment.apiBase}/teams/`;
  const authUrl = `${environment.apiBase}/auth/token/`;
  const refreshUrl = `${environment.apiBase}/auth/token/refresh/`;
  const externalUrl = 'https://other.example.com/data';

  beforeEach(() => {
    localStorage.clear();
    authMock = { refresh: vi.fn(), logout: vi.fn(), clearSession: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        TokenStorage,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authMock },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStorage = TestBed.inject(TokenStorage);
  });

  afterEach(() => httpMock.verify());

  it('does not inject Authorization on API calls when no access token is stored', () => {
    http.get(apiUrl).subscribe();
    const req = httpMock.expectOne(apiUrl);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('injects Bearer Authorization on API calls when an access token is stored', () => {
    tokenStorage.setAccess('access-1');
    http.get(apiUrl).subscribe();
    const req = httpMock.expectOne(apiUrl);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({});
  });

  it('does not inject Authorization on /auth/token/ even if a token is stored', () => {
    tokenStorage.setAccess('access-1');
    http.post(authUrl, { username: 'u', password: 'p' }).subscribe();
    const req = httpMock.expectOne(authUrl);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('does not inject Authorization on requests outside the API base', () => {
    tokenStorage.setAccess('access-1');
    http.get(externalUrl).subscribe();
    const req = httpMock.expectOne(externalUrl);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('on 401, calls refresh and replays the request with the new token', async () => {
    tokenStorage.setAccess('stale');
    const refresh$ = new Subject<unknown>();
    authMock.refresh.mockReturnValue(refresh$.asObservable());

    const result = new Promise<unknown>((resolve) => http.get(apiUrl).subscribe(resolve));

    const first = httpMock.expectOne(apiUrl);
    expect(first.request.headers.get('Authorization')).toBe('Bearer stale');
    first.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authMock.refresh).toHaveBeenCalledTimes(1);
    tokenStorage.setAccess('fresh');
    refresh$.next({ access: 'fresh', refresh: 'r' });
    refresh$.complete();

    const replayed = httpMock.expectOne(apiUrl);
    expect(replayed.request.headers.get('Authorization')).toBe('Bearer fresh');
    replayed.flush({ ok: true });

    expect(await result).toEqual({ ok: true });
    expect(authMock.clearSession).not.toHaveBeenCalled();
  });

  it('on 401, when the refresh token is rejected (401), clears the session and propagates', async () => {
    tokenStorage.setAccess('stale');
    const refresh$ = new Subject<unknown>();
    authMock.refresh.mockReturnValue(refresh$.asObservable());

    const error = new Promise<unknown>((resolve, reject) => {
      http.get(apiUrl).subscribe({
        next: () => reject(new Error('should not succeed')),
        error: resolve,
      });
    });

    httpMock.expectOne(apiUrl).flush({}, { status: 401, statusText: 'Unauthorized' });
    refresh$.error({ status: 401 });

    await error;
    expect(authMock.clearSession).toHaveBeenCalledTimes(1);
    // Local clear only: the server logout would be pointless with a dead refresh.
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  for (const status of [0, 500, 502, 503]) {
    it(`on 401, when refresh fails with ${status} (network / backend down), keeps the session`, async () => {
      tokenStorage.setTokens('stale', 'r');
      authMock.refresh.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status, statusText: 'x' })),
      );

      const done = new Promise<HttpErrorResponse>((resolve) =>
        http.get(apiUrl).subscribe({ error: resolve }),
      );
      httpMock.expectOne(apiUrl).flush({}, { status: 401, statusText: 'Unauthorized' });

      // The refresh error reaches the caller untouched.
      expect((await done).status).toBe(status);
      expect(authMock.clearSession).not.toHaveBeenCalled();
      expect(tokenStorage.getRefresh()).toBe('r');
    });
  }

  it('on 401, when refresh answers 403, clears the session', async () => {
    tokenStorage.setTokens('stale', 'r');
    authMock.refresh.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const done = new Promise<unknown>((resolve) => http.get(apiUrl).subscribe({ error: resolve }));
    httpMock.expectOne(apiUrl).flush({}, { status: 401, statusText: 'Unauthorized' });
    await done;
    expect(authMock.clearSession).toHaveBeenCalledTimes(1);
  });

  it('on 401, when the refresh token is gone (logged out in another tab), clears the session', async () => {
    tokenStorage.setAccess('stale');
    authMock.refresh.mockReturnValue(throwError(() => new Error(NO_REFRESH_TOKEN)));
    const done = new Promise<unknown>((resolve) => http.get(apiUrl).subscribe({ error: resolve }));
    httpMock.expectOne(apiUrl).flush({}, { status: 401, statusText: 'Unauthorized' });
    await done;
    expect(authMock.clearSession).toHaveBeenCalledTimes(1);
  });

  it('an error of the replayed request (403 on the resource) does not end the session', async () => {
    tokenStorage.setTokens('stale', 'r');
    authMock.refresh.mockReturnValue(of({ access: 'fresh', refresh: 'r2' }));
    const done = new Promise<HttpErrorResponse>((resolve) =>
      http.get(apiUrl).subscribe({ error: resolve }),
    );
    httpMock.expectOne(apiUrl).flush({}, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne(apiUrl).flush({}, { status: 403, statusText: 'Forbidden' });
    expect((await done).status).toBe(403);
    expect(authMock.clearSession).not.toHaveBeenCalled();
  });

  it('does not refresh on a 401 of a request flagged SKIP_REFRESH_ON_401', async () => {
    tokenStorage.setTokens('a', 'r');
    const done = new Promise<HttpErrorResponse>((resolve) =>
      http
        .post(
          `${environment.apiBase}/auth/logout/`,
          { refresh: 'r' },
          {
            context: new HttpContext().set(SKIP_REFRESH_ON_401, true),
          },
        )
        .subscribe({ error: resolve }),
    );
    const req = httpMock.expectOne(`${environment.apiBase}/auth/logout/`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer a');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect((await done).status).toBe(401);
    expect(authMock.refresh).not.toHaveBeenCalled();
    expect(authMock.clearSession).not.toHaveBeenCalled();
  });

  it('does not trigger refresh on a 401 from /auth/token/refresh/ itself', () => {
    http.post(refreshUrl, { refresh: 'r' }).subscribe({
      next: () => {
        // not expected
      },
      error: () => {
        // expected: 401 propagates without refresh
      },
    });
    const req = httpMock.expectOne(refreshUrl);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authMock.refresh).not.toHaveBeenCalled();
    expect(authMock.clearSession).not.toHaveBeenCalled();
  });
});
