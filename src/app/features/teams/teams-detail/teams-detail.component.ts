import { CommonModule, KeyValuePipe } from '@angular/common';
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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { InvitationsService } from '../../../api/api/invitations.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CreateInvitation } from '../../../api/model/create-invitation';
import { InvitationStatusEnum } from '../../../api/model/invitation-status-enum';
import { Team } from '../../../api/model/team';
import { TeamInvitation } from '../../../api/model/team-invitation';
import { TeamMembership } from '../../../api/model/team-membership';
import { AuthService } from '../../../core/auth/auth.service';
import { MemberMembershipService } from '../member-membership.service';
import { TeamRole, computeTeamRole } from '../teams-list/teams-list.component';
import { ProgramsListComponent } from '../../programs/programs-list/programs-list.component';

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-teams-detail',
  imports: [
    CommonModule,
    KeyValuePipe,
    ReactiveFormsModule,
    RouterLink,
    Button,
    ConfirmDialog,
    Dialog,
    InputText,
    Message,
    TranslocoPipe,
    ProgramsListComponent,
  ],
  templateUrl: './teams-detail.component.html',
  styleUrl: './teams-detail.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsDetailComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly teamsService = inject(TeamsService);
  private readonly invitationsService = inject(InvitationsService);
  private readonly memberMembershipService = inject(MemberMembershipService);
  private readonly authService = inject(AuthService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly teamId = signal<number | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly memberships = signal<TeamMembership[]>([]);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);

  protected readonly showAddMemberDialog = signal(false);
  protected readonly addingMember = signal(false);
  protected readonly addMemberError = signal<string | null>(null);
  protected readonly addMemberFieldErrors = signal<FieldErrors | null>(null);

  protected readonly invitations = signal<TeamInvitation[]>([]);
  protected readonly loadingInvitations = signal(false);
  protected readonly showInviteDialog = signal(false);
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly inviteFieldErrors = signal<FieldErrors | null>(null);

  protected readonly currentUserRole = computed<TeamRole | null>(() => {
    const t = this.team();
    const userId = this.authService.currentUser()?.id;
    if (!t || userId == null) return null;
    return computeTeamRole(t, userId);
  });

  protected readonly canManage = computed(() => {
    const role = this.currentUserRole();
    return role === 'owner' || role === 'manager';
  });

  protected readonly isOwner = computed(() => this.currentUserRole() === 'owner');

  protected readonly roleClasses: Record<TeamRole, string> = {
    owner: 'text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-800',
    manager: 'text-xs font-semibold px-2 py-1 rounded bg-purple-100 text-purple-800',
    member: 'text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-800',
  };

  protected readonly addMemberForm = this.fb.nonNullable.group({
    firstname: ['', [Validators.required]],
    lastname: ['', [Validators.required]],
    email: [''],
    phonenumber: [''],
  });

  protected readonly inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    firstname: ['', [Validators.required]],
    lastname: ['', [Validators.required]],
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }
    this.teamId.set(id);
    this.loadTeam(id);
    this.loadMemberships(id);
    this.loadInvitations(id);
  }

  private loadTeam(id: number): void {
    this.loading.set(true);
    this.teamsService
      .teamsRetrieve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.team.set(t);
          this.loading.set(false);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  private loadMemberships(id: number): void {
    this.teamsService
      .teamsMembershipsList(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.memberships.set(list ?? []),
      });
  }

  private loadInvitations(id: number): void {
    this.loadingInvitations.set(true);
    this.invitationsService
      .invitationsList(undefined, undefined, undefined, InvitationStatusEnum.Pending, id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.invitations.set(res.results ?? []);
          this.loadingInvitations.set(false);
        },
        error: () => this.loadingInvitations.set(false),
      });
  }

  protected openAddMember(): void {
    this.addMemberForm.reset({ firstname: '', lastname: '', email: '', phonenumber: '' });
    this.addMemberError.set(null);
    this.addMemberFieldErrors.set(null);
    this.showAddMemberDialog.set(true);
  }

  protected closeAddMember(): void {
    this.showAddMemberDialog.set(false);
  }

  protected submitAddMember(): void {
    const id = this.teamId();
    if (id === null || this.addMemberForm.invalid) return;

    this.addingMember.set(true);
    this.addMemberError.set(null);
    this.addMemberFieldErrors.set(null);

    const value = this.addMemberForm.getRawValue();
    const payload = {
      firstname: value.firstname,
      lastname: value.lastname,
      email: value.email || null,
      phonenumber: value.phonenumber || null,
    };

    this.memberMembershipService
      .createMemberAndAttach(payload, id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.member_dialog.added'),
          });
          this.addingMember.set(false);
          this.showAddMemberDialog.set(false);
          this.loadMemberships(id);
        },
        error: (err: HttpErrorResponse) => {
          this.applyAddMemberError(err);
          this.addingMember.set(false);
        },
      });
  }

  protected confirmRemoveMember(mb: TeamMembership): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('teams.detail.remove_confirm_title'),
      message: this.transloco.translate('teams.detail.remove_confirm_message'),
      accept: () => this.removeMember(mb),
    });
  }

  private removeMember(mb: TeamMembership): void {
    const id = this.teamId();
    if (id === null) return;
    this.teamsService
      .teamsMembershipsDestroy(mb.id, id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.detail.removed'),
          });
          this.loadMemberships(id);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('teams.errors.unknown'),
          });
        },
      });
  }

  protected confirmDeactivate(): void {
    const id = this.teamId();
    if (id === null) return;
    this.confirmationService.confirm({
      header: this.transloco.translate('teams.detail.deactivate_confirm_title'),
      message: this.transloco.translate('teams.detail.deactivate_confirm_message'),
      accept: () => this.deactivate(id),
    });
  }

  private deactivate(id: number): void {
    this.teamsService
      .teamsPartialUpdate(id, { is_active: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.detail.deactivated'),
          });
          this.router.navigate(['/teams']);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('teams.errors.unknown'),
          });
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
    const id = this.teamId();
    if (id === null || this.inviteForm.invalid) return;

    this.inviting.set(true);
    this.inviteError.set(null);
    this.inviteFieldErrors.set(null);

    const value = this.inviteForm.getRawValue();
    const payload: CreateInvitation = {
      team: id,
      email: value.email,
      firstname: value.firstname,
      lastname: value.lastname,
    };

    this.invitationsService
      .invitationsCreate(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.invite_dialog.sent'),
          });
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
    if (id === null) return;
    this.invitationsService
      .invitationsDestroy(inv.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.invitations.cancelled'),
          });
          this.loadInvitations(id);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('teams.errors.unknown'),
          });
        },
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
      const flat = JSON.stringify(body.fields);
      const known = matchKnown(flat);
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

  private applyAddMemberError(err: HttpErrorResponse): void {
    const body = err?.error as
      | { code?: string; detail?: string; fields?: FieldErrors }
      | null
      | undefined;

    if (body?.fields && Object.keys(body.fields).length > 0) {
      const userIdErrors = body.fields['user_id'];
      if (userIdErrors?.some((e) => /already_has_member/i.test(JSON.stringify(e)))) {
        this.addMemberError.set('teams.errors.user_already_has_member');
        return;
      }
      this.addMemberFieldErrors.set(body.fields);
      return;
    }
    this.addMemberError.set(body?.detail ?? 'teams.errors.unknown');
  }
}
