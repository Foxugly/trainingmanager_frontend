import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceStatusesService } from '../../api/api/attendance-statuses.service';
import { EventsService } from '../../api/api/events.service';
import { ProgramsService } from '../../api/api/programs.service';
import { TeamsService } from '../../api/api/teams.service';
import { Attendance } from '../../api/model/attendance';
import { AttendanceStatus } from '../../api/model/attendance-status';
import { CustomUserPublic } from '../../api/model/custom-user-public';
import { Event } from '../../api/model/event';
import { LanguageEnum } from '../../api/model/language-enum';
import { Program } from '../../api/model/program';
import { Sport } from '../../api/model/sport';
import { Team } from '../../api/model/team';
import { TeamMembership } from '../../api/model/team-membership';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardComponent } from './dashboard.component';

const ownerUser = { id: 17, username: 'coach' } as CustomUserPublic;
const athleteUser = { id: 88, username: 'athlete' } as CustomUserPublic;

const sport: Sport = {
  id: 1, name: 'Natation', slug: 'natation', is_active: true, energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const ownedTeam: Team = {
  id: 4, name: 'Coach Team', sport, sport_id: 1, owner: ownerUser, managers: [],
  language: LanguageEnum.Fr, is_active: true, is_public: false, attendance_statuses: [],
  created_at: '', updated_at: '',
};

const externalTeam: Team = {
  ...ownedTeam, id: 9, name: 'External Team',
  owner: { id: 999 } as CustomUserPublic, managers: [],
};

const program1: Program = {
  id: 100, name: 'Cycle aérobie', date_start: null, date_end: null,
  team: { id: 4, name: 'Coach Team', language: LanguageEnum.Fr },
  team_id: 4, events: [], description: '',
  generated_by_ai: false, ai_response: '', ai_generated_at: null, is_active: true,
  created_at: '', updated_at: '',
};

const program9: Program = {
  ...program1, id: 109, name: 'Member Team Plan',
  team: { id: 9, name: 'External Team', language: LanguageEnum.Fr }, team_id: 9,
};

const today = new Date();
const ymd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const upcomingEvent: Event = {
  id: 200, name: 'Séance demain', goal: null, color: undefined, date: ymd(addDays(today, 1)),
  hour_start: '18:00:00', hour_end: '19:30:00', total: 0,
  refer_program: { id: 100, name: 'Cycle aérobie' }, refer_program_id: 100,
  rounds: [], members: [11, 12], generated_by_ai: false, ai_response: '',
  ai_generated_at: null, created_at: '', updated_at: '',
};

const farFutureEvent: Event = {
  ...upcomingEvent, id: 201, name: 'Trop loin', date: ymd(addDays(today, 30)),
};

const pastEventNoAttendance: Event = {
  ...upcomingEvent, id: 202, name: 'Hier sans présences',
  date: ymd(addDays(today, -1)), members: [11, 12, 13],
};

const pastEventWithAttendance: Event = {
  ...upcomingEvent, id: 203, name: 'Hier avec présences',
  date: ymd(addDays(today, -2)), members: [11],
};

const memberTeamUpcomingEvent: Event = {
  ...upcomingEvent, id: 300, name: 'Séance membre',
  date: ymd(addDays(today, 2)),
  refer_program: { id: 109, name: 'Member Team Plan' }, refer_program_id: 109,
};

const memberTeamPastEvent: Event = {
  ...memberTeamUpcomingEvent, id: 301, date: ymd(addDays(today, -3)),
};

const coachTeamMemberships: TeamMembership[] = [
  { id: 50, team: 4, member: 11, member_username: 'a', member_fullname: 'A', joined_at: '', left_at: null, created_at: '', updated_at: '' },
  { id: 51, team: 4, member: 12, member_username: 'b', member_fullname: 'B', joined_at: '', left_at: null, created_at: '', updated_at: '' },
];

const externalTeamMemberships: TeamMembership[] = [
  { id: 60, team: 9, member: 77, member_username: 'athlete', member_fullname: 'Athlete F.', joined_at: '', left_at: null, created_at: '', updated_at: '' },
  { id: 61, team: 9, member: 78, member_username: 'someone-else', member_fullname: 'Someone E.', joined_at: '', left_at: null, created_at: '', updated_at: '' },
];

// A second member team — the athlete has a DIFFERENT membership id (89) here,
// exercising the per-team member-id map (must not collapse to the first team).
const externalTeam2: Team = {
  ...ownedTeam, id: 10, name: 'External Team 2',
  owner: { id: 998 } as CustomUserPublic, managers: [],
};

const externalTeam2Memberships: TeamMembership[] = [
  { id: 70, team: 10, member: 89, member_username: 'athlete', member_fullname: 'Athlete F.', joined_at: '', left_at: null, created_at: '', updated_at: '' },
];

const presentStatus: AttendanceStatus = {
  id: 1, code: 'present', label: 'Présent', is_default: true, order: 1, color: '#22C55E', is_active: true,
};

const myAttendance301: Attendance = {
  id: 901, event: 301, member: 77, member_fullname: 'Athlete F.',
  status: 1, status_code: 'present', created_at: '', updated_at: '',
};

interface ProtectedFields {
  managedTeams(): Team[];
  memberTeams(): Team[];
  hasManagedTeams(): boolean;
  hasMemberTeams(): boolean;
  isHybrid(): boolean;
  showWelcome(): boolean;
  teamCards(): { team: Team; programsActive: number; eventsNext7d: number; membersCount: number }[];
  upcomingDisplayed(): { event: Event; teamName: string; programName: string }[];
  upcomingTotal(): number;
  upcomingOverflow(): number;
  attendancePending(): { event: Event; teamName: string; programName: string }[];
  memberTeamCards(): { team: Team; membersCount: number }[];
  myMemberIdByTeam(): Map<number, number>;
  statsTeams(): Team[];
  hasStats(): boolean;
  multipleStatsTeams(): boolean;
  activeStatsTeam(): Team | null;
  activeStatsMemberId(): number | null;
  selectedStatsTeam: { set(t: Team | null): void };
  memberUpcomingDisplayed(): { event: Event; teamName: string; programName: string }[];
  attendanceHistory(): { attendance: Attendance; event: Event; teamName: string; programName: string; status: AttendanceStatus | null }[];
  historyAuditTruncated(): boolean;
  loadingTeams(): boolean;
  loadingUpcoming(): boolean;
  loadingPending(): boolean;
  loadingMemberTeams(): boolean;
  loadingMemberUpcoming(): boolean;
  loadingHistory(): boolean;
  errorTeams(): boolean;
  errorUpcoming(): boolean;
  errorPending(): boolean;
}

interface SetupOpts {
  teams?: Team[];
  user?: CustomUserPublic;
  programs?: Program[];
  events?: Event[];
  membershipsByTeam?: Map<number, TeamMembership[]>;
  attendancesByEvent?: Map<number, Attendance[]>;
  statuses?: AttendanceStatus[];
  programsListThrows?: boolean;
}

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let teamsMock: {
    teamsList: ReturnType<typeof vi.fn>;
    teamsMembershipsList: ReturnType<typeof vi.fn>;
  };
  let programsMock: { programsList: ReturnType<typeof vi.fn> };
  let eventsMock: {
    eventsList: ReturnType<typeof vi.fn>;
    eventsAttendanceList: ReturnType<typeof vi.fn>;
  };
  let statusesMock: { attendanceStatusesList: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let router: Router;

  const access = (c: DashboardComponent) => c as unknown as ProtectedFields;

  async function setup(opts?: SetupOpts) {
    TestBed.resetTestingModule();
    const teams = opts?.teams ?? [ownedTeam];
    const programs = opts?.programs ?? [program1];
    const events = opts?.events ?? [upcomingEvent, farFutureEvent];
    const membershipsByTeam = opts?.membershipsByTeam ?? new Map([[4, coachTeamMemberships]]);
    const attendancesByEvent = opts?.attendancesByEvent ?? new Map<number, Attendance[]>();
    const statuses = opts?.statuses ?? [presentStatus];

    teamsMock = {
      teamsList: vi.fn().mockReturnValue(of({ count: teams.length, results: teams })),
      teamsMembershipsList: vi.fn().mockImplementation((teamPk: number) =>
        of(membershipsByTeam.get(teamPk) ?? []),
      ),
    };
    programsMock = {
      programsList: opts?.programsListThrows
        ? vi.fn().mockReturnValue(throwError(() => new Error('500')))
        : vi.fn().mockImplementation((..._args: unknown[]) => {
            // signature: dateEnd, dateStart, includeInactive, isActive, name, ordering, page, pageSize, search, team
            const teamId = _args[9] as number | undefined;
            const filtered = teamId ? programs.filter((p) => p.team_id === teamId) : programs;
            return of({ count: filtered.length, results: filtered });
          }),
    };
    eventsMock = {
      eventsList: vi.fn().mockImplementation((..._args: unknown[]) => {
        // signature: color, date, dateGte, dateLte, ordering, page, pageSize, referProgram, search
        const programId = _args[7] as number | undefined;
        const filtered = programId ? events.filter((e) => e.refer_program_id === programId) : events;
        return of({ count: filtered.length, results: filtered });
      }),
      eventsAttendanceList: vi.fn().mockImplementation((eventPk: number) =>
        of({ count: 0, results: attendancesByEvent.get(eventPk) ?? [] }),
      ),
    };
    statusesMock = {
      attendanceStatusesList: vi
        .fn()
        .mockReturnValue(of({ count: statuses.length, results: statuses })),
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
        { provide: ProgramsService, useValue: programsMock },
        { provide: EventsService, useValue: eventsMock },
        { provide: AttendanceStatusesService, useValue: statusesMock },
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
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }

  describe('coach pure (managed only)', () => {
    beforeEach(async () => {
      await setup();
    });

    it('builds managedTeams + no memberTeams + no redirect', () => {
      expect(access(component).hasManagedTeams()).toBe(true);
      expect(access(component).hasMemberTeams()).toBe(false);
      expect(access(component).isHybrid()).toBe(false);
      expect(router.navigate).not.toHaveBeenCalledWith(['/home']);
    });

    it('renders coach team cards with correct counts', () => {
      const cards = access(component).teamCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].team.id).toBe(4);
      expect(cards[0].programsActive).toBe(1);
      expect(cards[0].eventsNext7d).toBe(1);
      expect(cards[0].membersCount).toBe(2);
    });

    it('athlete sections are not built (memberTeamCards empty)', () => {
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
        programs: [program9],
        events: [memberTeamUpcomingEvent, memberTeamPastEvent],
        membershipsByTeam: new Map([[9, externalTeamMemberships]]),
        attendancesByEvent: new Map([[301, [myAttendance301]]]),
      });
    });

    it('does NOT redirect — athlete view replaces the redirect-to-home behavior', () => {
      expect(router.navigate).not.toHaveBeenCalledWith(['/home']);
      expect(access(component).hasManagedTeams()).toBe(false);
      expect(access(component).hasMemberTeams()).toBe(true);
    });

    it('builds memberTeamCards from teamsMembershipsList', () => {
      const cards = access(component).memberTeamCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].team.id).toBe(9);
      expect(cards[0].membersCount).toBe(2);
    });

    it('builds attendance history filtered by myMemberId via member_username match', () => {
      const items = access(component).attendanceHistory();
      expect(items).toHaveLength(1);
      expect(items[0].attendance.id).toBe(901);
      expect(items[0].status?.code).toBe('present');
    });

    it('maps the caller member id per team (single team -> stats panel scoped to self)', () => {
      const map = access(component).myMemberIdByTeam();
      expect(map.get(9)).toBe(77);
      expect(access(component).hasStats()).toBe(true);
      expect(access(component).multipleStatsTeams()).toBe(false);
      expect(access(component).activeStatsTeam()?.id).toBe(9);
      expect(access(component).activeStatsMemberId()).toBe(77);
    });

    it('coach sections are not built', () => {
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
        programs: [program1, program9],
        events: [upcomingEvent, memberTeamUpcomingEvent],
        membershipsByTeam: new Map([
          [4, coachTeamMemberships],
          [9, externalTeamMemberships],
        ]),
      });
    });

    it('exposes both hasManagedTeams and hasMemberTeams (isHybrid true)', () => {
      expect(access(component).hasManagedTeams()).toBe(true);
      expect(access(component).hasMemberTeams()).toBe(true);
      expect(access(component).isHybrid()).toBe(true);
    });

    it('coach upcoming holds only managed-team events; athlete upcoming holds only member-team events', () => {
      const coachIds = access(component).upcomingDisplayed().map((e) => e.event.id);
      const athleteIds = access(component).memberUpcomingDisplayed().map((e) => e.event.id);
      expect(coachIds).toEqual([200]);
      expect(athleteIds).toEqual([300]);
    });
  });

  describe('Mes statistiques — multiple member teams (per-team member id map)', () => {
    beforeEach(async () => {
      await setup({
        teams: [externalTeam, externalTeam2],
        user: athleteUser,
        programs: [program9],
        events: [memberTeamUpcomingEvent, memberTeamPastEvent],
        membershipsByTeam: new Map([
          [9, externalTeamMemberships],
          [10, externalTeam2Memberships],
        ]),
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

  describe('0 team (no managed, no member)', () => {
    beforeEach(async () => {
      await setup({ teams: [], user: athleteUser });
    });

    it('shows the welcome state instead of redirecting to /home', () => {
      expect(access(component).hasManagedTeams()).toBe(false);
      expect(access(component).hasMemberTeams()).toBe(false);
      expect(access(component).showWelcome()).toBe(true);
      expect(router.navigate).not.toHaveBeenCalledWith(['/home']);
    });
  });

  describe('coach upcoming filtering + cap (P17 regressions)', () => {
    it('upcoming events filtered to 14d window and sorted by date asc', async () => {
      const events = [
        { ...upcomingEvent, id: 300, date: ymd(addDays(today, 5)) },
        { ...upcomingEvent, id: 301, date: ymd(addDays(today, 1)) },
        { ...upcomingEvent, id: 302, date: ymd(addDays(today, 30)) },
      ];
      await setup({ events });
      const upcoming = access(component).upcomingDisplayed();
      expect(upcoming.map((u) => u.event.id)).toEqual([301, 300]);
    });

    it('attendancePending detects past events without attendance', async () => {
      await setup({
        events: [pastEventNoAttendance, pastEventWithAttendance],
        attendancesByEvent: new Map([[203, [{ id: 1 } as Attendance]]]),
      });
      const pending = access(component).attendancePending();
      expect(pending.map((p) => p.event.id)).toEqual([202]);
    });

    it('upcomingOverflow exposes count beyond cap of 20', async () => {
      const many: Event[] = Array.from({ length: 25 }, (_, i) => ({
        ...upcomingEvent,
        id: 1000 + i,
        date: ymd(addDays(today, 1 + (i % 13))),
      }));
      await setup({ events: many });
      expect(access(component).upcomingTotal()).toBe(25);
      expect(access(component).upcomingDisplayed()).toHaveLength(20);
      expect(access(component).upcomingOverflow()).toBe(5);
    });

    it('section 1 fails (programsList throws) does not stop bootstrap from completing', async () => {
      await setup({ programsListThrows: true });
      expect(access(component).errorTeams()).toBe(true);
      expect(access(component).loadingTeams()).toBe(false);
      expect(access(component).loadingUpcoming()).toBe(false);
      expect(access(component).loadingPending()).toBe(false);
    });
  });
});
