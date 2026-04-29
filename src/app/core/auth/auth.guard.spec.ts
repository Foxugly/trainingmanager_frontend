import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { authGuard } from './auth.guard';

function runGuard(state: RouterStateSnapshot) {
  return TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, state));
}

describe('authGuard', () => {
  let authStub: { isAuthenticated: () => boolean };
  let router: Router;

  beforeEach(() => {
    authStub = { isAuthenticated: () => false };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authStub }],
    });
    router = TestBed.inject(Router);
  });

  it('returns true when the user is authenticated', () => {
    authStub.isAuthenticated = () => true;
    const result = runGuard({ url: '/teams' } as RouterStateSnapshot);
    expect(result).toBe(true);
  });

  it('returns a UrlTree to /login with returnUrl when not authenticated', () => {
    const result = runGuard({ url: '/teams/42' } as RouterStateSnapshot);
    expect(result).toBeInstanceOf(UrlTree);

    const expected = router.createUrlTree(['/login'], {
      queryParams: { returnUrl: '/teams/42' },
    });
    expect(router.serializeUrl(result as UrlTree)).toBe(router.serializeUrl(expected));
  });

  it('redirects anonymous users at root to /home', () => {
    const result = runGuard({ url: '/' } as RouterStateSnapshot);
    expect(result).toBeInstanceOf(UrlTree);

    const expected = router.createUrlTree(['/home']);
    expect(router.serializeUrl(result as UrlTree)).toBe(router.serializeUrl(expected));
  });
});
