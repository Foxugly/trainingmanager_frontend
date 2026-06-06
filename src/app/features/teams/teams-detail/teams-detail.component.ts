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
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Badge } from 'primeng/badge';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Textarea } from 'primeng/textarea';
import { Tooltip } from 'primeng/tooltip';
import { InvitationsService } from '../../../api/api/invitations.service';
import { JoinRequestsService } from '../../../api/api/join-requests.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CreateInvitation } from '../../../api/model/create-invitation';
import { CreateJoinRequest } from '../../../api/model/create-join-request';
import { InvitationStatusEnum } from '../../../api/model/invitation-status-enum';
import { JoinRequestStatusEnum } from '../../../api/model/join-request-status-enum';
import { PatchedTeam } from '../../../api/model/patched-team';
import { Team } from '../../../api/model/team';
import { TeamInvitation } from '../../../api/model/team-invitation';
import { TeamJoinRequest } from '../../../api/model/team-join-request';
import { TeamMembership } from '../../../api/model/team-membership';
import { AuthService } from '../../../core/auth/auth.service';
import { MemberMembershipService } from '../member-membership.service';
import { TeamRole } from '../teams-list/teams-list.component';
import { ProgramsListComponent } from '../../programs/programs-list/programs-list.component';
import { TeamStatsComponent } from '../team-stats/team-stats.component';
import { MemberNotesComponent } from '../member-notes/member-notes.component';
import { DetailHeaderComponent } from '../../../shared/ui/detail-header/detail-header.component';
import {
  ActiveToggleComponent,
  ActiveToggleLabels,
} from '../../../shared/ui/active-toggle/active-toggle.component';

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-teams-detail',
  imports: [
    CommonModule,
    KeyValuePipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    Badge,
    Button,
    ConfirmDialog,
    Dialog,
    InputText,
    Message,
    Select,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
    Textarea,
    Tooltip,
    TranslocoPipe,
    ProgramsListComponent,
    TeamStatsComponent,
    MemberNotesComponent,
    DetailHeaderComponent,
    ActiveToggleComponent,
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
  private readonly joinRequestsService = inject(JoinRequestsService);
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

  protected readonly activeValue = signal(false);
  protected readonly patchActive = (id: number, value: boolean) =>
    this.teamsService.teamsPartialUpdate(id, { is_active: value } as PatchedTeam);
  protected readonly activeLabels = computed<ActiveToggleLabels>(() => ({
    active: this.transloco.translate('common.active'),
    inactive: this.transloco.translate('common.inactive'),
    confirm: this.transloco.translate('common.confirm_deactivate'),
    errorSummary: this.transloco.translate('common.error'),
    errorDetail: this.transloco.translate('common.update_failed'),
  }));

  protected readonly showAddMemberDialog = signal(false);
  protected readonly addingMember = signal(false);
  protected readonly addMemberError = signal<string | null>(null);
  protected readonly addMemberFieldErrors = signal<FieldErrors | null>(null);

  protected readonly showAddManagerDialog = signal(false);
  protected readonly addingManager = signal(false);
  protected readonly addManagerError = signal<string | null>(null);
  protected readonly newManagerMemberId = signal<number | null>(null);

  protected readonly memberFilter = signal<string>('');

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

  protected readonly myPendingRequest = signal<TeamJoinRequest | null>(null);
  protected readonly loadingMyRequest = signal(false);
  protected readonly showJoinDialog = signal(false);
  protected readonly submittingJoinRequest = signal(false);
  protected readonly cancellingMyRequest = signal(false);
  protected readonly joinMessage = signal('');
  protected readonly joinError = signal<string | null>(null);

  protected readonly currentUserRole = computed<TeamRole | null>(() => {
    const t = this.team();
    const me = this.authService.currentUser();
    if (!t || !me) return null;
    if (t.owner?.id === me.id) return 'owner';
    if (t.managers?.some((m) => m.id === me.id)) return 'manager';
    if (this.memberships().some((mb) => mb.member_username === me.username)) return 'member';
    return null;
  });

  protected readonly isMemberOrAbove = computed(() => this.currentUserRole() !== null);

  protected readonly canRequestJoin = computed<boolean>(() => {
    const t = this.team();
    if (!t || !t.is_public) return false;
    if (this.isMemberOrAbove()) return false;
    if (this.myPendingRequest() !== null) return false;
    if (this.loadingMyRequest()) return false;
    return true;
  });

  protected readonly canManage = computed(() => {
    const role = this.currentUserRole();
    return role === 'owner' || role === 'manager';
  });

  protected readonly isOwner = computed(() => this.currentUserRole() === 'owner');

  protected readonly promotableMembers = computed(() => {
    const t = this.team();
    if (!t) return [];
    const managerIds = new Set((t.managers ?? []).map((m) => m.id));
    return this.memberships().filter((mb) => !managerIds.has(mb.member));
  });

  protected readonly filteredMemberships = computed(() => {
    const q = this.memberFilter().trim().toLowerCase();
    const list = this.memberships();
    if (q.length === 0) return list;
    return list.filter(
      (mb) =>
        (mb.member_fullname ?? '').toLowerCase().includes(q) ||
        (mb.member_username ?? '').toLowerCase().includes(q),
    );
  });

  protected readonly activeTab = signal<string>('programs');

  protected readonly requestsInvitationsCount = computed(
    () => this.joinRequests().length + this.invitations().length,
  );

  protected readonly myMembership = computed(() => {
    const me = this.authService.currentUser();
    if (!me) return null;
    return this.memberships().find((mb) => mb.member_username === me.username) ?? null;
  });

  /**
   * The current user's member id for THIS team, resolved from the loaded
   * memberships (TeamMembership.member). Null when the viewer is not an
   * athlete-member of the team. Used to scope the athlete self-view.
   */
  protected readonly myMemberId = computed<number | null>(
    () => this.myMembership()?.member ?? null,
  );

  /**
   * Athlete tab is for members who are athletes of the team but NOT managers
   * (managers use the aggregate Statistiques tab + drill-down). Requires a
   * resolvable member id.
   */
  protected readonly isAthleteMember = computed(
    () => !this.canManage() && this.myMemberId() !== null,
  );

  /** Drill-down target on the manager Statistiques tab; null = team aggregate. */
  protected readonly selectedStatsMember = signal<number | null>(null);

  // --- Coach notes dialog (per member) ---
  protected readonly notesDialogOpen = signal(false);
  protected readonly notesMembership = signal<TeamMembership | null>(null);

  protected openNotes(mb: TeamMembership): void {
    this.notesMembership.set(mb);
    this.notesDialogOpen.set(true);
  }

  protected onNotesDialogVisibleChange(value: boolean): void {
    this.notesDialogOpen.set(value);
    if (!value) {
      this.notesMembership.set(null);
    }
  }

  protected readonly roleClasses: Record<TeamRole, string> = {
    owner: 'text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-800',
    manager: 'text-xs font-semibold px-2 py-1 rounded bg-emerald-100 text-emerald-800',
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
    this.loadJoinRequests(id);
  }

  private loadTeam(id: number): void {
    this.loading.set(true);
    this.teamsService
      .teamsRetrieve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.team.set(t);
          this.activeValue.set(t.is_active ?? true);
          this.loading.set(false);
          this.maybeLoadMyPendingRequest(t, id);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  private maybeLoadMyPendingRequest(t: Team, teamId: number): void {
    const me = this.authService.currentUser();
    if (!me || !t.is_public) return;
    const isOwner = t.owner?.id === me.id;
    const isManager = t.managers?.some((m) => m.id === me.id) ?? false;
    if (isOwner || isManager) return;
    this.loadMyPendingRequest(teamId);
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
      .invitationsList(undefined, undefined, undefined, undefined, InvitationStatusEnum.Pending, id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.invitations.set(res.results ?? []);
          this.loadingInvitations.set(false);
        },
        error: () => this.loadingInvitations.set(false),
      });
  }

  private loadJoinRequests(id: number): void {
    this.loadingJoinRequests.set(true);
    this.joinRequestsService
      .joinRequestsList(
        undefined,
        undefined,
        undefined,
        undefined,
        JoinRequestStatusEnum.Pending,
        id,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.joinRequests.set(res.results ?? []);
          this.loadingJoinRequests.set(false);
        },
        error: () => this.loadingJoinRequests.set(false),
      });
  }

  private loadMyPendingRequest(teamId: number): void {
    const me = this.authService.currentUser();
    if (!me) return;
    this.loadingMyRequest.set(true);
    this.joinRequestsService
      .joinRequestsList(
        undefined,
        undefined,
        undefined,
        undefined,
        JoinRequestStatusEnum.Pending,
        teamId,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const mine = (res.results ?? []).find((r) => r.user === me.id) ?? null;
          this.myPendingRequest.set(mine);
          this.loadingMyRequest.set(false);
        },
        error: () => {
          this.myPendingRequest.set(null);
          this.loadingMyRequest.set(false);
        },
      });
  }

  protected openJoinDialog(): void {
    this.joinMessage.set('');
    this.joinError.set(null);
    this.showJoinDialog.set(true);
  }

  protected closeJoinDialog(): void {
    this.showJoinDialog.set(false);
  }

  protected submitJoinRequest(): void {
    const teamId = this.teamId();
    if (teamId === null) return;
    this.submittingJoinRequest.set(true);
    this.joinError.set(null);
    const message = this.joinMessage().trim();
    const payload: CreateJoinRequest = {
      id: 0,
      team: teamId,
      ...(message ? { message } : {}),
    };
    this.joinRequestsService
      .joinRequestsCreate(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.submittingJoinRequest.set(false);
          this.showJoinDialog.set(false);
          // CreateJoinRequest response shape doesn't include status —
          // re-fetch via list to discover whether the auto-policy
          // accepted it or not.
          this.handlePostJoinSubmit(teamId, created.id);
        },
        error: (err: HttpErrorResponse) => {
          this.submittingJoinRequest.set(false);
          this.applyJoinError(err, teamId);
        },
      });
  }

  private handlePostJoinSubmit(teamId: number, _createdId: number): void {
    // Re-load my pending request: if it's there, manual policy → show chip.
    // Re-load memberships: if I'm now in there, auto policy accepted → CTA disappears.
    this.loadMyPendingRequest(teamId);
    this.loadMemberships(teamId);
    this.loadTeam(teamId);
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate('teams.join_request.sent'),
    });
  }

  private applyJoinError(err: HttpErrorResponse, teamId: number): void {
    const body = err?.error as
      | { code?: string; detail?: string; fields?: { team?: Array<{ code?: string }> } }
      | null
      | undefined;
    const teamErrCode = body?.fields?.team?.[0]?.code;

    if (teamErrCode === 'pending_request_exists') {
      // Already have a pending request — load it to render the chip.
      this.loadMyPendingRequest(teamId);
      this.showJoinDialog.set(false);
      return;
    }
    if (teamErrCode === 'already_member') {
      // Already a member — refresh memberships so CTA disappears.
      this.loadMemberships(teamId);
      this.showJoinDialog.set(false);
      this.messageService.add({
        severity: 'info',
        summary: this.transloco.translate('common.success'),
        detail: this.transloco.translate('teams.join_request.errors.already_member'),
      });
      return;
    }
    if (teamErrCode === 'team_not_active') {
      this.joinError.set('teams.join_request.errors.team_not_active');
      return;
    }
    if (teamErrCode === 'team_not_public') {
      this.joinError.set('teams.join_request.errors.team_not_public');
      return;
    }
    this.joinError.set(body?.detail ?? 'teams.errors.unknown');
  }

  protected confirmCancelMyRequest(): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('teams.join_request.cancel_confirm_title'),
      message: this.transloco.translate('teams.join_request.cancel_confirm_message'),
      acceptLabel: this.transloco.translate('teams.join_request.cancel_accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.cancelMyRequest(),
    });
  }

  private cancelMyRequest(): void {
    const req = this.myPendingRequest();
    const teamId = this.teamId();
    if (!req || teamId === null) return;
    this.cancellingMyRequest.set(true);
    this.joinRequestsService
      .joinRequestsPartialUpdate(req.id, { status: JoinRequestStatusEnum.Cancelled })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancellingMyRequest.set(false);
          this.myPendingRequest.set(null);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.join_request.cancelled'),
          });
        },
        error: () => {
          this.cancellingMyRequest.set(false);
          // Whatever happened (request_already_handled etc.), re-sync.
          this.loadMyPendingRequest(teamId);
          this.loadMemberships(teamId);
        },
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
    if (teamId === null) return;
    this.processingRequestId.set(req.id);
    this.joinRequestsService
      .joinRequestsPartialUpdate(req.id, { status: JoinRequestStatusEnum.Accepted })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.processingRequestId.set(null);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.join_requests.accepted'),
          });
          this.loadJoinRequests(teamId);
          this.loadMemberships(teamId);
        },
        error: () => {
          this.processingRequestId.set(null);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('teams.errors.unknown'),
          });
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
    const teamId = this.teamId();
    if (!req || teamId === null) return;
    const message = this.rejectMessage().trim();
    this.processingRequestId.set(req.id);
    this.joinRequestsService
      .joinRequestsPartialUpdate(req.id, {
        status: JoinRequestStatusEnum.Rejected,
        ...(message ? { response_message: message } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.processingRequestId.set(null);
          this.rejectingRequest.set(null);
          this.rejectMessage.set('');
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.join_requests.rejected'),
          });
          this.loadJoinRequests(teamId);
        },
        error: () => {
          this.processingRequestId.set(null);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('teams.errors.unknown'),
          });
        },
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

  protected openAddManager(): void {
    this.newManagerMemberId.set(null);
    this.addManagerError.set(null);
    this.showAddManagerDialog.set(true);
  }

  protected closeAddManager(): void {
    if (this.addingManager()) return;
    this.showAddManagerDialog.set(false);
  }

  protected submitAddManager(): void {
    const id = this.teamId();
    const t = this.team();
    const memberId = this.newManagerMemberId();
    if (id === null || t === null || memberId === null) return;

    this.addingManager.set(true);
    this.addManagerError.set(null);

    const newManagerIds = [...(t.managers ?? []).map((m) => m.id), memberId];
    this.teamsService
      .teamsPartialUpdate(id, { managers_ids: newManagerIds })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.team.set(updated);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.manager_dialog.added'),
          });
          this.addingManager.set(false);
          this.showAddManagerDialog.set(false);
        },
        error: (err: HttpErrorResponse) => {
          const detail = (err?.error as { detail?: string } | null)?.detail;
          this.addManagerError.set(detail ?? 'teams.errors.unknown');
          this.addingManager.set(false);
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
          this.authService.refreshMe();
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
