import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../../api/api/dashboard.service';
import { PerformancesService } from '../../api/api/performances.service';
import { TeamsService } from '../../api/api/teams.service';
import { AttendanceStatus } from '../../api/model/attendance-status';
import { CustomUserPublic } from '../../api/model/custom-user-public';
import { DashboardEvent } from '../../api/model/dashboard-event';
import { DashboardEventItem } from '../../api/model/dashboard-event-item';
import { DashboardHistoryItem } from '../../api/model/dashboard-history-item';
import { DashboardSummary } from '../../api/model/dashboard-summary';
import { LanguageEnum } from '../../api/model/language-enum';
import { Sport } from '../../api/model/sport';
import { Team } from '../../api/model/team';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardComponent } from './dashboard.component';

const ownerUser = { id: 17, username: 'coach' } as CustomUserPublic;
const athleteUser = { id: 88, username: 'athlete' } as CustomUserPublic;

const sport: Sport = {
  id: 1, name: 'Natation', slug: 'natation', is_active: true, energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const ownedTeam: Team = {
  id: 4, name: 'Coach Team', sport,
  sports: [{ id: 1, name: 'Sport', slug: 'sport', is_default: true, order: 0 }],
  sport_id: 1, owner: ownerUser, managers: [],
  language: LanguageEnum.Fr, is_active: true, is_public: false, attendance_statuses: [],
  level: null, default_pool: '', places: [], default_place: null, equipment: [], logo_url: null,
  created_at: '', updated_at: '',
};

// Owned by someone else → computeTeamRole yields 'member' for our athlete.
const externalTeam: Team = {
  ...ownedTeam, id: 9, name: 'External Team',
  owner: { id: 999 } as CustomUserPublic, managers: [],
};
const externalTeam2: Team = {
  ...ownedTeam, id: 10, name: 'External Team 2',
  owner: { id: 998 } as CustomUserPublic, managers: [],
};

const presentStatus: AttendanceStatus = {
  id: 1, code: 'present', label: 'Présent', is_default: true, order: 1, color: '#22C55E', is_active: true,
};

function dEvent(id: number, name: string): DashboardEvent {
  return {
    id, name, date: '2026-06-09', hour_start: '18:00:00', hour_end: '19:30:00',
    location: '', place: null,
  };
}

function eventItem(eventId: number, teamId: number, teamName: string): DashboardEventItem {
  return {
    event: dEvent(eventId, `Ev ${eventId}`),
    team_id: teamId, team_name: teamName, program_id: 1, program_name: 'Plan',
  };
}

function historyItem(eventId: number, teamId: number): DashboardHistoryItem {
  return {
    event: dEvent(eventId, `Past ${eventId}`),
    team_id: teamId, team_name: 'T', program_id: 1, program_name: 'Plan',
    attendance_id: 900 + eventId, status_code: 'present', status: presentStatus,
  };
}

function emptySummary(): DashboardSummary {
  return {
    coach_teams: [], member_teams: [],
    coach_upcoming: [], coach_upcoming_total: 0,
    coach_attendance_pending: [], coach_pending_truncated: false,
    member_upcoming: [], member_upcoming_total: 0,
    member_attendance_history: [], member_history_truncated: false,
  };
}

interface ProtectedFields {
  managedTeams(): Team[];
  memberTeams(): Team[];
  hasManagedTeams(): boolean;
  hasMemberTeams(): boolean;
  isHybrid(): boolean;
  showWelcome(): boolean;
  teamCards(): { team: Team; programsActive: number; eventsNext7d: number; membersCount: number }[];
  upcomingDisplayed(): { event: DashboardEvent; teamName: string; programName: string }[];
  upcomingTotal(): number;
  upcomingOverflow(): number;
  attendancePending(): { event: DashboardEvent; teamName: string; programName: string }[];
  memberTeamCards(): { team: Team; membersCount: number }[];
  myMemberIdByTeam(): Map<number, number>;
  statsTeams(): Team[];
  hasStats(): boolean;
  multipleStatsTeams(): boolean;
  activeStatsTeam(): Team | null;
  activeStatsMemberId(): number | null;
  selectedStatsTeam: { set(t: Team | null): void };
  myMemberId(): number | null;
  canLogOwnPerformances(): boolean;
  activePerfTeam(): Team | null;
  multiplePerfTeams(): boolean;
  selectedPerfTeam: { set(t: Team | null): void };
  memberUpcomingDisplayed(): { event: DashboardEvent; teamName: string; programName: string }[];
  attendanceHistory(): { attendance: { id: number; status_code: string }; status: AttendanceStatus | null }[];
  historyAuditTruncated(): boolean;
  loadingTeams(): boolean;
  loadingHistory(): boolean;
  loadingMemberTeams(): boolean;
  errorTeams(): boolean;
  errorUpcoming(): boolean;
  errorPending(): boolean;
}

interface SetupOpts {
  teams?: Team[];
  user?: CustomUserPublic;
  summary?: DashboardSummary;
  summaryThrows?: boolean;
}

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let router: Router;

  const access = (c: DashboardComponent) => c as unknown as ProtectedFields;

  async function setup(opts?: SetupOpts) {
    TestBed.resetTestingModule();
    const teams = opts?.teams ?? [ownedTeam];
    const summary = opts?.summary ?? emptySummary();

    const teamsMock = {
      teamsList: vi.fn().mockReturnValue(of({ count: teams.length, results: teams })),
    };
    const dashboardMock = {
      dashboardSummaryRetrieve: opts?.summaryThrows
        ? vi.fn().mockReturnValue(throwError(() => new Error('500')))
        : vi.fn().mockReturnValue(of(summary)),
    };
    userSig = signal<CustomUserPublic | null>(opts?.user ?? ownerUser);

    await TestBed.configureTestingModule({
      imports: [
        DashboardComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: TeamsService, useValue: teamsMock },
        { provide: DashboardService, useValue: dashboardMock },
        {
          provide: PerformancesService,
          useValue: { performancesList: vi.fn().mockReturnValue(of({ count: 0, results: [] })) },
        },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
      ],
    })
      .overrideComponent(DashboardComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }

  describe('coach pure (managed only)', () => {
    beforeEach(async () => {
      await setup({
        summary: {
          ...emptySummary(),
          coach_teams: [{ team_id: 4, programs_active: 1, events_next_7d: 1, members_count: 2 }],
          coach_upcoming: [eventItem(200, 4, 'Coach Team')],
          coach_upcoming_total: 1,
        },
      });
    });

    it('builds managedTeams + no memberTeams', () => {
      expect(access(component).hasManagedTeams()).toBe(true);
      expect(access(component).hasMemberTeams()).toBe(false);
      expect(access(component).isHybrid()).toBe(false);
    });

    it('renders coach team cards with counts joined from the summary', () => {
      const cards = access(component).teamCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].team.id).toBe(4);
      expect(cards[0].programsActive).toBe(1);
      expect(cards[0].eventsNext7d).toBe(1);
      expect(cards[0].membersCount).toBe(2);
    });

    it('athlete sections are empty', () => {
      expect(access(component).memberTeamCards()).toEqual([]);
      expect(access(component).attendanceHistory()).toEqual([]);
      expect(access(component).loadingMemberTeams()).toBe(false);
      expect(access(component).loadingHistory()).toBe(false);
    });
  });

  describe('athlete pure (member only)', () => {
    beforeEach(async () => {
      await setup({
        teams: [externalTeam],
        user: athleteUser,
        summary: {
          ...emptySummary(),
          member_teams: [{ team_id: 9, members_count: 2, my_member_id: 77 }],
          member_upcoming: [eventItem(300, 9, 'External Team')],
          member_upcoming_total: 1,
          member_attendance_history: [historyItem(301, 9)],
        },
      });
    });

    it('builds member view without a coach view', () => {
      expect(access(component).hasManagedTeams()).toBe(false);
      expect(access(component).hasMemberTeams()).toBe(true);
    });

    it('builds memberTeamCards joined from the summary', () => {
      const cards = access(component).memberTeamCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].team.id).toBe(9);
      expect(cards[0].membersCount).toBe(2);
    });

    it('builds attendance history from the summary', () => {
      const items = access(component).attendanceHistory();
      expect(items).toHaveLength(1);
      expect(items[0].attendance.id).toBe(1201);
      expect(items[0].status?.code).toBe('present');
    });

    it('maps the caller member id per team and scopes the stats panel', () => {
      const map = access(component).myMemberIdByTeam();
      expect(map.get(9)).toBe(77);
      expect(access(component).hasStats()).toBe(true);
      expect(access(component).multipleStatsTeams()).toBe(false);
      expect(access(component).activeStatsTeam()?.id).toBe(9);
      expect(access(component).activeStatsMemberId()).toBe(77);
    });

    it('coach sections are empty', () => {
      expect(access(component).teamCards()).toEqual([]);
      expect(access(component).attendancePending()).toEqual([]);
      expect(access(component).loadingTeams()).toBe(false);
    });
  });

  describe('hybrid (manager of A, member of B)', () => {
    beforeEach(async () => {
      await setup({
        teams: [ownedTeam, externalTeam],
        user: ownerUser,
        summary: {
          ...emptySummary(),
          coach_teams: [{ team_id: 4, programs_active: 1, events_next_7d: 1, members_count: 2 }],
          member_teams: [{ team_id: 9, members_count: 2, my_member_id: 77 }],
          coach_upcoming: [eventItem(200, 4, 'Coach Team')],
          coach_upcoming_total: 1,
          member_upcoming: [eventItem(300, 9, 'External Team')],
          member_upcoming_total: 1,
        },
      });
    });

    it('exposes both coach and member views (isHybrid true)', () => {
      expect(access(component).hasManagedTeams()).toBe(true);
      expect(access(component).hasMemberTeams()).toBe(true);
      expect(access(component).isHybrid()).toBe(true);
    });

    it('separates coach upcoming from athlete upcoming', () => {
      expect(access(component).upcomingDisplayed().map((e) => e.event.id)).toEqual([200]);
      expect(access(component).memberUpcomingDisplayed().map((e) => e.event.id)).toEqual([300]);
    });
  });

  describe('Mes statistiques — multiple member teams (per-team member id map)', () => {
    beforeEach(async () => {
      await setup({
        teams: [externalTeam, externalTeam2],
        user: athleteUser,
        summary: {
          ...emptySummary(),
          member_teams: [
            { team_id: 9, members_count: 2, my_member_id: 77 },
            { team_id: 10, members_count: 1, my_member_id: 89 },
          ],
        },
      });
    });

    it('builds a member id PER team without collapsing to the first', () => {
      const map = access(component).myMemberIdByTeam();
      expect(map.get(9)).toBe(77);
      expect(map.get(10)).toBe(89);
      expect(map.size).toBe(2);
    });

    it('exposes both teams as stats targets and flags multi-team', () => {
      expect(access(component).statsTeams().map((t) => t.id)).toEqual([9, 10]);
      expect(access(component).multipleStatsTeams()).toBe(true);
    });

    it('defaults the active stats team to the first and resolves its member id', () => {
      expect(access(component).activeStatsTeam()?.id).toBe(9);
      expect(access(component).activeStatsMemberId()).toBe(77);
    });

    it('switching the selected team re-scopes to that team member id', () => {
      access(component).selectedStatsTeam.set(externalTeam2);
      expect(access(component).activeStatsTeam()?.id).toBe(10);
      expect(access(component).activeStatsMemberId()).toBe(89);
    });
  });

  describe('Mes performances — athlete self-service', () => {
    const athleteWithMemberId = { id: 88, username: 'athlete', member_id: 77 } as unknown as CustomUserPublic;
    const memberSummary: DashboardSummary = {
      ...emptySummary(),
      member_teams: [{ team_id: 9, members_count: 2, my_member_id: 77 }],
    };

    it('exposes editable self-service when member_id set AND ≥1 member team', async () => {
      await setup({ teams: [externalTeam], user: athleteWithMemberId, summary: memberSummary });
      expect(access(component).myMemberId()).toBe(77);
      expect(access(component).canLogOwnPerformances()).toBe(true);
      expect(access(component).activePerfTeam()?.id).toBe(9);
      expect(access(component).multiplePerfTeams()).toBe(false);
    });

    it('defaults perf team to first and switches on selection (multi member teams)', async () => {
      await setup({
        teams: [externalTeam, externalTeam2],
        user: athleteWithMemberId,
        summary: {
          ...emptySummary(),
          member_teams: [
            { team_id: 9, members_count: 2, my_member_id: 77 },
            { team_id: 10, members_count: 1, my_member_id: 89 },
          ],
        },
      });
      expect(access(component).multiplePerfTeams()).toBe(true);
      expect(access(component).activePerfTeam()?.id).toBe(9);
      access(component).selectedPerfTeam.set(externalTeam2);
      expect(access(component).activePerfTeam()?.id).toBe(10);
    });

    it('does NOT offer self-service when member_id is null', async () => {
      await setup({ teams: [externalTeam], user: athleteUser, summary: memberSummary });
      expect(access(component).myMemberId()).toBe(null);
      expect(access(component).canLogOwnPerformances()).toBe(false);
    });

    it('does NOT offer self-service when member_id set but no member teams', async () => {
      await setup({
        teams: [ownedTeam],
        user: { id: 17, username: 'coach', member_id: 5 } as unknown as CustomUserPublic,
      });
      expect(access(component).myMemberId()).toBe(5);
      expect(access(component).canLogOwnPerformances()).toBe(false);
    });
  });

  describe('0 team (no managed, no member)', () => {
    beforeEach(async () => {
      await setup({ teams: [], user: athleteUser });
    });

    it('shows the welcome state', () => {
      expect(access(component).hasManagedTeams()).toBe(false);
      expect(access(component).hasMemberTeams()).toBe(false);
      expect(access(component).showWelcome()).toBe(true);
    });
  });

  describe('upcoming display cap + pending pass-through + error path', () => {
    it('upcomingDisplayed slices to 20 and overflow exposes the remainder', async () => {
      const many = Array.from({ length: 25 }, (_, i) => eventItem(1000 + i, 4, 'Coach Team'));
      await setup({
        summary: { ...emptySummary(), coach_upcoming: many, coach_upcoming_total: 25 },
      });
      expect(access(component).upcomingTotal()).toBe(25);
      expect(access(component).upcomingDisplayed()).toHaveLength(20);
      expect(access(component).upcomingOverflow()).toBe(5);
    });

    it('attendancePending is passed through from the summary', async () => {
      await setup({
        summary: { ...emptySummary(), coach_attendance_pending: [eventItem(202, 4, 'Coach Team')] },
      });
      expect(access(component).attendancePending().map((p) => p.event.id)).toEqual([202]);
    });

    it('a failing summary call sets the error flags and clears loading', async () => {
      await setup({ summaryThrows: true });
      expect(access(component).errorTeams()).toBe(true);
      expect(access(component).errorUpcoming()).toBe(true);
      expect(access(component).errorPending()).toBe(true);
      expect(access(component).loadingTeams()).toBe(false);
    });
  });
});
