import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Password } from 'primeng/password';
import { AuthService as AuthApi } from '../../../api/api/auth.service';
import { PasswordChangeRequest } from '../../../api/model/password-change-request';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { ToastService } from '../../../core/notifications/toast.service';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { AriaDescribesDirective } from '../../../shared/a11y/aria-describes.directive';

@Component({
  selector: 'app-change-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Button,
    Password,
    PageHeaderComponent,
    MetaFieldComponent,
    FormFooterComponent,
    AriaDescribesDirective,
    TranslocoPipe,
  ],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authApi = inject(AuthApi);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly errors = signal<FieldErrors | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    current_password: ['', Validators.required],
    new_password: ['', Validators.required],
    new_password_confirm: ['', Validators.required],
  });

  protected fieldError(name: string): string | null {
    return this.errors()?.[name]?.join(', ') ?? null;
  }

  protected submit(): void {
    if (this.form.invalid || this.loading()) return;
    const value = this.form.getRawValue();
    if (value.new_password !== value.new_password_confirm) {
      this.errors.set({
        new_password_confirm: [this.transloco.translate('profile.password_mismatch')],
      });
      return;
    }
    this.loading.set(true);
    this.errors.set(null);

    const payload: PasswordChangeRequest = {
      current_password: value.current_password,
      new_password: value.new_password,
    };
    this.authApi
      .authPasswordChangeCreate({ passwordChangeRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.toast.success('profile.password_changed');
          this.router.navigate(['/profile']);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.applyError(err);
        },
      });
  }

  protected cancel(): void {
    this.router.navigate(['/profile']);
  }

  private applyError(err: HttpErrorResponse): void {
    const code = (err?.error as { code?: string } | null | undefined)?.code;
    if (code === 'current_password_invalid') {
      this.errors.set({
        current_password: [this.transloco.translate('profile.errors.current_password_invalid')],
      });
      return;
    }
    if (code === 'password_unchanged') {
      this.errors.set({
        new_password: [this.transloco.translate('profile.errors.password_unchanged')],
      });
      return;
    }
    const { fields, detail } = extractServerError(err);
    if (fields) {
      this.errors.set(fields);
      return;
    }
    this.toast.error(detail ?? 'profile.errors.unknown');
  }
}
