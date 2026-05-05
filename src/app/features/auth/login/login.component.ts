import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';
import { AuthService } from '../../../core/auth/auth.service';
import { parseRetryAfterSeconds } from '../shared/retry-after';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Password,
    Checkbox,
    Button,
    Message,
    TranslocoPipe,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
    email: [''],
    remember: [false],
  });

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly emailNotVerified = signal(false);
  protected readonly resending = signal(false);
  protected readonly resendDone = signal(false);
  protected readonly resendError = signal<string | null>(null);
  protected readonly retryCountdown = signal<number | null>(null);

  protected readonly submitDisabled = computed(() => {
    if (this.loading()) return true;
    if (this.retryCountdown() !== null && this.retryCountdown()! > 0) return true;
    return this.form.controls.username.invalid || this.form.controls.password.invalid;
  });

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  protected submit(): void {
    if (this.form.controls.username.invalid || this.form.controls.password.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.emailNotVerified.set(false);
    this.resendDone.set(false);
    this.resendError.set(null);

    const { username, password, remember } = this.form.getRawValue();

    this.authService
      .login(username, password, remember)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
          this.router.navigateByUrl(returnUrl);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          const body = (err?.error ?? null) as { code?: string; detail?: string } | null;

          if (err.status === 429) {
            const retryAfter = parseRetryAfterSeconds(err.headers);
            if (retryAfter !== null) this.startRetryCountdown(retryAfter);
            this.errorMessage.set('auth.login.rate_limit_message');
            return;
          }

          if (err.status === 400 && body?.code === 'email_not_verified') {
            this.emailNotVerified.set(true);
            return;
          }

          if (err.status === 401 && body?.code === 'authentication_failed') {
            this.errorMessage.set(this.transloco.translate('auth.errors.invalid_credentials'));
          } else if (body?.detail) {
            this.errorMessage.set(body.detail);
          } else {
            this.errorMessage.set(this.transloco.translate('auth.errors.unknown'));
          }
        },
      });
  }

  protected resendVerification(): void {
    const email = this.form.getRawValue().email;
    if (!email) {
      this.resendError.set('auth.login.resend_email_required');
      return;
    }
    this.resending.set(true);
    this.resendError.set(null);
    this.authService
      .resendEmail(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resending.set(false);
          this.resendDone.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.resending.set(false);
          if (err.status === 429) {
            this.resendError.set('auth.login.resend_rate_limited');
          } else {
            this.resendError.set('auth.errors.unknown');
          }
        },
      });
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
