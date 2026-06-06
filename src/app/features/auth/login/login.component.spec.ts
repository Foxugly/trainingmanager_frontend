import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class StubComponent {}

interface ProtectedFields {
  form: {
    invalid: boolean;
    valid: boolean;
    patchValue: (v: {
      username?: string;
      password?: string;
      email?: string;
      remember?: boolean;
    }) => void;
  };
  loading(): boolean;
  errorMessage(): string | null;
  emailNotVerified(): boolean;
  resending(): boolean;
  resendDone(): boolean;
  resendError(): string | null;
  retryCountdown(): number | null;
  submit(): void;
  resendVerification(): void;
  magicLinkMode(): boolean;
  magicLinkSubmitting(): boolean;
  magicLinkSent(): boolean;
  magicLinkError(): string | null;
  toggleMagicLinkMode(): void;
  submitMagicLink(): void;
}

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let authMock: {
    login: ReturnType<typeof vi.fn>;
    resendEmail: ReturnType<typeof vi.fn>;
    requestMagicLink: ReturnType<typeof vi.fn>;
  };
  let router: Router;
  let queryParams: Record<string, string>;

  const access = (c: LoginComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    authMock = { login: vi.fn(), resendEmail: vi.fn(), requestMagicLink: vi.fn() };
    queryParams = {};

    await TestBed.configureTestingModule({
      imports: [
        LoginComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        provideRouter([{ path: '**', component: StubComponent }]),
        { provide: AuthService, useValue: authMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: (k: string) => queryParams[k] ?? null },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('starts with an invalid form', () => {
    expect(access(component).form.invalid).toBe(true);
  });

  it('becomes valid when both fields are filled', () => {
    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    expect(access(component).form.valid).toBe(true);
  });

  it('navigates to / on successful login when no returnUrl is set', () => {
    authMock.login.mockReturnValue(of({ id: 1 }));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(authMock.login).toHaveBeenCalledWith('alice', 'pw', false);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('passes remember=true to authService.login when the checkbox is ticked', () => {
    authMock.login.mockReturnValue(of({ id: 1 }));
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    access(component).form.patchValue({
      username: 'alice',
      password: 'pw',
      remember: true,
    });
    access(component).submit();

    expect(authMock.login).toHaveBeenCalledWith('alice', 'pw', true);
  });

  it('navigates to returnUrl when present in query params', () => {
    queryParams['returnUrl'] = '/teams/42';
    authMock.login.mockReturnValue(of({ id: 1 }));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(navigate).toHaveBeenCalledWith('/teams/42');
  });

  it('sets invalid_credentials when the backend returns 401 + code=authentication_failed', () => {
    authMock.login.mockReturnValue(
      throwError(() => ({ status: 401, error: { code: 'authentication_failed' } })),
    );

    access(component).form.patchValue({ username: 'alice', password: 'wrong' });
    access(component).submit();

    expect(access(component).errorMessage()).toBe('auth.errors.invalid_credentials');
    expect(access(component).loading()).toBe(false);
  });

  it('falls back to error.detail when the backend returns one', () => {
    authMock.login.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Account locked' } })),
    );

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(access(component).errorMessage()).toBe('Account locked');
  });

  it('falls back to the unknown i18n key when no detail and no recognised code', () => {
    authMock.login.mockReturnValue(throwError(() => ({ status: 500 })));

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(access(component).errorMessage()).toBe('auth.errors.unknown');
  });

  it('flips emailNotVerified=true when the backend returns 400 + code=email_not_verified', () => {
    authMock.login.mockReturnValue(
      throwError(() => ({ status: 400, error: { code: 'email_not_verified' } })),
    );

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(access(component).emailNotVerified()).toBe(true);
    expect(access(component).errorMessage()).toBeNull();
  });

  it('resendVerification(): requires email and surfaces a guidance message when missing', () => {
    access(component).resendVerification();
    expect(access(component).resendError()).toBe('auth.login.resend_email_required');
    expect(authMock.resendEmail).not.toHaveBeenCalled();
  });

  it('resendVerification(): success → resendDone=true', () => {
    authMock.resendEmail.mockReturnValue(of({ detail: 'ok' }));
    access(component).form.patchValue({ email: 'a@b.c' });
    access(component).resendVerification();
    expect(authMock.resendEmail).toHaveBeenCalledWith('a@b.c');
    expect(access(component).resendDone()).toBe(true);
  });

  it('resendVerification(): 429 → resendError=resend_rate_limited', () => {
    authMock.resendEmail.mockReturnValue(throwError(() => ({ status: 429 })));
    access(component).form.patchValue({ email: 'a@b.c' });
    access(component).resendVerification();
    expect(access(component).resendError()).toBe('auth.login.resend_rate_limited');
  });

  it('toggleMagicLinkMode(): flips into magic-link mode', () => {
    expect(access(component).magicLinkMode()).toBe(false);
    access(component).toggleMagicLinkMode();
    expect(access(component).magicLinkMode()).toBe(true);
  });

  it('submitMagicLink(): calls requestMagicLink and shows the neutral confirmation', () => {
    authMock.requestMagicLink.mockReturnValue(of({ detail: 'ok' }));
    access(component).form.patchValue({ email: 'a@b.c' });
    access(component).submitMagicLink();

    expect(authMock.requestMagicLink).toHaveBeenCalledWith('a@b.c');
    expect(access(component).magicLinkSent()).toBe(true);
    expect(access(component).magicLinkError()).toBeNull();
  });

  it('submitMagicLink(): requires an email', () => {
    access(component).submitMagicLink();
    expect(authMock.requestMagicLink).not.toHaveBeenCalled();
    expect(access(component).magicLinkError()).toBe('auth.magic_link.email_required');
  });

  it('submitMagicLink(): 429 → rate_limited error', () => {
    authMock.requestMagicLink.mockReturnValue(throwError(() => ({ status: 429 })));
    access(component).form.patchValue({ email: 'a@b.c' });
    access(component).submitMagicLink();

    expect(access(component).magicLinkError()).toBe('auth.magic_link.rate_limited');
    expect(access(component).magicLinkSent()).toBe(false);
  });

  it('login 429 → rate_limit_message + retryCountdown set from Retry-After header', () => {
    const mockHeaders = { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '42' : null) };
    authMock.login.mockReturnValue(throwError(() => ({ status: 429, headers: mockHeaders })));

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(access(component).errorMessage()).toBe('auth.login.rate_limit_message');
    expect(access(component).retryCountdown()).toBe(42);
  });
});
