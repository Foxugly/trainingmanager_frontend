import { DatePipe, KeyValuePipe, UpperCasePipe } from '@angular/common';
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
import { ConfirmationService } from 'primeng/api';
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
import { JoinRequestsService } from '../../../api/api/join-requests.service';
import { MembersService } from '../../../api/api/members.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CreateJoinRequestRequest } from '../../../api/model/create-join-request-request';
import { JoinRequestStatusEnum } from '../../../api/model/join-request-status-enum';
import { Team } from '../../../api/model/team';
import { TeamJoinRequest } from '../../../api/model/team-join-request';
import { TeamMembership } from '../../../api/model/team-membership';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { MemberMembershipService } from '../member-membership.service';
import { TeamRole } from '../teams-list/teams-list.component';
import { ProgramsListComponent } from '../../programs/programs-list/programs-list.component';
import { TeamRequestsComponent } from '../team-requests/team-requests.component';
import { TeamStatsComponent } from '../team-stats/team-stats.component';
import { TeamAuditLogComponent } from '../team-audit-log/team-audit-log.component';
import { TeamRosterHistoryComponent } from '../team-roster-history/team-roster-history.component';
import { TeamTemplatesComponent } from '../team-templates/team-templates.component';
import { MemberNotesComponent } from '../member-notes/member-notes.component';
import { PerformancePanelComponent } from '../../../shared/ui/performance-panel/performance-panel.component';
import {
  TeamDiscussionsComponent,
  type DiscussionRole,
} from '../team-discussions/team-discussions.component';
import { DetailHeaderComponent } from '../../../shared/ui/detail-header/detail-header.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
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
    DatePipe,
    KeyValuePipe,
    UpperCasePipe,
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
    TeamRosterHistoryComponent,
    TeamTemplatesComponent,
    TeamRequestsComponent,
    TeamAuditLogComponent,
    MemberNotesComponent,
    PerformancePanelComponent,
    TeamDiscussionsComponent,
    DetailHeaderComponent,
    EmptyStateComponent,
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
  private readonly joinRequestsService = inject(JoinRequestsService);
  private readonly membersService = inject(MembersService);
  private readonly memberMembershipService = inject(MemberMembershipService);
  private readonly authService = inject(AuthService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly teamId = signal<number | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly memberships = signal<TeamMembership[]>([]);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  /** Set when the team fetch fails with a non-404 status (server/network);
   *  surfaced as an inline error block with a retry, distinct from notFound. */
  protected readonly loadError = signal(false);

  protected readonly activeValue = signal(false);
  protected readonly patchActive = (id: number, value: boolean) =>
    this.teamsService.teamsPartialUpdate({ id, patchedTeamRequest: { is_active: value } });
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

  /** Pending join-requests + invitations total, emitted by app-team-requests,
   *  for the "Requests" tab badge. */
  protected readonly requestsCount = signal(0);

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

  /** Viewer's role as the discussions panel expects it (member-or-above). */
  protected readonly discussionRole = computed<DiscussionRole | null>(() => {
    const role = this.currentUserRole();
    return role === 'owner' || role === 'manager' || role === 'member' ? role : null;
  });

  protected readonly currentUserId = computed<number>(
    () => this.authService.currentUser()?.id ?? 0,
  );

  /** Optional deep-link target topic id from ?topic=<id>. */
  protected readonly initialTopicId = signal<number | null>(null);

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

  /** app-team-requests emitted its pending count → drives the tab badge. */
  protected onRequestsCountChange(n: number): void {
    this.requestsCount.set(n);
  }

  /** app-team-requests accepted a join request (a member was added) → refresh. */
  protected onMembershipsChanged(): void {
    const id = this.teamId();
    if (id !== null) this.loadMemberships(id);
  }

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

  // --- RGPD anonymize (coach-only, irreversible) ---
  protected readonly anonymizing = signal(false);

  /** Tracks the active tab; the audit log loads lazily via app-team-audit-log,
   *  which the template renders only when this tab is active + the viewer manages. */
  protected onTabChange(value: string): void {
    this.activeTab.set(value);
  }

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

  protected confirmAnonymizeMember(mb: TeamMembership): void {
    // Hard gate: only coaches (owner/manager) may anonymize.
    if (!this.canManage()) return;
    this.confirmationService.confirm({
      header: this.transloco.translate('rgpd.anonymize.confirm_title'),
      message: this.transloco.translate('rgpd.anonymize.confirm_body'),
      acceptLabel: this.transloco.translate('rgpd.anonymize.accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.anonymizeMember(mb),
    });
  }

  private anonymizeMember(mb: TeamMembership): void {
    const id = this.teamId();
    if (id === null || !this.canManage()) return;
    this.anonymizing.set(true);
    this.membersService
      .membersAnonymize({ id: mb.member })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.anonymizing.set(false);
          this.notesDialogOpen.set(false);
          this.notesMembership.set(null);
          this.toast.success('rgpd.anonymize.toast');
          this.loadMemberships(id);
        },
        error: () => {
          this.anonymizing.set(false);
          this.toast.error('rgpd.anonymize.error');
        },
      });
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

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }
    this.teamId.set(id);

    // Optional deep-link: ?tab=discussions(&topic=<id>) — e.g. from notifications.
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('tab') === 'discussions') {
      this.activeTab.set('discussions');
      const topicParam = qp.get('topic');
      const topicId = topicParam ? Number(topicParam) : NaN;
      if (Number.isFinite(topicId)) this.initialTopicId.set(topicId);
    }

    this.loadTeam(id);
    this.loadMemberships(id);
    // Invitations + join requests are loaded by app-team-requests.
  }

  private loadTeam(id: number): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.loadError.set(false);
    this.teamsService
      .teamsRetrieve({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.team.set(t);
          this.activeValue.set(t.is_active ?? true);
          this.loading.set(false);
          this.maybeLoadMyPendingRequest(t, id);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          // A genuine 404 means the team doesn't exist (or isn't visible) —
          // show the dedicated "not found" copy. Any other status (server error,
          // network failure) is a transient load error: surface it distinctly
          // with a retry + a toast rather than masquerading as "not found".
          if (err?.status === 404) {
            this.notFound.set(true);
          } else {
            this.loadError.set(true);
            this.toast.error('common.load_failed');
          }
        },
      });
  }

  protected reloadTeam(): void {
    const id = this.teamId();
    if (id !== null) this.loadTeam(id);
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
      .teamsMembershipsList({ teamPk: id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.memberships.set(list ?? []),
        error: () => {
          // Don't silently leave a stale/empty roster — tell the user it failed.
          this.toast.error('common.load_failed');
        },
      });
  }

  private loadMyPendingRequest(teamId: number): void {
    const me = this.authService.currentUser();
    if (!me) return;
    this.loadingMyRequest.set(true);
    this.joinRequestsService
      .joinRequestsList({
        status: JoinRequestStatusEnum.Pending,
        team: teamId,
      })
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
    const payload: CreateJoinRequestRequest = {
      team: teamId,
      ...(message ? { message } : {}),
    };
    this.joinRequestsService
      .joinRequestsCreate({ createJoinRequestRequest: payload })
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
    this.toast.success('teams.join_request.sent');
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
      this.toast.info('teams.join_request.errors.already_member');
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
      .joinRequestsPartialUpdate({
        id: req.id,
        patchedTeamJoinRequestRequest: { status: JoinRequestStatusEnum.Cancelled },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancellingMyRequest.set(false);
          this.myPendingRequest.set(null);
          this.toast.success('teams.join_request.cancelled');
        },
        error: () => {
          this.cancellingMyRequest.set(false);
          // Whatever happened (request_already_handled etc.), re-sync.
          this.loadMyPendingRequest(teamId);
          this.loadMemberships(teamId);
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
          this.toast.success('teams.member_dialog.added');
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
      .teamsPartialUpdate({ id, patchedTeamRequest: { managers_ids: newManagerIds } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.team.set(updated);
          this.toast.success('teams.manager_dialog.added');
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
      .teamsMembershipsDestroy({ id: mb.id, teamPk: id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('teams.detail.removed');
          this.loadMemberships(id);
        },
        error: () => {
          this.toast.error('teams.errors.unknown');
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
      .teamsPartialUpdate({ id, patchedTeamRequest: { is_active: false } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.authService.refreshMe();
          this.toast.success('teams.detail.deactivated');
          this.router.navigate(['/teams']);
        },
        error: () => {
          this.toast.error('teams.errors.unknown');
        },
      });
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
