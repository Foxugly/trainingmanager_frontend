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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Skeleton } from 'primeng/skeleton';
import { forkJoin } from 'rxjs';
import { ShortTimePipe } from '../../shared/datetime/short-time.pipe';
import { LocalizedDatePipe } from '../../shared/datetime/localized-date.pipe';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PerformancePanelComponent } from '../../shared/ui/performance-panel/performance-panel.component';
import { TeamStatsComponent } from '../teams/team-stats/team-stats.component';
import { DashboardService } from '../../api/api/dashboard.service';
import { PerformancesService } from '../../api/api/performances.service';
import { TeamsService } from '../../api/api/teams.service';
import { AttendanceStatus } from '../../api/model/attendance-status';
import { DashboardEvent } from '../../api/model/dashboard-event';
import { DashboardSummary } from '../../api/model/dashboard-summary';
import { Performance } from '../../api/model/performance';
import { Team } from '../../api/model/team';
import { AuthService } from '../../core/auth/auth.service';
import { computeTeamRole } from '../teams/teams-list/teams-list.component';

interface TeamCard {
  team: Team;
  programsActive: number;
  eventsNext7d: number;
  membersCount: number;
}

interface MemberTeamCard {
  team: Team;
  membersCount: number;
}

interface UpcomingEvent {
  event: DashboardEvent;
  teamName: string;
  programName: string;
}

interface AttendancePending {
  event: DashboardEvent;
  teamName: string;
  programName: string;
}

interface AttendanceHistoryItem {
  attendance: { id: number; status_code: string };
  event: DashboardEvent;
  teamName: string;
  programName: string;
  status: AttendanceStatus | null;
}

const UPCOMING_MAX_DISPLAYED = 20;

/** Browser-local date as YYYY-MM-DD — drives the backend's date windows so the
 *  dashboard keeps the previous per-user (local) day boundaries. */
