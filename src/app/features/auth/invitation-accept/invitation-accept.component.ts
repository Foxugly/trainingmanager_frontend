import { KeyValuePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';
import { InvitationsService } from '../../../api/api/invitations.service';
import { CompleteInvitationRequest } from '../../../api/model/complete-invitation-request';
import { InvitationStatusEnum } from '../../../api/model/invitation-status-enum';
import { ValidateInvitation } from '../../../api/model/validate-invitation';
import { AuthService } from '../../../core/auth/auth.service';

interface FieldErrors {
  [field: string]: string[];
}

type LookupErrorKind = 'expired' | 'completed' | 'cancelled' | 'unknown';

const matchPasswords = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirm = control.get('password_confirm')?.value;
  if (password && confirm && password !== confirm) {
    return { password_mismatch: true };
  }
  return null;
};

@Component({
  selector: 'app-invitation-accept',
  imports: [
    KeyValuePipe,
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Password,
    Button,
    Message,
    TranslocoPipe,
  ],
  templateUrl: './invitation-accept.component.html',
  styleUrl: './invitation-accept.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvitationAcceptComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invitationsService = inject(InvitationsService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly token = signal<string | null>(null);
  protected readonly invitation = signal<ValidateInvitation | null>(null);
  protected readonly loading = signal(true);
  protected readonly lookupError = signal<LookupErrorKind | null>(null);
  protected readonly accepting = signal(false);
  protected readonly acceptError = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly currentUser = this.authService.currentUser;

  protected readonly canSubmit = computed(
    () => this.invitation()?.status === InvitationStatusEnum.Pending,
  );

  protected readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      password_confirm: ['', [Validators.required]],
    },
    { validators: matchPasswords },
  );

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.lookupError.set('unknown');
      this.loading.set(false);
      return;
    }
    this.token.set(token);
    this.invitationsService
      .invitationsLookupRetrieve({ token })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (inv) => {
          this.invitation.set(inv);
          if (inv.status !== InvitationStatusEnum.Pending) {
            this.lookupError.set(this.statusErrorKind(inv.status));
          }
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.lookupError.set(this.lookupErrorKind(err));
          this.loading.set(false);
        },
      });
  }

  protected submit(): void {
    const token = this.token();
    if (!token || this.form.invalid || !this.canSubmit()) return;

    this.accepting.set(true);
    this.acceptError.set(null);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const payload: CompleteInvitationRequest = {
      password: value.password,
    };

    this.invitationsService
      .invitationsLookupCreate({ token, completeInvitationRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.authService
            .loginWithTokens(res.access, res.refresh)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.messageService.add({
                  severity: 'success',
                  summary: this.transloco.translate('common.success'),
                  detail: this.transloco.translate('invitation_accept.success'),
                });
                this.router.navigate(['/teams']);
              },
              error: () => {
                this.acceptError.set('invitation_accept.errors.login_failed');
                this.accepting.set(false);
              },
            });
        },
        error: (err: HttpErrorResponse) => {
          this.applyAcceptError(err);
          this.accepting.set(false);
        },
      });
  }

  protected logout(): void {
    this.authService.logout();
  }

  private lookupErrorKind(err: HttpErrorResponse): LookupErrorKind {
    if (err?.status === 410) return 'expired';
    const code = (err?.error as { code?: string } | null)?.code;
    if (code === 'invitation_expired') return 'expired';
    if (code === 'invitation_completed') return 'completed';
    if (code === 'invitation_cancelled') return 'cancelled';
    return 'unknown';
  }

  private statusErrorKind(status: InvitationStatusEnum): LookupErrorKind {
    switch (status) {
      case InvitationStatusEnum.Expired:
        return 'expired';
      case InvitationStatusEnum.Completed:
        return 'completed';
      case InvitationStatusEnum.Cancelled:
        return 'cancelled';
      default:
        return 'unknown';
    }
  }

  private applyAcceptError(err: HttpErrorResponse): void {
    const body = err?.error as
      | { code?: string; detail?: string; fields?: FieldErrors }
      | null
      | undefined;

    if (body?.code === 'invitation_expired') {
      this.lookupError.set('expired');
      return;
    }
    if (body?.code === 'invitation_completed') {
      this.lookupError.set('completed');
      return;
    }
    if (body?.code === 'invitation_cancelled') {
      this.lookupError.set('cancelled');
      return;
    }

    if (body?.fields && Object.keys(body.fields).length > 0) {
      this.fieldErrors.set(body.fields);
      return;
    }

    this.acceptError.set(body?.detail ?? 'invitation_accept.errors.unknown');
  }
}
