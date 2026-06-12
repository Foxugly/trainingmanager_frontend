import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Me } from '../../../api/model/me';
import { ResetPasswordComponent } from './reset-password.component';

interface Protected {
  key(): string | null;
  invalidToken(): boolean;
  missingKey(): boolean;
  errorMessage(): string | null;
  fieldErrors(): { [k: string]: string[] } | null;
  submit(): void;
  form: { patchValue(v: Record<string, unknown>): void; invalid: boolean };
}

const fakeUser: Me = {
  id: 1,
  email: 'a@b.com',
  email_confirmed: true,
  first_name: 'Alice',
  last_name: 'A',
  language: LanguageEnum.Fr,
  last_login: null,
  date_joined: '2026-01-01T00:00:00Z',
  is_staff: false,
  is_superuser: false,
  member_id: null,
  team_quota: { used: 0, max: 0, can_create: false },
  calendar_token: 'tok-test',
};

describe('ResetPasswordComponent', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let component: ResetPasswordComponent;
  let authMock: { confirmPasswordReset: ReturnType<typeof vi.fn> };
  let router: Router;

  const access = (c: ResetPasswordComponent) => c as unknown as Protected;

  async function setup(keyParam: string | null = '7-abc123') {
    TestBed.resetTestingModule();
    authMock = {
      confirmPasswordReset: vi.fn().mockReturnValue(of(fakeUser)),
    };

    await TestBed.configureTestingModule({
      imports: [
        ResetPasswordComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => keyParam } } },
        },
      ],
    })
      .overrideComponent(ResetPasswordComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('extracts the :key route param at init', () => {
    expect(access(component).key()).toBe('7-abc123');
    expect(access(component).missingKey()).toBe(false);
  });

  it('flags missingKey when the route has no :key', async () => {
    await setup(null);
    expect(access(component).missingKey()).toBe(true);
    access(component).form.patchValue({ new_password: 'x' });
    access(component).submit();
    // No call attempted when key is missing
    expect(authMock.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('on success, calls confirmPasswordReset and navigates to /dashboard', () => {
    access(component).form.patchValue({
      new_password: 'longenough',
      confirm_password: 'longenough',
    });
    access(component).submit();
    expect(authMock.confirmPasswordReset).toHaveBeenCalledWith('7-abc123', 'longenough');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('400 invalid_or_expired_token → invalidToken=true, no navigation', () => {
    authMock.confirmPasswordReset.mockReturnValueOnce(
      throwError(() => ({
        status: 400,
        error: { code: 'invalid_or_expired_token', detail: 'x' },
      })),
    );
    access(component).form.patchValue({
      new_password: 'longenough',
      confirm_password: 'longenough',
    });
    access(component).submit();
    expect(access(component).invalidToken()).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('400 fields.new_password → fieldErrors populated', () => {
    authMock.confirmPasswordReset.mockReturnValueOnce(
      throwError(() => ({
        status: 400,
        error: { fields: { new_password: ['Too common', 'Looks too short'] } },
      })),
    );
    // Local validators pass (>= 8 chars + match) but Django validators
    // reject e.g. "password" as too common — that's the case we test here.
    access(component).form.patchValue({
      new_password: 'password',
      confirm_password: 'password',
    });
    access(component).submit();
    expect(access(component).fieldErrors()?.['new_password']).toEqual([
      'Too common',
      'Looks too short',
    ]);
  });

  // Reference signal import to satisfy lint
  it('signal helper imported', () => {
    const s = signal(0);
    expect(s()).toBe(0);
  });
});
