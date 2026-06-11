import { KeyValuePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Textarea } from 'primeng/textarea';
import { InvitationsService } from '../../../api/api/invitations.service';
import { JoinRequestsService } from '../../../api/api/join-requests.service';
import { CreateInvitationRequest } from '../../../api/model/create-invitation-request';
import { InvitationStatusEnum } from '../../../api/model/invitation-status-enum';
import { JoinRequestStatusEnum } from '../../../api/model/join-request-status-enum';
import { TeamInvitation } from '../../../api/model/team-invitation';
import { TeamJoinRequest } from '../../../api/model/team-join-request';
import { ToastService } from '../../../core/notifications/toast.service';
import { type FieldErrors } from '../../../shared/forms/notify-error';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { LocalizedDatePipe } from '../../../shared/datetime/localized-date.pipe';

/**
 * The team's manager-facing "Requests & Invitations" tab: pending join requests
 * (accept / reject) and pending invitations (invite / cancel), plus the invite
 * and reject dialogs. Self-contained — it owns both lists, their loads and
 * mutations. Extracted from teams-detail.
 *
 * Wiring: takes [teamId]; emits (countChange) so the parent tab badge stays in
 * sync and (membershipsChanged) when accepting a join request adds a member so
 * the parent can refresh its membership list.
 */