function localTodayParam(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    LocalizedDatePipe,
    FormsModule,
    RouterLink,
    Button,
    Message,
    Select,
    Skeleton,
    EmptyStateComponent,
    PerformancePanelComponent,
    TeamStatsComponent,
    TranslocoPipe,
    ShortTimePipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly teamsService = inject(TeamsService);
  private readonly dashboardService = inject(DashboardService);
  private readonly performancesService = inject(PerformancesService);
  private readonly destroyRef = inject(DestroyRef);

  /** The caller's own performance records across all teams (read-only self-view). */
  protected readonly myPerformances = signal<Performance[]>([]);
  protected readonly myPerformancesError = signal(false);
  protected readonly myPerformancesLoading = signal(false);

  protected readonly greetingName = computed(() => {
    const user = this.authService.currentUser();
    return user?.first_name || user?.email || '';
  });

  /** The caller's linked athlete Member id (null for pure coaches). */
  protected readonly myMemberId = computed<number | null>(
    () => this.authService.currentUser()?.member_id ?? null,
  );

  protected readonly managedTeams = signal<Team[]>([]);
  protected readonly memberTeams = signal<Team[]>([]);
  protected readonly hasManagedTeams = computed(() => this.managedTeams().length > 0);
  protected readonly hasMemberTeams = computed(() => this.memberTeams().length > 0);
  protected readonly isHybrid = computed(() => this.hasManagedTeams() && this.hasMemberTeams());

  // Coach sections
  protected readonly teamCards = signal<TeamCard[]>([]);
  protected readonly upcomingEvents = signal<UpcomingEvent[]>([]);
  protected readonly upcomingTotal = signal(0);
  protected readonly attendancePending = signal<AttendancePending[]>([]);
  protected readonly auditTruncated = signal(false);

  protected readonly loadingTeams = signal(true);
  protected readonly loadingUpcoming = signal(true);
  protected readonly loadingPending = signal(true);
  protected readonly errorTeams = signal(false);
  protected readonly errorUpcoming = signal(false);
  protected readonly errorPending = signal(false);

  // Athlete sections
  protected readonly memberTeamCards = signal<MemberTeamCard[]>([]);
  /** The caller's membership id PER member team. */
  protected readonly myMemberIdByTeam = signal<Map<number, number>>(new Map());
  /** Currently-selected team for the "Mes statistiques" panel (multi-team case). */
  protected readonly selectedStatsTeam = signal<Team | null>(null);
  protected readonly memberUpcomingEvents = signal<UpcomingEvent[]>([]);
  protected readonly memberUpcomingTotal = signal(0);
  protected readonly attendanceHistory = signal<AttendanceHistoryItem[]>([]);
  protected readonly historyAuditTruncated = signal(false);

  protected readonly loadingMemberTeams = signal(true);
  protected readonly loadingMemberUpcoming = signal(true);
  protected readonly loadingHistory = signal(true);
  protected readonly errorMemberTeams = signal(false);
  protected readonly errorMemberUpcoming = signal(false);
  protected readonly errorHistory = signal(false);

  protected readonly bootstrapped = signal(false);

  protected readonly upcomingDisplayed = computed(() =>
    this.upcomingEvents().slice(0, UPCOMING_MAX_DISPLAYED),
  );
  protected readonly upcomingOverflow = computed(() =>
    Math.max(0, this.upcomingTotal() - UPCOMING_MAX_DISPLAYED),
  );
  protected readonly memberUpcomingDisplayed = computed(() =>
    this.memberUpcomingEvents().slice(0, UPCOMING_MAX_DISPLAYED),
  );
  protected readonly memberUpcomingOverflow = computed(() =>
    Math.max(0, this.memberUpcomingTotal() - UPCOMING_MAX_DISPLAYED),
  );

  protected readonly showWelcome = computed(
    () => this.bootstrapped() && !this.hasManagedTeams() && !this.hasMemberTeams(),
  );

  // ---- "Mes statistiques" (athlete) ----------------------------------------

  /** Member teams for which the caller's member id is resolvable (gate for the panel). */
  protected readonly statsTeams = computed<Team[]>(() => {
    const map = this.myMemberIdByTeam();
    return this.memberTeams().filter((t) => map.has(t.id));
  });
  protected readonly hasStats = computed(() => this.statsTeams().length > 0);
  protected readonly multipleStatsTeams = computed(() => this.statsTeams().length > 1);

  /** The team whose stats are shown: the selection (multi) or the only team (single). */
  protected readonly activeStatsTeam = computed<Team | null>(() => {
    const teams = this.statsTeams();
    if (teams.length === 0) return null;
    const selected = this.selectedStatsTeam();
    if (selected && teams.some((t) => t.id === selected.id)) return selected;
    return teams[0];
  });

  /** The caller's member id for the active stats team, or null if unresolved. */
  protected readonly activeStatsMemberId = computed<number | null>(() => {
    const team = this.activeStatsTeam();
    if (!team) return null;
    return this.myMemberIdByTeam().get(team.id) ?? null;
  });

  // ---- "Mes performances" self-service (athlete CRUD) ----------------------

  /** Currently-selected team for the editable own-performances panel. */
  protected readonly selectedPerfTeam = signal<Team | null>(null);

  /**
   * Self-service is available when the user has a linked athlete Member AND
   * belongs to ≥1 team as a member/athlete. Otherwise we fall back to the
   * read-only self-scoped list (or nothing, for a pure coach with no records).
   */
  protected readonly canLogOwnPerformances = computed(
    () => this.myMemberId() !== null && this.memberTeams().length > 0,
  );

  /** The team whose editable perf panel is shown: selection or first member team. */
  protected readonly activePerfTeam = computed<Team | null>(() => {
    const teams = this.memberTeams();
    if (teams.length === 0) return null;
    const selected = this.selectedPerfTeam();
    if (selected && teams.some((t) => t.id === selected.id)) return selected;
    return teams[0];
  });

  protected readonly multiplePerfTeams = computed(() => this.memberTeams().length > 1);

  ngOnInit(): void {
    this.bootstrap();
  }

  /**
   * Self-scoped performances: no member/team filter — the backend returns the
   * caller's own records across teams. Read-only; coaches with none see nothing.
   *
   * Only loaded when the editable performance panel is NOT shown
   * (`!canLogOwnPerformances()`): that panel fetches its own team-scoped
   * records, so fetching the self-scoped list too would double the work at
   * open. Called from `bootstrap()` once `memberTeams()` is resolved (the
   * gate depends on it) and from the template's retry button.
   */
  protected loadMyPerformances(): void {
    this.myPerformancesError.set(false);
    this.myPerformancesLoading.set(true);
    this.performancesService
      .performancesList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.myPerformances.set(res.results ?? []);
          this.myPerformancesError.set(false);
          this.myPerformancesLoading.set(false);
        },
        // A transient failure must not masquerade as "you have no performances":
        // flag it so the template can offer a retry instead of a silent empty.
        error: () => {
          this.myPerformances.set([]);
          this.myPerformancesError.set(true);
          this.myPerformancesLoading.set(false);
        },
      });
  }

  /**
   * Single fan-out replacement: one teams list (for full Team objects used by
   * cards, selectors and the stats/perf panels) + one aggregate summary call
   * that carries every count and list the dashboard renders. Replaces the
   * former per-team/per-program/per-event/per-attendance request storm.
   */
  private bootstrap(): void {
    forkJoin({
      teams: this.teamsService.teamsList({ isActive: true }),
      summary: this.dashboardService.dashboardSummaryRetrieve({ today: localTodayParam() }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ teams, summary }) => {
          const userId = this.authService.currentUser()?.id;
          const all = teams.results ?? [];
          const managed: Team[] = [];
          const member: Team[] = [];
          if (userId != null) {
            for (const t of all) {
              const role = computeTeamRole(t, userId);
              if (role === 'owner' || role === 'manager') managed.push(t);
              else if (role === 'member') member.push(t);
            }
          }
          this.managedTeams.set(managed);
          this.memberTeams.set(member);
          this.buildCoachSections(managed, summary);
          this.buildAthleteSections(member, summary);
          // The editable perf panel fetches its own team-scoped records; only
          // load the read-only self-scoped list when that panel isn't shown,
          // so exactly one source loads. The gate needs memberTeams() resolved.
          if (!this.canLogOwnPerformances()) {
            this.loadMyPerformances();
          }
          this.bootstrapped.set(true);
        },
        error: () => {
          this.errorTeams.set(true);
          this.errorUpcoming.set(true);
          this.errorPending.set(true);
          this.errorMemberTeams.set(true);
          this.errorMemberUpcoming.set(true);
          this.errorHistory.set(true);
          this.clearLoading();
          this.bootstrapped.set(true);
        },
      });
  }

  private clearLoading(): void {
    this.loadingTeams.set(false);
    this.loadingUpcoming.set(false);
    this.loadingPending.set(false);
    this.loadingMemberTeams.set(false);
    this.loadingMemberUpcoming.set(false);
    this.loadingHistory.set(false);
  }

  private buildCoachSections(managed: Team[], summary: DashboardSummary): void {
    const counts = new Map(summary.coach_teams.map((c) => [c.team_id, c]));
    this.teamCards.set(
      managed.map((team) => {
        const c = counts.get(team.id);
        return {
          team,
          programsActive: c?.programs_active ?? 0,
          eventsNext7d: c?.events_next_7d ?? 0,
          membersCount: c?.members_count ?? 0,
        };
      }),
    );

    this.upcomingEvents.set(summary.coach_upcoming.map(toUpcoming));
    this.upcomingTotal.set(summary.coach_upcoming_total);
    this.attendancePending.set(summary.coach_attendance_pending.map(toUpcoming));
    this.auditTruncated.set(summary.coach_pending_truncated);

    this.loadingTeams.set(false);
    this.loadingUpcoming.set(false);
    this.loadingPending.set(false);
  }

  private buildAthleteSections(member: Team[], summary: DashboardSummary): void {
    const counts = new Map(summary.member_teams.map((c) => [c.team_id, c]));
    const myMemberIdByTeam = new Map<number, number>();
    for (const c of summary.member_teams) {
      if (c.my_member_id != null) myMemberIdByTeam.set(c.team_id, c.my_member_id);
    }
    this.myMemberIdByTeam.set(myMemberIdByTeam);

    this.memberTeamCards.set(
      member.map((team) => ({ team, membersCount: counts.get(team.id)?.members_count ?? 0 })),
    );

    // Default the stats selector to the first team with a resolvable member id,
    // and the editable-performances selector to the first member team.
    this.selectedStatsTeam.set(member.find((t) => myMemberIdByTeam.has(t.id)) ?? null);
    this.selectedPerfTeam.set(member[0] ?? null);

    this.memberUpcomingEvents.set(summary.member_upcoming.map(toUpcoming));
    this.memberUpcomingTotal.set(summary.member_upcoming_total);
    this.attendanceHistory.set(
      summary.member_attendance_history.map((h) => ({
        attendance: { id: h.attendance_id, status_code: h.status_code },
        event: h.event,
        teamName: h.team_name,
        programName: h.program_name,
        status: h.status,
      })),
    );
    this.historyAuditTruncated.set(summary.member_history_truncated);

    this.loadingMemberTeams.set(false);
    this.loadingMemberUpcoming.set(false);
    this.loadingHistory.set(false);
  }
}

function toUpcoming(item: {
  event: DashboardEvent;
  team_name: string;
  program_name: string;
}): UpcomingEvent {
  return { event: item.event, teamName: item.team_name, programName: item.program_name };
}
