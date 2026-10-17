import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
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
import { getRuntimeConfig } from '../../../core/runtime-config';
import { AuthCardComponent } from '../../../shared/components/auth-card/auth-card.component';
import { authErrorKey } from '../shared/auth-error';
import { parseRetryAfterSeconds } from '../shared/retry-after';
import { safeReturnUrl } from '../shared/safe-return-url';

const RESEND_COOLDOWN_SECONDS = 30;

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
    AuthCardComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    remember: [false],
  });

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly emailNotVerified = signal(false);

  // Magic-link (passwordless) mode: swaps the email/password form for an
  // email-only "send me a sign-in link" form within the same card.
  protected readonly magicLinkMode = signal(false);
  protected readonly magicLinkSubmitting = signal(false);
  protected readonly magicLinkSent = signal(false);
  protected readonly magicLinkError = signal<string | null>(null);
  protected readonly resending = signal(false);
  protected readonly resendDone = signal(false);
  protected readonly resendError = signal<string | null>(null);
  protected readonly retryCountdown = signal<number | null>(null);
  protected readonly turnstileFailed = signal(false);
  /** Timed cooldown after a resend so the button re-enables (no permanent lock). */
  protected readonly resendCooldown = signal<number | null>(null);
  protected readonly resendCooldownActive = computed(() => {
    const v = this.resendCooldown();
    return v !== null && v > 0;
  });

  protected readonly submitDisabled = computed(() => {
    if (this.loading()) return true;
    if (this.retryCountdown() !== null && this.retryCountdown()! > 0) return true;
    return false;
  });

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private resendCooldownTimer: ReturnType<typeof setInterval> | null = null;

  // Turnstile (lien magique) : le conteneur n'existe que dans le formulaire du mode
  // « lien magique ». Le widget est rendu à son apparition et retiré à sa disparition.
  private readonly turnstileSiteKey = getRuntimeConfig().turnstileSiteKey;
  private readonly turnstileContainer = viewChild<ElementRef<HTMLDivElement>>('turnstile');
  private turnstileWidgetId: string | null = null;
  private turnstileRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const container = this.turnstileContainer();
      untracked(() => {
        if (container) this.tryRenderTurnstile(0);
        else this.removeTurnstile();
      });
    });
  }

  ngOnDestroy(): void {
    this.removeTurnstile();
    // Stop the rate-limit countdown if the user navigates away mid-cooldown,
    // otherwise the interval keeps firing on a destroyed component.
    if (this.countdownTimer !== null) clearInterval(this.countdownTimer);
    if (this.resendCooldownTimer !== null) clearInterval(this.resendCooldownTimer);
  }

  protected submit(): void {
    if (this.submitDisabled()) return;
    if (this.form.controls.email.invalid || this.form.controls.password.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.emailNotVerified.set(false);
    this.resendDone.set(false);
    this.resendError.set(null);

    const { email, password, remember } = this.form.getRawValue();

    this.authService
      .login(email, password, remember)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'), '/');
          this.router.navigateByUrl(returnUrl);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          const body = (err?.error ?? null) as { code?: string } | null;

          if (err.status === 429) {
            const retryAfter = parseRetryAfterSeconds(err.headers);
            if (retryAfter !== null) this.startRetryCountdown(retryAfter);
            this.errorMessage.set(this.transloco.translate('auth.login.rate_limit_message'));
            return;
          }

          if (err.status === 400 && body?.code === 'email_not_verified') {
            this.emailNotVerified.set(true);
            return;
          }

          // Jamais le `detail` brut du backend : message traduit selon le code HTTP.
          this.errorMessage.set(
            this.transloco.translate(authErrorKey(err, { credentials: true })),
          );
        },
      });
  }

  protected toggleMagicLinkMode(): void {
    this.errorMessage.set(null);
    this.magicLinkError.set(null);
    this.magicLinkSent.set(false);
    this.magicLinkMode.update((v) => !v);
    // After the form swaps, move focus to the now-visible input so keyboard
    // users land where they expect instead of staying on the toggle button.
    const targetId = this.magicLinkMode() ? 'magic-email' : 'email';
    afterNextRender(() => document.getElementById(targetId)?.focus(), {
      injector: this.injector,
    });
  }

  protected submitMagicLink(): void {
    const email = (this.form.getRawValue().email ?? '').trim();
    if (!email || this.magicLinkSubmitting()) {
      this.magicLinkError.set('auth.magic_link.email_required');
      return;
    }
    const turnstileToken = document
      .querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')
      ?.value;
    if (!turnstileToken) {
      this.magicLinkError.set('auth.magic_link.captcha_required');
      return;
    }
    this.magicLinkSubmitting.set(true);
    this.magicLinkError.set(null);
    this.authService
      .requestMagicLink(email, turnstileToken)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Constant-time UX: any 2xx maps to the same neutral confirmation.
        next: () => {
          this.magicLinkSubmitting.set(false);
          this.magicLinkSent.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.magicLinkSubmitting.set(false);
          this.resetTurnstileWidget();
          const code = (err?.error as { code?: string } | null)?.code;
          if (err.status === 429) {
            this.magicLinkError.set('auth.magic_link.rate_limited');
          } else if (err.status === 400 && code === 'captcha_failed') {
            this.magicLinkError.set('auth.magic_link.captcha_failed');
          } else {
            this.magicLinkError.set(authErrorKey(err));
          }
        },
      });
  }

  /** Relance du chargement du widget après un échec (bloqueur de publicités, réseau). */
  protected retryTurnstile(): void {
    this.turnstileFailed.set(false);
    this.tryRenderTurnstile(0);
  }

  private tryRenderTurnstile(attempts: number): void {
    if (typeof window === 'undefined') return;
    if (this.turnstileRetryTimer !== null) {
      clearTimeout(this.turnstileRetryTimer);
      this.turnstileRetryTimer = null;
    }
    if (!window.turnstile?.render) {
      if (attempts >= 20) {
        // Le script ne s'est jamais chargé : on l'indique plutôt que de laisser un
        // cadre vide qui échouera à l'envoi.
        this.turnstileFailed.set(true);
        return;
      }
      this.turnstileRetryTimer = setTimeout(() => this.tryRenderTurnstile(attempts + 1), 500);
      return;
    }
    const container = this.turnstileContainer()?.nativeElement;
    if (!container || this.turnstileWidgetId !== null) return;
    this.turnstileWidgetId = window.turnstile.render(container, {
      sitekey: this.turnstileSiteKey,
    });
  }

  private resetTurnstileWidget(): void {
    if (typeof window === 'undefined' || !window.turnstile?.reset) return;
    if (this.turnstileWidgetId !== null) window.turnstile.reset(this.turnstileWidgetId);
  }

  private removeTurnstile(): void {
    if (this.turnstileRetryTimer !== null) {
      clearTimeout(this.turnstileRetryTimer);
      this.turnstileRetryTimer = null;
    }
    if (this.turnstileWidgetId !== null && typeof window !== 'undefined') {
      window.turnstile?.remove?.(this.turnstileWidgetId);
    }
    this.turnstileWidgetId = null;
    this.turnstileFailed.set(false);
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
          // Timed cooldown rather than a permanent lock: the user can retry
          // once it elapses if the email never arrives.
          this.startResendCooldown(RESEND_COOLDOWN_SECONDS);
        },
        error: (err: HttpErrorResponse) => {
          this.resending.set(false);
          if (err.status === 429) {
            const retryAfter = parseRetryAfterSeconds(err.headers);
            this.startResendCooldown(retryAfter ?? RESEND_COOLDOWN_SECONDS);
            this.resendError.set('auth.login.resend_rate_limited');
          } else {
            this.resendError.set('auth.errors.unknown');
          }
        },
      });
  }

  private startResendCooldown(seconds: number): void {
    this.resendCooldown.set(seconds);
    if (this.resendCooldownTimer !== null) clearInterval(this.resendCooldownTimer);
    this.resendCooldownTimer = setInterval(() => {
      const v = this.resendCooldown();
      if (v === null || v <= 1) {
        this.resendCooldown.set(null);
        if (this.resendCooldownTimer !== null) {
          clearInterval(this.resendCooldownTimer);
          this.resendCooldownTimer = null;
        }
      } else {
        this.resendCooldown.set(v - 1);
      }
    }, 1000);
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
