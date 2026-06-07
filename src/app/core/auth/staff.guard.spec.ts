import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { AuthService } from './auth.service';
import { staffGuard } from './staff.guard';

const baseUser: Me = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'A',
  language: LanguageEnum.Fr,
  last_login: null,
  date_joined: '2026-01-01T00:00:00Z',
  is_staff: false,
  member_id: null,
  team_quota: { used: 0, max: 0, can_create: false },
  calendar_token: 'tok-test',
};

function runGuard(state: RouterStateSnapshot) {
  return TestBed.runInInjectionContext(() =>
    staffGuard({} as ActivatedRouteSnapshot, state),
  );
}

describe('staffGuard', () => {
  let userSignal: ReturnType<typeof signal<Me | null>>;
  let isAuthenticated: boolean;
  let router: Router;

  beforeEach(() => {
    userSignal = signal<Me | null>(null);
    isAuthenticated = false;

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => isAuthenticated,
            currentUser: userSignal.asReadonly(),
          },
        },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('redirects unauthenticated users to /login with returnUrl', () => {
    const result = runGuard({ url: '/admin/sports' } as RouterStateSnapshot);
    expect(result).toBeInstanceOf(UrlTree);
    const expected = router.createUrlTree(['/login'], {
      queryParams: { returnUrl: '/admin/sports' },
    });
    expect(router.serializeUrl(result as UrlTree)).toBe(router.serializeUrl(expected));
  });

  it('redirects authenticated non-staff users to /', () => {
    isAuthenticated = true;
    userSignal.set({ ...baseUser, is_staff: false });

    const result = runGuard({ url: '/admin/sports' } as RouterStateSnapshot);
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe(router.serializeUrl(router.createUrlTree(['/'])));
  });

  it('lets staff users through', () => {
    isAuthenticated = true;
    userSignal.set({ ...baseUser, is_staff: true });

    const result = runGuard({ url: '/admin/sports' } as RouterStateSnapshot);
    expect(result).toBe(true);
  });
});
