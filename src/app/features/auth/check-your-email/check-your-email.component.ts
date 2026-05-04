import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';
import { parseRetryAfterSeconds } from '../shared/retry-after';

const RESEND_DEBOUNCE_SECONDS = 30;

@Component({
  selector: 'app-check-your-email',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, InputText, Button, Message, TranslocoPipe],
  templateUrl: './check-your-email.component.html',
  styleUrl: './check-your-email.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckYourEmailComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly email = signal<string | null>(null);
  protected readonly resending = signal(false);
  protected readonly cooldownSeconds = signal<number | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly cooldownActive = computed(() => {
    const v = this.cooldownSeconds();
    return v !== null && v > 0;
  });

  protected readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const navState = this.router.getCurrentNavigation()?.extras.state as
      | { email?: string }
      | undefined;
    const fromState = navState?.email ?? (history.state as { email?: string } | null)?.email;
    const fromQuery = this.route.snapshot.queryParamMap.get('email');
    const email = fromState ?? fromQuery ?? null;
    if (email) this.email.set(email);
  }

  ngOnDestroy(): void {
    if (this.cooldownTimer !== null) clearInterval(this.cooldownTimer);
  }

  protected resend(): void {
    const email = this.email();
    if (!email) return;
    this.fireResend(email);
  }

  protected submitEmailForm(): void {
    if (this.emailForm.invalid) return;
    const email = this.emailForm.getRawValue().email;
    this.email.set(email);
    this.fireResend(email);
  }

  private fireResend(email: string): void {
    this.resending.set(true);
    this.errorMessage.set(null);
    this.authService
      .resendEmail(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resending.set(false);
          this.messageService.add({
            severity: 'success',
            summary: 'common.success',
            detail: 'auth.check_email.resent_toast',
          });
          this.startCooldown(RESEND_DEBOUNCE_SECONDS);
        },
        error: (err: HttpErrorResponse) => {
          this.resending.set(false);
          if (err.status === 429) {
            const retryAfter = parseRetryAfterSeconds(err.headers);
            this.startCooldown(retryAfter ?? RESEND_DEBOUNCE_SECONDS);
            this.errorMessage.set('auth.check_email.resend_rate_limited');
          } else {
            this.errorMessage.set('auth.errors.unknown');
          }
        },
      });
  }

  private startCooldown(seconds: number): void {
    this.cooldownSeconds.set(seconds);
    if (this.cooldownTimer !== null) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      const v = this.cooldownSeconds();
      if (v === null || v <= 1) {
        this.cooldownSeconds.set(null);
        if (this.cooldownTimer !== null) {
          clearInterval(this.cooldownTimer);
          this.cooldownTimer = null;
        }
      } else {
        this.cooldownSeconds.set(v - 1);
      }
    }, 1000);
  }
}
