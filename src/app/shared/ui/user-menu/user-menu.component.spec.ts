import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MenuItem } from 'primeng/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Me } from '../../../api/model/me';
import { AuthService } from '../../../core/auth/auth.service';
import { UserMenuComponent } from './user-menu.component';

const baseUser: Me = {
  id: 17,
  username: 'coach',
  first_name: 'Renaud',
  last_name: 'Vilain',
  email: 'r@example.com',
  language: 'fr',
  is_staff: false,
  is_superuser: false,
} as unknown as Me;

const superuser: Me = { ...baseUser, id: 1, username: 'admin', is_superuser: true };

interface ProtectedFields {
  isAuthenticated(): boolean;
  displayName(): string;
  menuItems(): MenuItem[];
  logout(): void;
}

describe('UserMenuComponent', () => {
  let fixture: ComponentFixture<UserMenuComponent>;
  let component: UserMenuComponent;
  let userSig: ReturnType<typeof signal<Me | null>>;
  let logoutSpy: ReturnType<typeof vi.fn>;

  const access = (c: UserMenuComponent) => c as unknown as ProtectedFields;

  async function setup(user: Me | null) {
    TestBed.resetTestingModule();
    userSig = signal<Me | null>(user);
    logoutSpy = vi.fn();

    await TestBed.configureTestingModule({
      imports: [
        UserMenuComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: userSig.asReadonly(), logout: logoutSpy },
        },
      ],
    })
      .overrideComponent(UserMenuComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(UserMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('logged out', () => {
    beforeEach(async () => {
      await setup(null);
    });

    it('isAuthenticated is false', () => {
      expect(access(component).isAuthenticated()).toBe(false);
    });
  });

  describe('logged in', () => {
    beforeEach(async () => {
      await setup(baseUser);
    });

    it('isAuthenticated is true', () => {
      expect(access(component).isAuthenticated()).toBe(true);
    });

    it('displayName uses "first last" when both are present', () => {
      expect(access(component).displayName()).toBe('Renaud Vilain');
    });

    it('menu items contain Profile + Change password + Logout, no Admin', () => {
      const labels = access(component)
        .menuItems()
        .map((i) => i.label)
        .filter((l): l is string => typeof l === 'string');
      expect(labels).toContain('public.user_menu.profile');
      expect(labels).toContain('public.user_menu.change_password');
      expect(labels).toContain('public.user_menu.logout');
      expect(labels).not.toContain('public.user_menu.admin');
    });

    it('the change-password item links to /profile/password', () => {
      const item = access(component)
        .menuItems()
        .find((i) => i.label === 'public.user_menu.change_password');
      expect(item?.routerLink).toEqual(['/profile/password']);
    });

    it('Logout menu item triggers AuthService.logout()', () => {
      const logoutItem = access(component)
        .menuItems()
        .find((i) => i.label === 'public.user_menu.logout');
      logoutItem?.command?.({} as never);
      expect(logoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('logged in (superuser)', () => {
    beforeEach(async () => {
      await setup(superuser);
    });

    it('menu items do NOT include an Admin entry (admin moved to the top menu)', () => {
      const labels = access(component)
        .menuItems()
        .map((i) => i.label)
        .filter((l): l is string => typeof l === 'string');
      expect(labels).not.toContain('public.user_menu.admin');
    });

    it('displayName falls back to username when first/last names are empty', async () => {
      await setup({ ...superuser, first_name: '', last_name: '' } as Me);
      expect(access(component).displayName()).toBe('admin');
    });
  });
});
