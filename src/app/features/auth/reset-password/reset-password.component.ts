import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';
import { AuthService } from '../../../core/auth/auth.service';

interface FieldErrors {
  [field: string]: string[];
}

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const a = group.get('new_password')?.value as string;
  const b = group.get('confirm_password')?.value as string;
  if (!a || !b) return null;
  return a === b ? null : { password_mismatch: true };
}

@Component({
  selector: 'app-reset-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Password,
    Button,
    Message,
    TranslocoPipe,
  ],
  templateUrl: './reset-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly key = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly invalidToken = signal(false);
  protected readonly missingKey = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      new_password: ['', [Validators.required, Validators.minLength(8)]],
      confirm_password: ['', [Validators.required]],
    },
    { validators: [passwordsMatchValidator] },
  );

  ngOnInit(): void {
    const k = this.route.snapshot.paramMap.get('key');
    if (!k) {
      this.missingKey.set(true);
      return;
    }
    this.key.set(k);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const k = this.key();
    if (!k) {
      this.missingKey.set(true);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.invalidToken.set(false);

    const value = this.form.getRawValue();
    this.authService
      .confirmPasswordReset(k, value.new_password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/dashboard']);
        },
        error: (err: HttpErrorResponse) => this.applyServerError(err),
      });
  }

  private applyServerError(err: HttpErrorResponse): void {
    this.loading.set(false);
    const body = err?.error as
      | { code?: string; detail?: string; fields?: FieldErrors }
      | null
      | undefined;

    if (err.status === 400 && body?.code === 'invalid_or_expired_token') {
      this.invalidToken.set(true);
      return;
    }

    if (body?.fields && Object.keys(body.fields).length > 0) {
      this.fieldErrors.set(body.fields);
      return;
    }

    if (body && typeof body === 'object') {
      const fieldEntries: FieldErrors = {};
      for (const [k, v] of Object.entries(body)) {
        if (k === 'code' || k === 'detail' || k === 'fields') continue;
        if (Array.isArray(v)) {
          fieldEntries[k] = v.filter((m): m is string => typeof m === 'string');
        }
      }
      if (Object.keys(fieldEntries).length > 0) {
        this.fieldErrors.set(fieldEntries);
        return;
      }
    }

    this.errorMessage.set(body?.detail ?? 'auth.errors.unknown');
  }
}
