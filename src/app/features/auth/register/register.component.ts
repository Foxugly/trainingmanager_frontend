import { CommonModule } from '@angular/common';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
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
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';
import { Select } from 'primeng/select';
import { environment } from '../../../../environments/environment';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Register } from '../../../api/model/register';
import { AuthService } from '../../../core/auth/auth.service';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../../../core/i18n/available-languages';
import { LanguageService } from '../../../core/i18n/language.service';
import { parseRetryAfterSeconds } from '../shared/retry-after';

interface FieldErrors {
  [field: string]: string[];
}

declare global {
  interface Window {
    turnstile?: {
      reset: (widgetId?: string) => void;
      render?: (container: string | HTMLElement, options: Record<string, unknown>) => string;
    };
  }
}

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const pwd = group.get('password')?.value as string;
  const confirm = group.get('confirm_password')?.value as string;
  if (!pwd || !confirm) return null;
  return pwd === confirm ? null : { password_mismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Password,
    Select,
    Button,
    Message,
    TranslocoPipe,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent implements AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly turnstileSiteKey = environment.turnstileSiteKey;
  protected readonly availableLanguages = AVAILABLE_LANGUAGES;

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly captchaError = signal<boolean>(false);
  protected readonly retryAfterSeconds = signal<number | null>(null);
  protected readonly retryCountdown = signal<number | null>(null);

  protected readonly submitDisabled = computed(() => {
    if (this.loading()) return true;
    if (this.retryCountdown() !== null && this.retryCountdown()! > 0) return true;
    return this.form.invalid;
  });

  @ViewChild('turnstile', { static: false })
  protected turnstileContainer?: ElementRef<HTMLDivElement>;

  protected readonly form = this.fb.nonNullable.group(
    {
      username: ['', [Validators.required, Validators.maxLength(150)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm_password: ['', [Validators.required]],
      first_name: ['', [Validators.required, Validators.maxLength(150)]],
      last_name: ['', [Validators.required, Validators.maxLength(150)]],
      language: this.fb.nonNullable.control<LanguageCode>(this.languageService.activeLang(), [
        Validators.required,
      ]),
    },
    { validators: [passwordsMatchValidator] },
  );

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  ngAfterViewInit(): void {
    // Cloudflare's auto-render scans the DOM for `.cf-turnstile` divs once the
    // script is loaded; the widget added to the template will be picked up
    // automatically. No explicit render() call required.
  }

  ngOnDestroy(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
    }
  }

  protected submit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.captchaError.set(false);

    const turnstileInput = document.querySelector<HTMLInputElement>(
      'input[name="cf-turnstile-response"]',
    );
    const turnstileToken = turnstileInput?.value ?? '';
    if (!turnstileToken) {
      this.captchaError.set(true);
      this.errorMessage.set('auth.register.captcha_required');
      this.loading.set(false);
      return;
    }

    const value = this.form.getRawValue();
    const payload: Register = {
      username: value.username,
      email: value.email,
      password: value.password,
      first_name: value.first_name,
      last_name: value.last_name,
      language: value.language as LanguageEnum,
      turnstile_token: turnstileToken,
    };

    this.authService
      .register(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/check-your-email'], {
            state: { email: value.email },
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
      if (retryAfter !== null) {
        this.startRetryCountdown(retryAfter);
      }
      this.errorMessage.set('auth.register.rate_limit_message');
      return;
    }

    const body = err?.error as
      | { code?: string; detail?: string; fields?: FieldErrors }
      | null
      | undefined;

    if (err.status === 400 && body?.code === 'captcha_failed') {
      this.captchaError.set(true);
      this.errorMessage.set('auth.register.captcha_failed');
      return;
    }

    if (body?.fields && Object.keys(body.fields).length > 0) {
      this.fieldErrors.set(body.fields);
      return;
    }

    if (body && typeof body === 'object') {
      const fieldEntries: FieldErrors = {};
      for (const [key, value] of Object.entries(body)) {
        if (key === 'code' || key === 'detail' || key === 'fields') continue;
        if (Array.isArray(value)) {
          fieldEntries[key] = value.filter((m): m is string => typeof m === 'string');
        }
      }
      if (Object.keys(fieldEntries).length > 0) {
        this.fieldErrors.set(fieldEntries);
        return;
      }
    }

    this.errorMessage.set(body?.detail ?? 'auth.errors.unknown');
  }

  private resetTurnstileWidget(): void {
    if (typeof window !== 'undefined' && window.turnstile?.reset) {
      window.turnstile.reset();
    }
  }

  private startRetryCountdown(seconds: number): void {
    this.retryAfterSeconds.set(seconds);
    this.retryCountdown.set(seconds);
    if (this.countdownTimer !== null) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      const v = this.retryCountdown();
      if (v === null || v <= 1) {
        this.retryCountdown.set(null);
        this.retryAfterSeconds.set(null);
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
