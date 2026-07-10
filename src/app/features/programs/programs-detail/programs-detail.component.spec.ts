import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { Event } from '../../../api/model/event';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Program } from '../../../api/model/program';
import { Sport } from '../../../api/model/sport';
import { TrainingTypeEnum } from '../../../api/model/training-type-enum';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { ProgramsDetailComponent } from './programs-detail.component';

const ownerUser = { id: 17, first_name: 'testfrontend', last_name: '' } as CustomUserPublic;
const otherUser = { id: 99, first_name: 'someone', last_name: '' } as CustomUserPublic;

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
  default_training_type: TrainingTypeEnum.Structured,
};

const fullTeam: Team = {
  id: 4,
  name: 'RBP WP Senior',
  sport,
  sports: [
    { id: 1, name: 'Sport', slug: 'sport', is_default: true, order: 0, training_type: null },
  ],
  owner: ownerUser,
  managers: [],
  language: LanguageEnum.Fr,
  is_active: true,
  is_public: false,
  attendance_statuses: [],
  level: null,
  default_pool: '',
  places: [],
  default_place: null,
  equipment: [],
  logo_url: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const teamMinimal = { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr } as const;

const program: Program = {
  id: 7,
  name: 'Plan IA été',
  date_start: '2026-06-01',
  date_end: '2026-08-31',
  team: teamMinimal,
  events: [10, 11, 12],
  description: 'Cycle estival généré par IA.',
  generated_by_ai: true,
  ai_response: '...',
  ai_generated_at: '2026-04-15T00:00:00Z',
  is_active: true,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const archivedProgram: Program = { ...program, is_active: false };

interface ProtectedFields {
  programId(): number | null;
  program(): Program | null;
  loading(): boolean;
  notFound(): boolean;
  loadError(): boolean;
  reloadProgram(): void;
  activeValue(): boolean;
  patchActive(id: number, value: boolean): unknown;
  canManage(): boolean;
  canGenerate(): boolean;
  isArchived(): boolean;
  showGenerateDialog(): boolean;
  lastGenerationResult(): { created: number; deleted: number; rationale: string } | null;
  events(): Event[];
  currentMonth(): Date;
  eventsForMonth(): Event[];
  eventsByDay(): Map<string, Event[]>;
  eventsByDateAsc(): Event[];
  previousMonth(): void;
  nextMonth(): void;
  goToProgramStart(): void;
  openGenerateDialog(): void;
  onGenerated(r: { created: number; deleted: number; rationale: string }): void;
}

const eventA: Event = {
  ai_athlete_brief: '',
  id: 100,
  name: 'Séance A',
  goal: null,
  color: '#FF5733',
  date: '2026-06-05',
  hour_start: '18:00:00',
  hour_end: '19:30:00',
  total: 0,
  refer_program: { id: 7, name: 'Plan IA été' },
  team_id: 1,
  sport,
  place: null,
  equipment_items: [],
  rounds_detail: [],
  rounds: [],
  members: [],
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  created_at: '',
  updated_at: '',
  is_public: false,
  public_token: null,
};
const eventB: Event = {
  ...eventA,
  id: 101,
  name: 'Séance B',
  date: '2026-06-12',
  hour_start: '17:00:00',
};
const eventOutsideMonth: Event = { ...eventA, id: 102, name: 'Séance juillet', date: '2026-07-15' };

describe('ProgramsDetailComponent', () => {
  let fixture: ComponentFixture<ProgramsDetailComponent>;
  let component: ProgramsDetailComponent;
  let serviceMock: {
    programsRetrieve: ReturnType<typeof vi.fn>;
    programsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let teamsMock: { teamsRetrieve: ReturnType<typeof vi.fn> };
  let eventsMock: { eventsList: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;
  let router: Router;

  const access = (c: ProgramsDetailComponent) => c as unknown as ProtectedFields;

  async function setup(
    idParam: string | null = '7',
    retrieveResult: Program | null = program,
    currentUser: CustomUserPublic = ownerUser,
    eventsList: Event[] = [eventA, eventB, eventOutsideMonth],
    retrieveErrorStatus = 404,
  ) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    serviceMock = {
      programsRetrieve: vi
        .fn()
        .mockReturnValue(
          retrieveResult
            ? of(retrieveResult)
            : throwError(() => new HttpErrorResponse({ status: retrieveErrorStatus })),
        ),
      programsPartialUpdate: vi.fn().mockReturnValue(of({ ...program, is_active: false })),
    };
    teamsMock = { teamsRetrieve: vi.fn().mockReturnValue(of(fullTeam)) };
    eventsMock = {
      eventsList: vi.fn().mockReturnValue(of({ count: eventsList.length, results: eventsList })),
    };
    userSig = signal<CustomUserPublic | null>(currentUser);

    await TestBed.configureTestingModule({
      imports: [
        ProgramsDetailComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        ConfirmationService,
        MessageService,
        { provide: ProgramsService, useValue: serviceMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: EventsService, useValue: eventsMock },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
        {
          provide: LanguageService,
          useValue: { activeLang: signal('fr').asReadonly() },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeIdParam } } },
        },
      ],
    })
      .overrideComponent(ProgramsDetailComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProgramsDetailComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    // Pin "today" to the program's start month so the default calendar month
    // (initCalendarMonth reads new Date()) is deterministic regardless of when
    // the suite runs. Only Date is faked, so setTimeout/microtasks are untouched.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T09:00:00Z'));
    await setup();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the program for the route :id on init with includeInactive=true', () => {
    expect(serviceMock.programsRetrieve).toHaveBeenCalledWith({ id: 7, includeInactive: true });
    expect(access(component).program()?.id).toBe(7);
  });

  it('flags notFound (not loadError) when programsRetrieve fails with 404', async () => {
    await setup('7', null, ownerUser, [eventA, eventB, eventOutsideMonth], 404);
    expect(access(component).notFound()).toBe(true);
    expect(access(component).loadError()).toBe(false);
    expect(access(component).program()).toBeNull();
  });

  it('flags loadError (not notFound) + toasts when programsRetrieve fails with a non-404 status', async () => {
    await setup();
    const messageService = fixture.debugElement.injector.get(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');
    serviceMock.programsRetrieve.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    access(component).reloadProgram();
    expect(access(component).loadError()).toBe(true);
    expect(access(component).notFound()).toBe(false);
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'common.load_failed' }),
    );
  });

  it('reloadProgram re-fetches the program after a transient load error', async () => {
    await setup('7', null, ownerUser, [eventA, eventB, eventOutsideMonth], 500);
    expect(access(component).loadError()).toBe(true);
    serviceMock.programsRetrieve.mockReturnValue(of(program));
    access(component).reloadProgram();
    expect(access(component).loadError()).toBe(false);
    expect(access(component).program()?.id).toBe(7);
  });

  it('handles invalid route id without calling the API', async () => {
    await setup('not-a-number');
    expect(access(component).notFound()).toBe(true);
    expect(serviceMock.programsRetrieve).not.toHaveBeenCalled();
  });

  it('exposes ai_generated_at on AI-generated programs', () => {
    expect(access(component).program()?.generated_by_ai).toBe(true);
    expect(access(component).program()?.ai_generated_at).toBe('2026-04-15T00:00:00Z');
  });

  it('canManage and canGenerate are true for owner', () => {
    expect(teamsMock.teamsRetrieve).toHaveBeenCalledWith({ id: 4 });
    expect(access(component).canManage()).toBe(true);
    expect(access(component).canGenerate()).toBe(true);
  });

  it('canManage and canGenerate are false for a member-only user', async () => {
    await setup('7', program, otherUser);
    expect(access(component).canManage()).toBe(false);
    expect(access(component).canGenerate()).toBe(false);
  });

  it('openGenerateDialog flips showGenerateDialog and clears last result', () => {
    access(component).openGenerateDialog();
    expect(access(component).showGenerateDialog()).toBe(true);
    expect(access(component).lastGenerationResult()).toBeNull();
  });

  it('onGenerated stores the result and refetches the program', () => {
    serviceMock.programsRetrieve.mockClear();
    serviceMock.programsRetrieve.mockReturnValue(of(program));
    access(component).onGenerated({ created: 5, deleted: 0, rationale: 'ok' });
    expect(access(component).lastGenerationResult()?.created).toBe(5);
    expect(serviceMock.programsRetrieve).toHaveBeenCalled();
  });

  it('seeds activeValue from program.is_active on load', () => {
    expect(access(component).activeValue()).toBe(true);
  });

  it('seeds activeValue=false for an archived program', async () => {
    await setup('7', archivedProgram);
    expect(access(component).activeValue()).toBe(false);
  });

  it('patchActive calls programsPartialUpdate with is_active as the 3rd arg (undefined 2nd)', () => {
    serviceMock.programsPartialUpdate.mockClear();
    access(component).patchActive(7, false);
    expect(serviceMock.programsPartialUpdate).toHaveBeenCalledWith({
      id: 7,
      patchedProgramRequest: { is_active: false },
    });
  });

  it('isArchived reflects is_active=false', async () => {
    await setup('7', archivedProgram);
    expect(access(component).isArchived()).toBe(true);
  });

  it('loads events for the program via eventsList(refer_program=id) with month bounds', () => {
    expect(eventsMock.eventsList).toHaveBeenCalledTimes(1);
    const params = eventsMock.eventsList.mock.calls[0][0];
    // single-object RequestParams: { dateGte, dateLte, ordering, referProgram }
    expect(params.dateGte).toMatch(/^\d{4}-\d{2}-\d{2}$/); // dateGte
    expect(params.dateLte).toMatch(/^\d{4}-\d{2}-\d{2}$/); // dateLte
    expect(params.ordering).toBe('date'); // ordering ASC for calendar
    expect(params.referProgram).toBe(7); // referProgram
    expect(access(component).events()).toHaveLength(3);
  });

  it('initializes currentMonth from program.date_start (June 2026 here)', () => {
    const m = access(component).currentMonth();
    expect(m.getFullYear()).toBe(2026);
    expect(m.getMonth()).toBe(5);
  });

  it('eventsForMonth returns only events whose date falls in the displayed month, sorted asc', () => {
    const monthEvents = access(component).eventsForMonth();
    expect(monthEvents.map((e) => e.id)).toEqual([100, 101]);
    expect(
      access(component)
        .events()
        .map((e) => e.id),
    ).toEqual([100, 101, 102]);
  });

  it('previousMonth/nextMonth shift currentMonth by ±1 and shift the eventsForMonth list', () => {
    access(component).nextMonth();
    expect(access(component).currentMonth().getMonth()).toBe(6);
    expect(
      access(component)
        .eventsForMonth()
        .map((e) => e.id),
    ).toEqual([102]);
    access(component).previousMonth();
    expect(access(component).currentMonth().getMonth()).toBe(5);
    expect(
      access(component)
        .eventsForMonth()
        .map((e) => e.id),
    ).toEqual([100, 101]);
  });

  it('goToProgramStart() snaps back to the program.date_start month', () => {
    access(component).nextMonth();
    access(component).nextMonth();
    expect(access(component).currentMonth().getMonth()).toBe(7);
    access(component).goToProgramStart();
    expect(access(component).currentMonth().getMonth()).toBe(5);
  });

  it('eventsByDay maps the displayed grid to a Map<dayKey, Event[]>', () => {
    const map = access(component).eventsByDay();
    expect(map.get('2026-06-05')?.[0].id).toBe(100);
    expect(map.get('2026-06-12')?.[0].id).toBe(101);
    expect(map.get('2026-07-15')).toBeUndefined();
  });

  it('eventsByDateAsc returns ALL program events sorted ascending by date (not month-bound)', () => {
    const list = access(component).eventsByDateAsc();
    expect(list.map((e) => e.id)).toEqual([100, 101, 102]);
  });

  it('eventsByDateAsc returns an empty array when the program has no events', async () => {
    await setup('7', program, ownerUser, []);
    expect(access(component).events()).toEqual([]);
    expect(access(component).eventsByDateAsc()).toEqual([]);
  });

  it('eventsByDateAsc breaks date ties using hour_start ascending', async () => {
    const sameDayEarly: Event = {
      ...eventA,
      id: 200,
      name: 'Early',
      date: '2026-06-05',
      hour_start: '06:00:00',
    };
    const sameDayLate: Event = {
      ...eventA,
      id: 201,
      name: 'Late',
      date: '2026-06-05',
      hour_start: '20:00:00',
    };
    await setup('7', program, ownerUser, [sameDayLate, sameDayEarly]);
    expect(
      access(component)
        .eventsByDateAsc()
        .map((e) => e.id),
    ).toEqual([200, 201]);
  });
});
