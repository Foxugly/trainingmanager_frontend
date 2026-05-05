import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { HttpHeaders } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { ForgotPasswordComponent } from './forgot-password.component';

interface Protected {
  loading(): boolean;
  errorMessage(): string | null;
  retryCountdown(): number | null;
  captchaError(): boolean;
  submit(): void;
  form: { patchValue(v: Record<string, unknown>): void; invalid: boolean };
}

describe('ForgotPasswordComponent', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let component: ForgotPasswordComponent;
  let authMock: { requestPasswordReset: ReturnType<typeof vi.fn> };
  let router: Router;

  const access = (c: ForgotPasswordComponent) => c as unknown as Protected;

  function setTurnstileToken(value: string) {
    document.querySelectorAll<HTMLInputElement>(
      'input[name="cf-turnstile-response"]',
    ).forEach((el) => el.remove());
    if (value) {
      const input = document.createElement('input');
      input.name = 'cf-turnstile-response';
      input.value = value;
      input.type = 'hidden';
      document.body.appendChild(input);
    }
  }

  async function setup() {
    TestBed.resetTestingModule();
    authMock = {
      requestPasswordReset: vi
        .fn()
        .mockReturnValue(of({ detail: 'ok', code: 'password_reset_processed' })),
    };

    await TestBed.configureTestingModule({
      imports: [
        ForgotPasswordComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
      ],
    })
      .overrideComponent(ForgotPasswordComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    setTurnstileToken('');
    await setup();
  });

  it('blocks submit when captcha token is missing', () => {
    access(component).form.patchValue({ email: 'a@b.com' });
    setTurnstileToken('');
    access(component).submit();
    expect(authMock.requestPasswordReset).not.toHaveBeenCalled();
    expect(access(component).captchaError()).toBe(true);
    expect(access(component).errorMessage()).toBe('auth.forgot_password.captcha_required');
  });

  it('on success, navigates to /auth/forgot-password/sent with the email in state', () => {
    access(component).form.patchValue({ email: 'a@b.com' });
    setTurnstileToken('cf-token-xxx');
    access(component).submit();
    expect(authMock.requestPasswordReset).toHaveBeenCalledWith({
      email: 'a@b.com',
      turnstile_token: 'cf-token-xxx',
    });
    expect(router.navigate).toHaveBeenCalledWith(
      ['/auth/forgot-password/sent'],
      { state: { email: 'a@b.com' } },
    );
  });

  it('400 captcha_failed → captchaError + no navigation', () => {
    authMock.requestPasswordReset.mockReturnValueOnce(
      throwError(() => ({ status: 400, error: { code: 'captcha_failed', detail: 'x' } })),
    );
    access(component).form.patchValue({ email: 'a@b.com' });
    setTurnstileToken('cf-token-xxx');
    access(component).submit();
    expect(access(component).captchaError()).toBe(true);
    expect(access(component).errorMessage()).toBe('auth.forgot_password.captcha_failed');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('429 → starts retry countdown via Retry-After header', () => {
    authMock.requestPasswordReset.mockReturnValueOnce(
      throwError(() => ({
        status: 429,
        headers: new HttpHeaders({ 'Retry-After': '42' }),
        error: {},
      })),
    );
    access(component).form.patchValue({ email: 'a@b.com' });
    setTurnstileToken('cf-token-xxx');
    access(component).submit();
    expect(access(component).retryCountdown()).toBe(42);
    expect(access(component).errorMessage()).toBe('auth.forgot_password.rate_limit_message');
  });
});