@Component({
  selector: 'app-team-requests',
  imports: [
    LocalizedDatePipe,
    KeyValuePipe,
    ReactiveFormsModule,
    Button,
    ConfirmDialog,
    Dialog,
    InputText,
    Message,
    Textarea,
    TranslocoPipe,
    EmptyStateComponent,
  ],
  templateUrl: './team-requests.component.html',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamRequestsComponent {
  private readonly invitationsService = inject(InvitationsService);
  private readonly joinRequestsService = inject(JoinRequestsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();

  /** Pending join-requests + invitations total, for the parent's tab badge. */
  readonly countChange = output<number>();
  /** A join request was accepted → a member was added; parent should refresh. */
  readonly membershipsChanged = output<void>();

  protected readonly invitations = signal<TeamInvitation[]>([]);
  protected readonly loadingInvitations = signal(false);
  protected readonly showInviteDialog = signal(false);
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly inviteFieldErrors = signal<FieldErrors | null>(null);

  protected readonly joinRequests = signal<TeamJoinRequest[]>([]);
  protected readonly loadingJoinRequests = signal(false);
  protected readonly processingRequestId = signal<number | null>(null);
  protected readonly rejectingRequest = signal<TeamJoinRequest | null>(null);
  protected readonly rejectMessage = signal('');

  protected readonly inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    firstname: ['', [Validators.required]],
    lastname: ['', [Validators.required]],
  });

  constructor() {
    // Reactively (re)load both lists whenever the teamId input changes.
    // switchMap cancels in-flight requests if the team switches mid-load and
    // forkJoin runs the two list calls in parallel — a data stream, not a
    // side-effecting effect(). Each call falls back to null on error so its
    // existing list is left untouched (loading flags still settle below).
    toObservable(this.teamId)
      .pipe(
        tap(() => {
          this.loadingInvitations.set(true);
          this.loadingJoinRequests.set(true);
        }),
        switchMap((id) =>
          forkJoin({
            requests: this.joinRequestsService
              .joinRequestsList({ status: JoinRequestStatusEnum.Pending, team: id })
              .pipe(catchError(() => of(null))),
            invitations: this.invitationsService
              .invitationsList({ status: InvitationStatusEnum.Pending, team: id })
              .pipe(catchError(() => of(null))),
          }).pipe(
            tap(({ requests, invitations }) => {
              if (requests) this.joinRequests.set(requests.results ?? []);
              if (invitations) this.invitations.set(invitations.results ?? []);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.loadingInvitations.set(false);
        this.loadingJoinRequests.set(false);
        // Keep the parent's badge in sync once both lists have (re)loaded.
        this.emitCount();
      });
  }

  /**
   * Emit the current pending total to the parent's tab badge. Called explicitly
   * after every (re)load and after each local mutation — deliberately NOT from
   * an effect(): emitting an output inside an effect is an Angular anti-pattern
   * (output during change detection risks NG0100 / ExpressionChanged errors).
   */
  private emitCount(): void {
    this.countChange.emit(this.joinRequests().length + this.invitations().length);
  }

  private loadInvitations(id: number): void {
    this.loadingInvitations.set(true);
    this.invitationsService
      .invitationsList({ status: InvitationStatusEnum.Pending, team: id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.invitations.set(res.results ?? []);
          this.loadingInvitations.set(false);
          this.emitCount();
        },
        error: () => this.loadingInvitations.set(false),
      });
  }

  private loadJoinRequests(id: number): void {
    this.loadingJoinRequests.set(true);
    this.joinRequestsService
      .joinRequestsList({ status: JoinRequestStatusEnum.Pending, team: id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.joinRequests.set(res.results ?? []);
          this.loadingJoinRequests.set(false);
          this.emitCount();
        },
        error: () => this.loadingJoinRequests.set(false),
      });
  }

  protected confirmAcceptJoinRequest(req: TeamJoinRequest): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('teams.join_requests.accept_confirm_title'),
      message: this.transloco.translate('teams.join_requests.accept_confirm_message'),
      acceptLabel: this.transloco.translate('teams.join_requests.accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => this.acceptJoinRequest(req),
    });
  }

  private acceptJoinRequest(req: TeamJoinRequest): void {
    const teamId = this.teamId();
    this.processingRequestId.set(req.id);
    this.joinRequestsService
      .joinRequestsPartialUpdate({
        id: req.id,
        patchedTeamJoinRequestRequest: { status: JoinRequestStatusEnum.Accepted },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.processingRequestId.set(null);
          this.toast.success('teams.join_requests.accepted');
          this.loadJoinRequests(teamId);
          this.membershipsChanged.emit();
        },
        error: () => {
          this.processingRequestId.set(null);
          this.notifyError();
        },
      });
  }

  protected openRejectDialog(req: TeamJoinRequest): void {
    this.rejectMessage.set('');
    this.rejectingRequest.set(req);
  }

  protected closeRejectDialog(): void {
    this.rejectingRequest.set(null);
    this.rejectMessage.set('');
  }

  protected submitReject(): void {
    const req = this.rejectingRequest();
    if (!req) return;
    const teamId = this.teamId();
    const message = this.rejectMessage().trim();
    this.processingRequestId.set(req.id);
    this.joinRequestsService
      .joinRequestsPartialUpdate({
        id: req.id,
        patchedTeamJoinRequestRequest: {
          status: JoinRequestStatusEnum.Rejected,
          ...(message ? { response_message: message } : {}),
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.processingRequestId.set(null);
          this.rejectingRequest.set(null);
          this.rejectMessage.set('');
          this.toast.success('teams.join_requests.rejected');
          this.loadJoinRequests(teamId);
        },
        error: () => {
          this.processingRequestId.set(null);
          this.notifyError();
        },
      });
  }

  protected openInviteDialog(): void {
    this.inviteForm.reset({ email: '', firstname: '', lastname: '' });
    this.inviteError.set(null);
    this.inviteFieldErrors.set(null);
    this.showInviteDialog.set(true);
  }

  protected closeInviteDialog(): void {
    this.showInviteDialog.set(false);
  }

  protected submitInvite(): void {
    if (this.inviting()) return;
    const id = this.teamId();
    if (this.inviteForm.invalid) return;
    this.inviting.set(true);
    this.inviteError.set(null);
    this.inviteFieldErrors.set(null);

    const value = this.inviteForm.getRawValue();
    const payload: CreateInvitationRequest = {
      team: id,
      email: value.email,
      firstname: value.firstname,
      lastname: value.lastname,
    };
    this.invitationsService
      .invitationsCreate({ createInvitationRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('teams.invite_dialog.sent');
          this.inviting.set(false);
          this.showInviteDialog.set(false);
          this.loadInvitations(id);
        },
        error: (err: HttpErrorResponse) => {
          this.applyInviteError(err);
          this.inviting.set(false);
        },
      });
  }

  protected confirmCancelInvitation(inv: TeamInvitation): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('teams.invitations.cancel_confirm_title'),
      message: this.transloco.translate('teams.invitations.cancel_confirm_message'),
      accept: () => this.cancelInvitation(inv),
    });
  }

  private cancelInvitation(inv: TeamInvitation): void {
    const id = this.teamId();
    this.invitationsService
      .invitationsDestroy({ id: inv.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('teams.invitations.cancelled');
          this.loadInvitations(id);
        },
        error: () => this.notifyError(),
      });
  }

  private applyInviteError(err: HttpErrorResponse): void {
    const body = err?.error as
      | { code?: string; detail?: string; fields?: FieldErrors }
      | null
      | undefined;

    const matchKnown = (s: string): string | null => {
      if (/already_pending|invitation.*exists|already_invited/i.test(s)) {
        return 'teams.errors.invitation_already_pending';
      }
      if (/already_member|email_already_member|already.*member/i.test(s)) {
        return 'teams.errors.email_already_member';
      }
      return null;
    };

    if (body?.fields && Object.keys(body.fields).length > 0) {
      const known = matchKnown(JSON.stringify(body.fields));
      if (known) {
        this.inviteError.set(known);
        return;
      }
      this.inviteFieldErrors.set(body.fields);
      return;
    }
    if (body?.code) {
      const known = matchKnown(body.code);
      if (known) {
        this.inviteError.set(known);
        return;
      }
    }
    this.inviteError.set(body?.detail ?? 'teams.errors.unknown');
  }

  private notifyError(): void {
    this.toast.error('teams.errors.unknown');
  }
}
