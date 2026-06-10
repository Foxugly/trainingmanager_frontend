import { HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { getRuntimeConfig } from '../../../core/runtime-config';
import { AuthService } from '../../../core/auth/auth.service';
import { parseRetryAfterSeconds } from '../shared/retry-after';

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error: string) => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
}

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Button,
    Message,
    TranslocoPipe,
  ],
  templateUrl: './forgot-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent implements AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly turnstileSiteKey = getRuntimeConfig().turnstileSiteKey;

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly captchaError = signal(false);
  protected readonly retryCountdown = signal<number | null>(null);

  protected readonly submitDisabled = computed(() => {
    if (this.loading()) return true;
    if (this.retryCountdown() !== null && this.retryCountdown()! > 0) return true;
    return false;
  });

  @ViewChild('turnstile', { static: false })
  protected turnstileContainer?: ElementRef<HTMLDivElement>;

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private turnstileWidgetId: string | null = null;
  private turnstileRetryTimer: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit(): void {
    this.tryRenderTurnstile(0);
  }

  ngOnDestroy(): void {
    if (this.countdownTimer !== null) clearInterval(this.countdownTimer);
    if (this.turnstileRetryTimer !== null) clearTimeout(this.turnstileRetryTimer);
    if (this.turnstileWidgetId !== null && window.turnstile?.remove) {
      window.turnstile.remove(this.turnstileWidgetId);
      this.turnstileWidgetId = null;
    }
  }

  private tryRenderTurnstile(attempts: number): void {
    if (typeof window === 'undefined') return;
    if (!window.turnstile?.render) {
      if (attempts >= 20) return;
      this.turnstileRetryTimer = setTimeout(() => this.tryRenderTurnstile(attempts + 1), 500);
      return;
    }
    const container = this.turnstileContainer?.nativeElement;
    if (!container || this.turnstileWidgetId !== null) return;
    this.turnstileWidgetId = window.turnstile.render(container, {
      sitekey: this.turnstileSiteKey,
    } as TurnstileRenderOptions);
  }

  protected submit(): void {
    // Block submits during a rate-limit cooldown / in-flight request even if the
    // disabled button is bypassed (Enter key / programmatic submit).
    if (this.submitDisabled()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const turnstileInput = document.querySelector<HTMLInputElement>(
      'input[name="cf-turnstile-response"]',
    );
    const turnstileToken = turnstileInput?.value ?? '';
    if (!turnstileToken) {
      this.captchaError.set(true);
      this.errorMessage.set('auth.forgot_password.captcha_required');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.captchaError.set(false);

    const email = this.form.getRawValue().email;
    this.authService
      .requestPasswordReset({ email, turnstile_token: turnstileToken })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/auth/forgot-password/sent'], {
            state: { email },
          });
        },
        error: (err: HttpErrorResponse) => this.applyServerError(err),
      });
  }

  private applyServerError(err: HttpErrorResponse): void {
    this.loading.set(false);
    this.resetTurnstileWidget();

    if (err.status === 429) {
      const retryAfter = parseRetryAfterSeconds(err.headers);
      if (retryAfter !== null) this.startRetryCountdown(retryAfter);
      this.errorMessage.set('auth.forgot_password.rate_limit_message');
      return;
    }

    const body = err?.error as { code?: string; detail?: string } | null | undefined;
    if (err.status === 400 && body?.code === 'captcha_failed') {
      this.captchaError.set(true);
      this.errorMessage.set('auth.forgot_password.captcha_failed');
      return;
    }
    this.errorMessage.set(body?.detail ?? 'auth.errors.unknown');
  }

  private resetTurnstileWidget(): void {
    if (typeof window === 'undefined' || !window.turnstile?.reset) return;
    if (this.turnstileWidgetId !== null) {
      window.turnstile.reset(this.turnstileWidgetId);
    } else {
      window.turnstile.reset();
    }
  }

  private startRetryCountdown(seconds: number): void {
    this.retryCountdown.set(seconds);
    if (this.countdownTimer !== null) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      const v = this.retryCountdown();
      if (v === null || v <= 1) {
        this.retryCountdown.set(null);
        if (this.countdownTimer !== null) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
      } else {
        this.retryCountdown.set(v - 1);
      }
    }, 1000);
  }
}
