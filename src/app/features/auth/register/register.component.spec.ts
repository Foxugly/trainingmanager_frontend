import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { RegisterComponent } from './register.component';

interface ProtectedFields {
  form: {
    invalid: boolean;
    valid: boolean;
    patchValue: (v: Record<string, unknown>) => void;
    errors: Record<string, unknown> | null;
  };
  loading(): boolean;
  errorMessage(): string | null;
  fieldErrors(): { [k: string]: string[] } | null;
  captchaError(): boolean;
  retryCountdown(): number | null;
  submit(): void;
}

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let authMock: { register: ReturnType<typeof vi.fn> };
  let router: Router;
  let turnstileResetSpy: ReturnType<typeof vi.fn>;

  const access = (c: RegisterComponent) => c as unknown as ProtectedFields;

  function ensureTurnstileInput(token: string | null): void {
    document.querySelector('input[name="cf-turnstile-response"]')?.remove();
    if (token === null) return;
    const input = document.createElement('input');
    input.setAttribute('name', 'cf-turnstile-response');
    input.value = token;
    document.body.appendChild(input);
  }

  beforeEach(async () => {
    authMock = { register: vi.fn() };
    turnstileResetSpy = vi.fn();
    (window as unknown as { turnstile: { reset: ReturnType<typeof vi.fn> } }).turnstile = {
      reset: turnstileResetSpy,
    };

    await TestBed.configureTestingModule({
      imports: [
        RegisterComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        { provide: LanguageService, useValue: { activeLang: signal('fr').asReadonly() } },
      ],
    })
      .overrideComponent(RegisterComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
  });

  afterEach(() => {
    document.querySelector('input[name="cf-turnstile-response"]')?.remove();
    delete (window as unknown as { turnstile?: unknown }).turnstile;
  });

  it('starts with an invalid form (all fields required)', () => {
    expect(access(component).form.invalid).toBe(true);
  });

  it('submit on invalid form: surfaces fix_errors_below + does NOT call register', () => {
    ensureTurnstileInput('TOKEN_OK');
    access(component).submit();
    expect(authMock.register).not.toHaveBeenCalled();
    expect(access(component).errorMessage()).toBe('auth.register.fix_errors_below');
  });

  it('flags password_mismatch when password and confirm_password differ', () => {
    access(component).form.patchValue({ password: 'abcdefgh', confirm_password: 'different' });
    expect(access(component).form.errors?.['password_mismatch']).toBe(true);
  });

  function fillValidForm(): void {
    access(component).form.patchValue({
      email: 'a@b.c',
      password: 'longenough',
      confirm_password: 'longenough',
      first_name: 'Alice',
      last_name: 'Anderson',
      language: 'fr',
    });
  }

  it('blocks submit when no Turnstile token is present in the DOM (captcha_required)', () => {
    fillValidForm();
    ensureTurnstileInput(null);
    access(component).submit();
    expect(authMock.register).not.toHaveBeenCalled();
    expect(access(component).captchaError()).toBe(true);
    expect(access(component).errorMessage()).toBe('auth.register.captcha_required');
  });

  it('on 201 success → router.navigate to /check-your-email with email in state', () => {
    fillValidForm();
    ensureTurnstileInput('TOKEN_OK');
    authMock.register.mockReturnValue(
      of({ detail: 'ok', code: 'registration_pending_verification', email: 'a@b.c' }),
    );

    access(component).submit();

    expect(authMock.register).toHaveBeenCalledTimes(1);
    expect(authMock.register.mock.calls[0][0]).toMatchObject({
      email: 'a@b.c',
      turnstile_token: 'TOKEN_OK',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/check-your-email'], {
      state: { email: 'a@b.c' },
    });
  });

  it('on 400 code=captcha_failed → captchaError=true + turnstile.reset() called', () => {
    fillValidForm();
    ensureTurnstileInput('TOKEN_BAD');
    authMock.register.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { code: 'captcha_failed', detail: 'Captcha verification failed.' },
      })),
    );

    access(component).submit();

    expect(access(component).captchaError()).toBe(true);
    expect(access(component).errorMessage()).toBe('auth.register.captcha_failed');
    expect(turnstileResetSpy).toHaveBeenCalled();
  });

  it('on 400 fields → fieldErrors signal populated', () => {
    fillValidForm();
    ensureTurnstileInput('TOKEN_OK');
    authMock.register.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { fields: { email: ['Email already taken'] } },
      })),
    );

    access(component).submit();

    expect(access(component).fieldErrors()?.['email']).toEqual(['Email already taken']);
  });

  it('on 429 → rate_limit_message + retryCountdown set from Retry-After header', () => {
    fillValidForm();
    ensureTurnstileInput('TOKEN_OK');
    const mockHeaders = {
      get: (name: string) => (name.toLowerCase() === 'retry-after' ? '120' : null),
    };
    authMock.register.mockReturnValue(throwError(() => ({ status: 429, headers: mockHeaders })));

    access(component).submit();

    expect(access(component).errorMessage()).toBe('auth.register.rate_limit_message');
    expect(access(component).retryCountdown()).toBe(120);
  });
});
