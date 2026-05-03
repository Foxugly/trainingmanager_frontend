import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../api/api/events.service';
import { ProgramsService } from '../../api/api/programs.service';
import { TeamsService } from '../../api/api/teams.service';
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
const memberOnlyUser = { id: 88, username: 'athlete' } as CustomUserPublic;

const sport: Sport = {
  id: 1, name: 'Natation', slug: 'natation', is_active: true, energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const ownedTeam: Team = {
  id: 4, name: 'RBP WP Senior', sport, sport_id: 1, owner: ownerUser, managers: [],
  language: LanguageEnum.Fr, is_active: true, is_public: false, attendance_statuses: [],
  created_at: '', updated_at: '',
};

const memberTeam: Team = {
  ...ownedTeam, id: 9, owner: { id: 999 } as CustomUserPublic, managers: [],
};

const program1: Program = {
  id: 100, name: 'Cycle aérobie', date_start: null, date_end: null,
  team: { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr },
  team_id: 4, events: [], description: '',
  generated_by_ai: false, ai_response: '', ai_generated_at: null, is_active: true,
  created_at: '', updated_at: '',
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

const memberships: TeamMembership[] = [
  { id: 50, team: 4, member: 11, member_username: 'a', member_fullname: 'A', joined_at: '', left_at: null, created_at: '', updated_at: '' },
  { id: 51, team: 4, member: 12, member_username: 'b', member_fullname: 'B', joined_at: '', left_at: null, created_at: '', updated_at: '' },
];

interface ProtectedFields {
  managedTeams(): Team[];
  teamCards(): { team: Team; programsActive: number; eventsNext7d: number; membersCount: number }[];
  upcomingDisplayed(): { event: Event; teamName: string; programName: string }[];
  upcomingTotal(): number;
  upcomingOverflow(): number;
  attendancePending(): { event: Event; teamName: string; programName: string }[];
  loadingTeams(): boolean;
  loadingUpcoming(): boolean;
  loadingPending(): boolean;
  errorTeams(): boolean;
  errorUpcoming(): boolean;
  errorPending(): boolean;
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
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let router: Router;

  const access = (c: DashboardComponent) => c as unknown as ProtectedFields;

  async function setup(opts?: {
    teams?: Team[];
    user?: CustomUserPublic;
    programs?: Program[];
    events?: Event[];
    pastEventsHavingAttendance?: number[];
    teamsListThrows?: boolean;
    eventsListThrows?: boolean;
  }) {
    TestBed.resetTestingModule();
    const teams = opts?.teams ?? [ownedTeam];
    const programs = opts?.programs ?? [program1];
    const events = opts?.events ?? [upcomingEvent, farFutureEvent];
    const havingAttendance = new Set(opts?.pastEventsHavingAttendance ?? []);

    teamsMock = {
      teamsList: opts?.teamsListThrows
        ? vi.fn().mockReturnValue(throwError(() => new Error('500')))
        : vi.fn().mockReturnValue(of({ count: teams.length, results: teams })),
      teamsMembershipsList: vi.fn().mockReturnValue(of(memberships)),
    };
    programsMock = {
      programsList: vi.fn().mockReturnValue(of({ count: programs.length, results: programs })),
    };
    eventsMock = {
      eventsList: opts?.eventsListThrows
        ? vi.fn().mockReturnValue(throwError(() => new Error('500')))
        : vi.fn().mockReturnValue(of({ count: events.length, results: events })),
      eventsAttendanceList: vi.fn().mockImplementation((eventPk: number) =>
        havingAttendance.has(eventPk)
          ? of({ count: 1, results: [{ id: 1 }] })
          : of({ count: 0, results: [] }),
      ),
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
  }

  beforeEach(async () => {
    await setup();
  });

  it('manager: loads managedTeams, programs, events without redirecting', () => {
    expect(access(component).managedTeams()).toHaveLength(1);
    expect(access(component).managedTeams()[0].id).toBe(4);
    expect(router.navigate).not.toHaveBeenCalledWith(['/home']);
  });

  it('member-only user: redirects to /home and never builds team cards', async () => {
    await setup({ teams: [memberTeam], user: memberOnlyUser });
    expect(access(component).managedTeams()).toEqual([]);
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
    expect(access(component).teamCards()).toEqual([]);
  });

  it('section 1 — team card has correct programs/events/members counts', () => {
    const cards = access(component).teamCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].team.id).toBe(4);
    expect(cards[0].programsActive).toBe(1);
    expect(cards[0].eventsNext7d).toBe(1);
    expect(cards[0].membersCount).toBe(2);
  });

  it('section 2 — upcoming events filtered to 14d window and sorted by date asc', async () => {
    const events = [
      { ...upcomingEvent, id: 300, date: ymd(addDays(today, 5)) },
      { ...upcomingEvent, id: 301, date: ymd(addDays(today, 1)) },
      { ...upcomingEvent, id: 302, date: ymd(addDays(today, 30)) },
    ];
    await setup({ events });
    const upcoming = access(component).upcomingDisplayed();
    expect(upcoming.map((u) => u.event.id)).toEqual([301, 300]);
  });

  it('section 3 — past events without attendance flagged as pending', async () => {
    await setup({ events: [pastEventNoAttendance, pastEventWithAttendance], pastEventsHavingAttendance: [203] });
    const pending = access(component).attendancePending();
    expect(pending.map((p) => p.event.id)).toEqual([202]);
  });

  it('section 3 — empty list when no past event needs attention', async () => {
    await setup({ events: [upcomingEvent] });
    expect(access(component).attendancePending()).toEqual([]);
  });

  it('section 1 fails (programsList throws) does not stop page from rendering', async () => {
    programsMock = {
      programsList: vi.fn().mockReturnValue(throwError(() => new Error('500'))),
    };
    TestBed.resetTestingModule();
    userSig = signal<CustomUserPublic | null>(ownerUser);
    teamsMock = {
      teamsList: vi.fn().mockReturnValue(of({ count: 1, results: [ownedTeam] })),
      teamsMembershipsList: vi.fn().mockReturnValue(of(memberships)),
    };
    eventsMock = {
      eventsList: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
      eventsAttendanceList: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
    };

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

    expect(access(component).errorTeams()).toBe(true);
    expect(access(component).loadingTeams()).toBe(false);
    expect(access(component).loadingUpcoming()).toBe(false);
    expect(access(component).loadingPending()).toBe(false);
  });

  it('upcomingOverflow exposes the count of events not displayed (cap 20)', async () => {
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
});
