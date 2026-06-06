import { CommonModule } from '@angular/common';
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
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PerformancePanelComponent } from '../../shared/ui/performance-panel/performance-panel.component';
import { TeamStatsComponent } from '../teams/team-stats/team-stats.component';
import { firstValueFrom } from 'rxjs';
import { AttendanceStatusesService } from '../../api/api/attendance-statuses.service';
import { EventsService } from '../../api/api/events.service';
import { PerformancesService } from '../../api/api/performances.service';
import { ProgramsService } from '../../api/api/programs.service';
import { TeamsService } from '../../api/api/teams.service';
import { Attendance } from '../../api/model/attendance';
import { AttendanceStatus } from '../../api/model/attendance-status';
import { Event } from '../../api/model/event';
import { Performance } from '../../api/model/performance';
import { Program } from '../../api/model/program';
import { Team } from '../../api/model/team';
import { TeamMembership } from '../../api/model/team-membership';
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
  event: Event;
  teamName: string;
  programName: string;
}

interface AttendancePending {
  event: Event;
  teamName: string;
  programName: string;
}

interface AttendanceHistoryItem {
  attendance: Attendance;
  event: Event;
  teamName: string;
  programName: string;
  status: AttendanceStatus | null;
}

const UPCOMING_DAYS = 14;
const NEXT_7D = 7;
const UPCOMING_MAX_DISPLAYED = 20;
const PENDING_AUDIT_CAP = 30;
const HISTORY_AUDIT_CAP = 30;
const HISTORY_DISPLAY_LIMIT = 20;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function eventDateAsDate(e: Event): Date | null {
  if (!e.date) return null;
  const [y, m, d] = e.date.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule,
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
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly teamsService = inject(TeamsService);
  private readonly programsService = inject(ProgramsService);
  private readonly eventsService = inject(EventsService);
  private readonly statusesService = inject(AttendanceStatusesService);
  private readonly performancesService = inject(PerformancesService);
  private readonly destroyRef = inject(DestroyRef);

  /** The caller's own performance records across all teams (read-only self-view). */
  protected readonly myPerformances = signal<Performance[]>([]);

  protected readonly greetingName = computed(() => {
    const user = this.authService.currentUser();
    return user?.first_name || user?.username || '';
  });

  protected readonly managedTeams = signal<Team[]>([]);
  protected readonly memberTeams = signal<Team[]>([]);
  protected readonly hasManagedTeams = computed(() => this.managedTeams().length > 0);
  protected readonly hasMemberTeams = computed(() => this.memberTeams().length > 0);
  protected readonly isHybrid = computed(() => this.hasManagedTeams() && this.hasMemberTeams());

  // Coach sections (P17)
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
  /** The caller's membership id PER member team (member_username === me.username). */
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

  ngOnInit(): void {
    this.bootstrap();
    this.loadMyPerformances();
  }

  /**
   * Self-scoped performances: no member/team filter — the backend returns the
   * caller's own records across teams. Read-only; coaches with none see nothing.
   */
  private loadMyPerformances(): void {
    this.performancesService
      .performancesList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.myPerformances.set(res.results ?? []),
        error: () => this.myPerformances.set([]),
      });
  }

  private bootstrap(): void {
    this.teamsService
      .teamsList(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const userId = this.authService.currentUser()?.id;
          const teams = res.results ?? [];
          if (userId == null) {
            this.bootstrapped.set(true);
            return;
          }
          const managed: Team[] = [];
          const member: Team[] = [];
          for (const t of teams) {
            const role = computeTeamRole(t, userId);
            if (role === 'owner' || role === 'manager') managed.push(t);
            else if (role === 'member') member.push(t);
          }
          this.managedTeams.set(managed);
          this.memberTeams.set(member);
          this.bootstrapped.set(true);

          if (managed.length === 0) {
            this.loadingTeams.set(false);
            this.loadingUpcoming.set(false);
            this.loadingPending.set(false);
          } else {
            void this.buildCoachSections(managed);
          }

          if (member.length === 0) {
            this.loadingMemberTeams.set(false);
            this.loadingMemberUpcoming.set(false);
            this.loadingHistory.set(false);
          } else {
            void this.buildAthleteSections(member);
          }
        },
        error: () => {
          this.errorTeams.set(true);
          this.errorUpcoming.set(true);
          this.errorPending.set(true);
          this.errorMemberTeams.set(true);
          this.errorMemberUpcoming.set(true);
          this.errorHistory.set(true);
          this.loadingTeams.set(false);
          this.loadingUpcoming.set(false);
          this.loadingPending.set(false);
          this.loadingMemberTeams.set(false);
          this.loadingMemberUpcoming.set(false);
          this.loadingHistory.set(false);
          this.bootstrapped.set(true);
        },
      });
  }

  private async buildCoachSections(managed: Team[]): Promise<void> {
    const today = startOfDay(new Date());
    const next7 = addDays(today, NEXT_7D);
    const next14 = addDays(today, UPCOMING_DAYS);

    const allPrograms: Array<{ program: Program; team: Team }> = [];
    const allEvents: Array<{ event: Event; team: Team; program: Program }> = [];

    try {
      const programsByTeam = await Promise.all(
        managed.map(async (team) => {
          const res = await firstValueFrom(
            this.programsService.programsList(
              undefined, undefined, undefined, true, undefined,
              undefined, undefined, undefined, undefined, team.id,
            ),
          );
          return { team, programs: res.results ?? [] };
        }),
      );
      for (const { team, programs } of programsByTeam) {
        for (const program of programs) allPrograms.push({ program, team });
      }
    } catch {
      this.errorTeams.set(true);
      this.errorUpcoming.set(true);
      this.errorPending.set(true);
      this.loadingTeams.set(false);
      this.loadingUpcoming.set(false);
      this.loadingPending.set(false);
      return;
    }

    try {
      const eventsByProgram = await Promise.all(
        allPrograms.map(async ({ program, team }) => {
          const res = await firstValueFrom(
            this.eventsService.eventsList(
              undefined, undefined, undefined, undefined, '-date', 1, undefined, program.id, undefined,
            ),
          );
          return { events: res.results ?? [], team, program };
        }),
      );
      for (const { events, team, program } of eventsByProgram) {
        for (const event of events) allEvents.push({ event, team, program });
      }
    } catch {
      this.errorUpcoming.set(true);
      this.errorPending.set(true);
      this.loadingUpcoming.set(false);
      this.loadingPending.set(false);
    }

    this.buildTeamCards(managed, allPrograms, allEvents, today, next7);
    this.buildUpcoming(allEvents, today, next14);
    void this.buildPending(allEvents, today);
  }

  private buildTeamCards(
    teams: Team[],
    allPrograms: Array<{ program: Program; team: Team }>,
    allEvents: Array<{ event: Event; team: Team }>,
    today: Date,
    next7: Date,
  ): void {
    const cards: TeamCard[] = teams.map((team) => {
      const programsActive = allPrograms.filter((p) => p.team.id === team.id).length;
      const eventsNext7d = allEvents.filter(({ event, team: t }) => {
        if (t.id !== team.id) return false;
        const d = eventDateAsDate(event);
        return d !== null && d >= today && d < next7;
      }).length;
      const membersCount = team.managers?.length ?? 0;
      return { team, programsActive, eventsNext7d, membersCount };
    });
    this.teamCards.set(cards);
    this.loadingTeams.set(false);

    void Promise.all(
      teams.map(async (team) => {
        try {
          const memberships = await firstValueFrom(this.teamsService.teamsMembershipsList(team.id));
          return { teamId: team.id, count: (memberships ?? []).length };
        } catch {
          return { teamId: team.id, count: 0 };
        }
      }),
    ).then((counts) => {
      const map = new Map(counts.map((c) => [c.teamId, c.count]));
      this.teamCards.update((arr) =>
        arr.map((card) => ({ ...card, membersCount: map.get(card.team.id) ?? card.membersCount })),
      );
    });
  }

  private buildUpcoming(
    allEvents: Array<{ event: Event; team: Team; program: Program }>,
    today: Date,
    next14: Date,
  ): void {
    const upcoming = allEvents
      .filter(({ event }) => {
        const d = eventDateAsDate(event);
        return d !== null && d >= today && d < next14;
      })
      .sort((a, b) => {
        const da = eventDateAsDate(a.event)!.getTime();
        const db = eventDateAsDate(b.event)!.getTime();
        if (da !== db) return da - db;
        return (a.event.hour_start ?? '').localeCompare(b.event.hour_start ?? '');
      })
      .map(({ event, team, program }) => ({
        event,
        teamName: team.name,
        programName: program.name,
      }));
    this.upcomingEvents.set(upcoming);
    this.upcomingTotal.set(upcoming.length);
    this.loadingUpcoming.set(false);
  }

  private async buildPending(
    allEvents: Array<{ event: Event; team: Team; program: Program }>,
    today: Date,
  ): Promise<void> {
    const pastEvents = allEvents
      .filter(({ event }) => {
        const d = eventDateAsDate(event);
        return d !== null && d < today && (event.members?.length ?? 0) > 0;
      })
      .sort((a, b) => {
        const da = eventDateAsDate(a.event)!.getTime();
        const db = eventDateAsDate(b.event)!.getTime();
        return db - da;
      });

    const truncated = pastEvents.length > PENDING_AUDIT_CAP;
    this.auditTruncated.set(truncated);
    const audited = pastEvents.slice(0, PENDING_AUDIT_CAP);

    try {
      const audits = await Promise.all(
        audited.map(async ({ event, team, program }) => {
          const res = await firstValueFrom(this.eventsService.eventsAttendanceList(event.id));
          const count = (res.results ?? []).length;
          return { event, team, program, count };
        }),
      );
      const pending: AttendancePending[] = audits
        .filter(({ count }) => count === 0)
        .map(({ event, team, program }) => ({
          event,
          teamName: team.name,
          programName: program.name,
        }));
      this.attendancePending.set(pending);
      this.loadingPending.set(false);
    } catch {
      this.errorPending.set(true);
      this.loadingPending.set(false);
    }
  }

  private async buildAthleteSections(memberTeams: Team[]): Promise<void> {
    const today = startOfDay(new Date());
    const next14 = addDays(today, UPCOMING_DAYS);
    const myUsername = this.authService.currentUser()?.username;

    let membershipsByTeam: Array<{ team: Team; memberships: TeamMembership[] }> = [];
    // The caller's member id PER team — do NOT break after the first match,
    // each team has its own membership row for the athlete.
    const myMemberIdByTeam = new Map<number, number>();

    try {
      membershipsByTeam = await Promise.all(
        memberTeams.map(async (team) => {
          const memberships = await firstValueFrom(this.teamsService.teamsMembershipsList(team.id));
          return { team, memberships: memberships ?? [] };
        }),
      );
      for (const { team, memberships } of membershipsByTeam) {
        const found = memberships.find((m) => m.member_username === myUsername);
        if (found) {
          myMemberIdByTeam.set(team.id, found.member);
        }
      }
      this.myMemberIdByTeam.set(myMemberIdByTeam);
      // Default the stats selector to the first team with a resolvable member id.
      const firstStatsTeam = memberTeams.find((t) => myMemberIdByTeam.has(t.id)) ?? null;
      this.selectedStatsTeam.set(firstStatsTeam);
      const cards: MemberTeamCard[] = membershipsByTeam.map(({ team, memberships }) => ({
        team,
        membersCount: memberships.length,
      }));
      this.memberTeamCards.set(cards);
      this.loadingMemberTeams.set(false);
    } catch {
      this.errorMemberTeams.set(true);
      this.errorMemberUpcoming.set(true);
      this.errorHistory.set(true);
      this.loadingMemberTeams.set(false);
      this.loadingMemberUpcoming.set(false);
      this.loadingHistory.set(false);
      return;
    }

    const allMemberPrograms: Array<{ program: Program; team: Team }> = [];
    try {
      const programsByTeam = await Promise.all(
        memberTeams.map(async (team) => {
          const res = await firstValueFrom(
            this.programsService.programsList(
              undefined, undefined, undefined, true, undefined,
              undefined, undefined, undefined, undefined, team.id,
            ),
          );
          return { team, programs: res.results ?? [] };
        }),
      );
      for (const { team, programs } of programsByTeam) {
        for (const program of programs) allMemberPrograms.push({ program, team });
      }
    } catch {
      this.errorMemberUpcoming.set(true);
      this.errorHistory.set(true);
      this.loadingMemberUpcoming.set(false);
      this.loadingHistory.set(false);
      return;
    }

    const allMemberEvents: Array<{ event: Event; team: Team; program: Program }> = [];
    try {
      const eventsByProgram = await Promise.all(
        allMemberPrograms.map(async ({ program, team }) => {
          const res = await firstValueFrom(
            this.eventsService.eventsList(
              undefined, undefined, undefined, undefined, '-date', 1, undefined, program.id, undefined,
            ),
          );
          return { events: res.results ?? [], team, program };
        }),
      );
      for (const { events, team, program } of eventsByProgram) {
        for (const event of events) allMemberEvents.push({ event, team, program });
      }
    } catch {
      this.errorMemberUpcoming.set(true);
      this.errorHistory.set(true);
      this.loadingMemberUpcoming.set(false);
      this.loadingHistory.set(false);
      return;
    }

    this.buildMemberUpcoming(allMemberEvents, today, next14);
    void this.buildAttendanceHistory(allMemberEvents, today, myMemberIdByTeam);
  }

  private buildMemberUpcoming(
    allMemberEvents: Array<{ event: Event; team: Team; program: Program }>,
    today: Date,
    next14: Date,
  ): void {
    const upcoming = allMemberEvents
      .filter(({ event }) => {
        const d = eventDateAsDate(event);
        return d !== null && d >= today && d < next14;
      })
      .sort((a, b) => {
        const da = eventDateAsDate(a.event)!.getTime();
        const db = eventDateAsDate(b.event)!.getTime();
        if (da !== db) return da - db;
        return (a.event.hour_start ?? '').localeCompare(b.event.hour_start ?? '');
      })
      .map(({ event, team, program }) => ({
        event,
        teamName: team.name,
        programName: program.name,
      }));
    this.memberUpcomingEvents.set(upcoming);
    this.memberUpcomingTotal.set(upcoming.length);
    this.loadingMemberUpcoming.set(false);
  }

  private async buildAttendanceHistory(
    allMemberEvents: Array<{ event: Event; team: Team; program: Program }>,
    today: Date,
    myMemberIdByTeam: Map<number, number>,
  ): Promise<void> {
    if (myMemberIdByTeam.size === 0) {
      this.attendanceHistory.set([]);
      this.loadingHistory.set(false);
      return;
    }

    const pastEvents = allMemberEvents
      .filter(({ event }) => {
        const d = eventDateAsDate(event);
        return d !== null && d < today;
      })
      .sort((a, b) => {
        const da = eventDateAsDate(a.event)!.getTime();
        const db = eventDateAsDate(b.event)!.getTime();
        return db - da;
      });

    const truncated = pastEvents.length > HISTORY_AUDIT_CAP;
    this.historyAuditTruncated.set(truncated);
    const audited = pastEvents.slice(0, HISTORY_AUDIT_CAP);

    let statuses: AttendanceStatus[] = [];
    try {
      const statusRes = await firstValueFrom(this.statusesService.attendanceStatusesList());
      statuses = statusRes.results ?? [];
    } catch {
      // status decoration is non-critical, fall back to empty list (badges show code only)
    }
    const statusByCode = new Map(statuses.map((s) => [s.code, s]));

    try {
      const audits = await Promise.all(
        audited.map(async ({ event, team, program }) => {
          const myMemberId = myMemberIdByTeam.get(team.id);
          if (myMemberId === undefined) return null;
          const res = await firstValueFrom(this.eventsService.eventsAttendanceList(event.id));
          const mine = (res.results ?? []).find((a) => a.member === myMemberId);
          return mine ? { attendance: mine, event, team, program } : null;
        }),
      );
      const items: AttendanceHistoryItem[] = audits
        .filter((x): x is { attendance: Attendance; event: Event; team: Team; program: Program } => x !== null)
        .slice(0, HISTORY_DISPLAY_LIMIT)
        .map(({ attendance, event, team, program }) => ({
          attendance,
          event,
          teamName: team.name,
          programName: program.name,
          status: statusByCode.get(attendance.status_code) ?? null,
        }));
      this.attendanceHistory.set(items);
      this.loadingHistory.set(false);
    } catch {
      this.errorHistory.set(true);
      this.loadingHistory.set(false);
    }
  }
}
