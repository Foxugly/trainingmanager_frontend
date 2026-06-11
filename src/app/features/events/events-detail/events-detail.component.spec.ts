import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergySegmentsService } from '../../../api/api/energy-segments.service';
import { EventsService } from '../../../api/api/events.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { SportsService } from '../../../api/api/sports.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { EnergySegment } from '../../../api/model/energy-segment';
import { Event } from '../../../api/model/event';
import { Exercise } from '../../../api/model/exercise';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Modality } from '../../../api/model/modality';
import { Program } from '../../../api/model/program';
import { Round } from '../../../api/model/round';
import { Sport } from '../../../api/model/sport';
import { TrainingTypeEnum } from '../../../api/model/training-type-enum';
import { Team } from '../../../api/model/team';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { AuthService } from '../../../core/auth/auth.service';
import { EventsDetailComponent } from './events-detail.component';

const ownerUser = { id: 17, username: 'testfrontend' } as CustomUserPublic;
const otherUser = { id: 99, username: 'someone' } as CustomUserPublic;

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
  default_training_type: TrainingTypeEnum.Structured,
};

const team: Team = {
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

const program: Program = {
  id: 4,
  name: 'Cycle aérobie',
  date_start: '2026-05-01',
  date_end: '2026-08-31',
  team: { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr },
  events: [],
  frequency_per_week: 3,
  description: '',
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const eventNoRounds: Event = {
  ai_athlete_brief: '',
  id: 7,
  name: 'Séance 1',
  goal: null,
  color: undefined,
  date: '2026-05-02',
  hour_start: null,
  hour_end: null,
  total: undefined,
  refer_program: { id: 4, name: 'Cycle aérobie' },
  team_id: 4,
  sport,
  place: null,
  equipment_items: [],
  rounds_detail: [],
  rounds: [],
  members: [],
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
  is_public: false,
  public_token: null,
};

const eventWithRounds: Event = { ...eventNoRounds, rounds: [11, 12, 13] };

const round1: Round = {
  id: 11,
  sport,
  language: LanguageEnum.Fr,
  order: 1,
  count: 2,
  t_start: null,
  t_break: null,
  exercises: [201, 202],
  usage_count: 0,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const exercise1 = {
  id: 201,
  order: 1,
  repetition: 4,
  distance: 50,
  notes: '',
  t_start: null,
  t_break: '00:30',
  modality: { id: 1, name: 'Crawl', sport, is_active: true },
  modality_id: 1,
  energysegment: {
    id: 1,
    abv: 'Z2',
    description: '',
    energy_system: { id: 1, name: 'Aérobie', abbreviation: 'AE' },
    is_active: true,
  },
  energysegment_id: 1,
  language: LanguageEnum.Fr,
  usage_count: 0,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
} as unknown as Exercise;

const exercise2 = { ...exercise1, id: 202, order: 2, distance: 100 } as Exercise;

interface ProtectedFields {
  event(): Event | null;
  loading(): boolean;
  notFound(): boolean;
  loadError(): boolean;
  canRegenerate(): boolean;
  canManage(): boolean;
  isPastEvent(): boolean;
  onRegenerateConfirmed(prompt: string): void;
  confirmRegenerate(): void;
  confirmDelete(): void;
  deleting(): boolean;
  activeTab(): string;
  // Training editor (app-event-training) state mirror + total passthrough.
  onTrainingState(state: { totalDistance: number; loading: boolean }): void;
  eventTotalDistance(): number;
  reloadEvent(): void;
  // ROTI (fetch/submit live in app-event-roti now)
  rotiEnabled(): boolean;
  isAthlete(): boolean;
  // RSVP (summary fetch + apply stay here; rendering in app-event-rsvp)
  rsvpEnabled(): boolean;
  rsvpSummary(): {
    counts: { going: number; maybe: number; not_going: number; no_response: number };
    total_members: number;
    my_status: string | null;
    by_member: { member_id: number; name: string; status: string | null }[];
  } | null;
  submitRsvp(status: string): void;
  confirmApplyRsvpToAttendance(): void;
  // Athlete-side visibility hints (rounds hint moved to app-event-training)
  isRestrictedViewer(): boolean;
  // Training-type selector
  onTrainingTypeChange(next: TrainingTypeEnum): void;
  trainingTypeControl: FormControl<TrainingTypeEnum>;
  distanceHidden(): boolean;
  goalHidden(): boolean;
  distanceHiddenVariant(): 'never' | 'after';
  goalHiddenVariant(): 'never' | 'after';
}

type ExerciseRowForm = FormGroup<{
  modality_id: FormControl<number | null>;
  energysegment_id: FormControl<number | null>;
  repetition: FormControl<number>;
  distance: FormControl<number>;
  t_start: FormControl<string>;
  t_break: FormControl<string>;
  notes: FormControl<string>;
}>;

describe('EventsDetailComponent', () => {
  let fixture: ComponentFixture<EventsDetailComponent>;
  let component: EventsDetailComponent;
  let eventsMock: {
    eventsRetrieve: ReturnType<typeof vi.fn>;
    eventsGenerateTrainingCreate: ReturnType<typeof vi.fn>;
    eventsDestroy: ReturnType<typeof vi.fn>;
    eventsPartialUpdate: ReturnType<typeof vi.fn>;
    eventsRotiRetrieve: ReturnType<typeof vi.fn>;
    eventsRotiUpdate: ReturnType<typeof vi.fn>;
    eventsRsvpRetrieve: ReturnType<typeof vi.fn>;
    eventsRsvpUpdate: ReturnType<typeof vi.fn>;
    eventsRsvpApplyToAttendance: ReturnType<typeof vi.fn>;
  };
  let programsMock: { programsRetrieve: ReturnType<typeof vi.fn> };
  let teamsMock: { teamsRetrieve: ReturnType<typeof vi.fn> };
  let roundsMock: {
    roundsDestroy: ReturnType<typeof vi.fn>;
    roundsRetrieve: ReturnType<typeof vi.fn>;
  };
  let exercisesMock: {
    exercisesRetrieve: ReturnType<typeof vi.fn>;
    exercisesDestroy: ReturnType<typeof vi.fn>;
    exercisesCreate: ReturnType<typeof vi.fn>;
    exercisesPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let sportsMock: { sportsModalitiesList: ReturnType<typeof vi.fn> };
  let energySegmentsMock: { energySegmentsList: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;
  let routeQueryTab: string | null;

  const access = (c: EventsDetailComponent) => c as unknown as ProtectedFields;

  async function setup(
    idParam: string | null = '7',
    eventResult: Event | null = eventNoRounds,
    currentUser: CustomUserPublic = ownerUser,
    teamResult: Team = team,
    queryTab: string | null = null,
  ) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    routeQueryTab = queryTab;
    eventsMock = {
      eventsRetrieve: vi
        .fn()
        .mockReturnValue(
          eventResult ? of(eventResult) : throwError(() => new HttpErrorResponse({ status: 404 })),
        ),
      eventsGenerateTrainingCreate: vi.fn().mockReturnValue(
        of({
          rounds_created: 4,
          exercises_created: 12,
          exercises_reused: 2,
          rationale: 'Block layout',
          model: 'm',
          tokens_used: { input: 0, output: 0, total: 0 },
        }),
      ),
      eventsDestroy: vi.fn().mockReturnValue(of(null)),
      eventsPartialUpdate: vi
        .fn()
        .mockImplementation((p: { patchedEventRequest?: { total?: number } }) =>
          of({
            ...(eventResult ?? eventNoRounds),
            total: p?.patchedEventRequest?.total ?? 0,
          } as Event),
        ),
      eventsRotiRetrieve: vi
        .fn()
        .mockReturnValue(
          of([
            {
              average: 3.4,
              count: 5,
              distribution: { '1': 0, '2': 1, '3': 2, '4': 1, '5': 1 },
              my_score: 4,
            },
          ]),
        ),
      eventsRotiUpdate: vi
        .fn()
        .mockImplementation((_id: number, body: { score: number }) =>
          of({ average: 3.5, count: 6, distribution: {}, my_score: body.score }),
        ),
      eventsRsvpRetrieve: vi.fn().mockReturnValue(
        of({
          counts: { going: 2, maybe: 1, not_going: 1, no_response: 1 },
          total_members: 5,
          my_status: null,
          by_member: [
            { member_id: 1, name: 'Alice', status: 'going' },
            { member_id: 2, name: 'Bob', status: null },
          ],
        }),
      ),
      eventsRsvpUpdate: vi.fn().mockImplementation((p: { rsvpUpsertRequest: { status: string } }) =>
        of({
          counts: { going: 3, maybe: 1, not_going: 1, no_response: 0 },
          total_members: 5,
          my_status: p.rsvpUpsertRequest.status,
          by_member: [],
        }),
      ),
      eventsRsvpApplyToAttendance: vi.fn().mockReturnValue(of({ applied: 3, skipped: 1 })),
    };
    programsMock = { programsRetrieve: vi.fn().mockReturnValue(of(program)) };
    teamsMock = { teamsRetrieve: vi.fn().mockReturnValue(of(teamResult)) };
    roundsMock = {
      roundsDestroy: vi.fn().mockReturnValue(of(null)),
      roundsRetrieve: vi.fn().mockImplementation((id: number) => of({ ...round1, id })),
    };
    exercisesMock = {
      exercisesRetrieve: vi
        .fn()
        .mockImplementation((id: number) => of(id === 201 ? exercise1 : exercise2)),
      exercisesDestroy: vi.fn().mockReturnValue(of(null)),
      exercisesCreate: vi
        .fn()
        .mockImplementation((body: Partial<Exercise>) =>
          of({ ...exercise1, id: 999, ...body } as unknown as Exercise),
        ),
      exercisesPartialUpdate: vi
        .fn()
        .mockImplementation((id: number, body: Partial<Exercise>) =>
          of({ ...exercise1, id, ...body } as unknown as Exercise),
        ),
    };
    sportsMock = {
      sportsModalitiesList: vi.fn().mockReturnValue(
        of({
          results: [{ id: 1, name: 'Crawl', sport, is_active: true } as unknown as Modality],
        }),
      ),
    };
    energySegmentsMock = {
      energySegmentsList: vi.fn().mockReturnValue(
        of({
          results: [
            {
              id: 1,
              abv: 'Z2',
              description: 'Aérobie léger',
              energy_system: { id: 1, name: 'Aérobie', abbreviation: 'AE' },
              is_active: true,
            } as unknown as EnergySegment,
          ],
        }),
      ),
    };
    userSig = signal<CustomUserPublic | null>(currentUser);

    await TestBed.configureTestingModule({
      imports: [
        EventsDetailComponent,
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
        { provide: EventsService, useValue: eventsMock },
        { provide: ProgramsService, useValue: programsMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: RoundsService, useValue: roundsMock },
        { provide: ExercisesService, useValue: exercisesMock },
        { provide: SportsService, useValue: sportsMock },
        { provide: EnergySegmentsService, useValue: energySegmentsMock },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => routeIdParam },
              queryParamMap: convertToParamMap(routeQueryTab ? { tab: routeQueryTab } : {}),
            },
            paramMap: of(convertToParamMap(routeIdParam == null ? {} : { id: routeIdParam })),
          },
        },
      ],
    })
      .overrideComponent(EventsDetailComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EventsDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads the event for route :id and resolves the team directly via event.team_id', () => {
    expect(eventsMock.eventsRetrieve).toHaveBeenCalledWith({ id: 7 });
    // team is fetched directly from the embedded team_id — no programsRetrieve
    // hop (the previous event->program->team cascade was collapsed to event->team).
    expect(programsMock.programsRetrieve).not.toHaveBeenCalled();
    expect(teamsMock.teamsRetrieve).toHaveBeenCalledWith({ id: 4 });
    expect(access(component).event()?.id).toBe(7);
    expect(access(component).canRegenerate()).toBe(true);
  });

  it('flags notFound (not loadError) when eventsRetrieve fails with 404', async () => {
    await setup('7', null);
    expect(access(component).notFound()).toBe(true);
    expect(access(component).loadError()).toBe(false);
  });

  it('flags loadError (not notFound) + toasts when eventsRetrieve fails with a non-404 status', async () => {
    await setup();
    const messageService = fixture.debugElement.injector.get(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');
    eventsMock.eventsRetrieve.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    access(component).reloadEvent();
    expect(access(component).loadError()).toBe(true);
    expect(access(component).notFound()).toBe(false);
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'events.detail.load_failed' }),
    );
  });

  it('toasts a warning when the program/team fetch fails (piped chain error handler)', async () => {
    TestBed.resetTestingModule();
    await setup();
    const messageService = fixture.debugElement.injector.get(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');
    teamsMock.teamsRetrieve.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    access(component).reloadEvent();
    await new Promise((r) => setTimeout(r, 0));
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', detail: 'events.detail.team_load_failed' }),
    );
  });

  it('hides regenerate for member-only users', async () => {
    await setup('7', eventNoRounds, otherUser);
    expect(access(component).canRegenerate()).toBe(false);
  });

  it('isPastEvent is true for a session dated strictly before today', async () => {
    // eventNoRounds is dated 2026-05-02 — well in the past for the test clock.
    await setup('7', { ...eventNoRounds, date: '2000-01-01' });
    expect(access(component).isPastEvent()).toBe(true);
  });

  it('isPastEvent is false for a future-dated session', async () => {
    await setup('7', { ...eventNoRounds, date: '2999-12-31' });
    expect(access(component).isPastEvent()).toBe(false);
  });

  it('isPastEvent is false when the session has no date', async () => {
    await setup('7', { ...eventNoRounds, date: null });
    expect(access(component).isPastEvent()).toBe(false);
  });

  it('isPastEvent is false for a session dated today (boundary, not strictly before)', async () => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    await setup('7', { ...eventNoRounds, date: todayIso });
    expect(access(component).isPastEvent()).toBe(false);
  });

  it('maps a 409 event_in_past regenerate error to a friendly toast', async () => {
    await setup('7', { ...eventNoRounds, date: '2000-01-01' });
    const messageService = fixture.debugElement.injector.get(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');
    eventsMock.eventsGenerateTrainingCreate.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { code: 'event_in_past', detail: 'Session is in the past.' },
          }),
      ),
    );
    access(component).onRegenerateConfirmed('whatever');
    await new Promise((r) => setTimeout(r, 0));
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        detail: 'events.detail.regenerate_past_blocked',
      }),
    );
  });

  it('onRegenerateConfirmed without rounds calls eventsGenerateTrainingCreate with the additional prompt', () => {
    (component as unknown as { onRegenerateConfirmed: (s: string) => void }).onRegenerateConfirmed(
      'focus on endurance',
    );
    expect(eventsMock.eventsGenerateTrainingCreate).toHaveBeenCalledWith({
      id: 7,
      generateTrainingRequestRequest: { additional_prompt: 'focus on endurance' },
    });
    expect(roundsMock.roundsDestroy).not.toHaveBeenCalled();
  });

  it('onRegenerateConfirmed with existing rounds deletes them then regenerates with the prompt', async () => {
    await setup('7', eventWithRounds);
    (component as unknown as { onRegenerateConfirmed: (s: string) => void }).onRegenerateConfirmed(
      'with kickboard',
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(roundsMock.roundsDestroy).toHaveBeenCalledTimes(3);
    expect(roundsMock.roundsDestroy).toHaveBeenNthCalledWith(1, { id: 11 });
    expect(eventsMock.eventsGenerateTrainingCreate).toHaveBeenCalledWith({
      id: 7,
      generateTrainingRequestRequest: { additional_prompt: 'with kickboard' },
    });
  });

  it('canManage is true for owner and false for member-only user', async () => {
    expect(access(component).canManage()).toBe(true);
    await setup('7', eventNoRounds, otherUser);
    expect(access(component).canManage()).toBe(false);
  });

  it('canManage drives both Edit and Saisir présences buttons visibility (owner sees, member-only does not)', async () => {
    expect(access(component).canManage()).toBe(true);
    await setup('7', eventNoRounds, otherUser);
    expect(access(component).canManage()).toBe(false);
  });

  it('confirmDelete calls eventsDestroy on accept and routes to /programs/<programId>', async () => {
    const router = fixture.debugElement.injector.get(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).confirmDelete();
    await new Promise((r) => setTimeout(r, 0));
    expect(eventsMock.eventsDestroy).toHaveBeenCalledWith({ id: 7 });
    expect(navSpy).toHaveBeenCalledWith(['/programs', 4]);
    expect(access(component).deleting()).toBe(false);
  });

  it('confirmDelete is hidden for member-only users via canManage()', async () => {
    await setup('7', eventNoRounds, otherUser);
    expect(access(component).canManage()).toBe(false);
  });

  it('default active tab on mount is "training"', () => {
    expect(access(component).activeTab()).toBe('training');
  });

  it('honors a deep-linked ?tab=attendance query param on init', async () => {
    await setup('7', eventNoRounds, ownerUser, team, 'attendance');
    expect(access(component).activeTab()).toBe('attendance');
  });

  it('ignores an unknown ?tab= value and keeps the default', async () => {
    await setup('7', eventNoRounds, ownerUser, team, 'bogus');
    expect(access(component).activeTab()).toBe('training');
  });

  it('activeTab can switch to "attendance"', () => {
    const tab = (component as unknown as { activeTab: { set(v: string): void } }).activeTab;
    tab.set('attendance');
    expect(access(component).activeTab()).toBe('attendance');
  });

  // --- ROTI (session difficulty) — the tab UI + fetch live in app-event-roti
  //     (covered by event-roti.component.spec); the parent only exposes the
  //     enabled/athlete gating that mounts + parameterizes it. ---

  const rotiTeam: Team = { ...team, roti_enabled: true };
  const athleteUser = otherUser; // not owner, not in managers → 'member' / athlete

  it('isAthlete is true for a member-only user and false for the owner', async () => {
    await setup('7', eventNoRounds, athleteUser, rotiTeam);
    expect(access(component).isAthlete()).toBe(true);
    await setup('7', eventNoRounds, ownerUser, rotiTeam);
    expect(access(component).isAthlete()).toBe(false);
  });

  // --- RSVP (availability) — the parent keeps the summary fetch (the attendance
  //     tab consumes rsvpByMember regardless of the RSVP tab) + the apply flow;
  //     app-event-rsvp renders it (covered by event-rsvp.component.spec). ---

  const rsvpTeam: Team = { ...team, rsvp_enabled: true };

  it('does not load RSVP when the team has rsvp_enabled falsy', () => {
    expect(access(component).rsvpEnabled()).toBe(false);
    expect(eventsMock.eventsRsvpRetrieve).not.toHaveBeenCalled();
    expect(access(component).rsvpSummary()).toBeNull();
  });

  it('loads the RSVP summary when the team has rsvp_enabled', async () => {
    await setup('7', eventNoRounds, ownerUser, rsvpTeam);
    await new Promise((r) => setTimeout(r, 0));
    expect(access(component).rsvpEnabled()).toBe(true);
    expect(eventsMock.eventsRsvpRetrieve).toHaveBeenCalledWith({ eventPk: 7 });
    expect(access(component).rsvpSummary()?.counts.going).toBe(2);
    expect(access(component).rsvpSummary()?.total_members).toBe(5);
  });

  it('submitRsvp PUTs the status then refreshes the summary', async () => {
    await setup('7', eventNoRounds, athleteUser, rsvpTeam);
    await new Promise((r) => setTimeout(r, 0));
    access(component).submitRsvp('going');
    expect(eventsMock.eventsRsvpUpdate).toHaveBeenCalledWith({
      eventPk: 7,
      rsvpUpsertRequest: { status: 'going' },
    });
    expect(access(component).rsvpSummary()?.my_status).toBe('going');
  });

  it('manager apply-to-attendance posts after confirm and reloads the event', async () => {
    await setup('7', eventNoRounds, ownerUser, rsvpTeam);
    await new Promise((r) => setTimeout(r, 0));
    const confirmService = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmService;
    });
    const retrieveCallsBefore = eventsMock.eventsRetrieve.mock.calls.length;
    access(component).confirmApplyRsvpToAttendance();
    expect(eventsMock.eventsRsvpApplyToAttendance).toHaveBeenCalledWith({ eventPk: 7 });
    // reloadEvent() triggers another eventsRetrieve to refresh the attendance tab.
    expect(eventsMock.eventsRetrieve.mock.calls.length).toBeGreaterThan(retrieveCallsBefore);
  });

  // --- Athlete-side visibility hints ---

  const hiddenEvent: Event = {
    ...eventNoRounds,
    goal: null,
    total: undefined,
    vis_distance: VisibilityMode.After,
    vis_goal: VisibilityMode.Never,
    vis_rounds: VisibilityMode.After,
  };

  it('shows distance/goal/rounds hidden hints for a non-manager athlete when values are hidden', async () => {
    await setup('7', hiddenEvent, otherUser);
    await new Promise((r) => setTimeout(r, 0));
    expect(access(component).isRestrictedViewer()).toBe(true);
    expect(access(component).distanceHidden()).toBe(true);
    expect(access(component).goalHidden()).toBe(true);
    expect(access(component).distanceHiddenVariant()).toBe('after');
    expect(access(component).goalHiddenVariant()).toBe('never');
  });

  it('never shows hidden hints to a manager/owner', async () => {
    await setup('7', hiddenEvent, ownerUser);
    await new Promise((r) => setTimeout(r, 0));
    expect(access(component).isRestrictedViewer()).toBe(false);
    expect(access(component).distanceHidden()).toBe(false);
    expect(access(component).goalHidden()).toBe(false);
  });

  it('does not flag hidden when visibility mode is "always" even for an athlete', async () => {
    const alwaysEvent: Event = {
      ...eventNoRounds,
      goal: null,
      total: undefined,
      vis_distance: VisibilityMode.Always,
      vis_goal: VisibilityMode.Always,
      vis_rounds: VisibilityMode.Always,
    };
    await setup('7', alwaysEvent, otherUser);
    await new Promise((r) => setTimeout(r, 0));
    expect(access(component).distanceHidden()).toBe(false);
    expect(access(component).goalHidden()).toBe(false);
  });

  it('does not flag goal hidden when the goal is present despite restricted mode', async () => {
    const visibleGoalEvent: Event = {
      ...eventNoRounds,
      goal: 'Endurance',
      vis_goal: VisibilityMode.After,
    };
    await setup('7', visibleGoalEvent, otherUser);
    await new Promise((r) => setTimeout(r, 0));
    expect(access(component).goalHidden()).toBe(false);
  });

  it('does not flag distance hidden when the computed distance is non-zero despite restricted mode', async () => {
    const visibleDistanceEvent: Event = {
      ...eventNoRounds,
      total: undefined,
      vis_distance: VisibilityMode.After,
    };
    await setup('7', visibleDistanceEvent, otherUser);
    await new Promise((r) => setTimeout(r, 0));
    // The training editor (app-event-training) computes + emits the total; once
    // it is non-zero the distance is visible, not hidden.
    access(component).onTrainingState({ totalDistance: 3600, loading: false });
    expect(access(component).eventTotalDistance()).toBe(3600);
    expect(access(component).distanceHidden()).toBe(false);
  });

  it('eventTotalDistance reflects the training editor state, else falls back to event.total', async () => {
    await setup('7', { ...eventNoRounds, total: 1500 } as Event, ownerUser);
    // No state emitted yet → falls back to the stored event.total.
    expect(access(component).eventTotalDistance()).toBe(1500);
    // Once the editor emits, that wins.
    access(component).onTrainingState({ totalDistance: 4200, loading: false });
    expect(access(component).eventTotalDistance()).toBe(4200);
  });

  // --- Training-type selector (structured ↔ freeform) ---

  it('switching training_type with existing content asks for confirmation first', async () => {
    await setup('7', { ...eventWithRounds, training_type: TrainingTypeEnum.Structured });
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const confirmSpy = vi.spyOn(confirmation, 'confirm').mockReturnValue(confirmation);
    access(component).onTrainingTypeChange(TrainingTypeEnum.Freeform);
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'events.training.switch_confirm' }),
    );
    // Not applied until the confirm is accepted.
    expect(eventsMock.eventsPartialUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        patchedEventRequest: { training_type: TrainingTypeEnum.Freeform },
      }),
    );
  });

  it('switching training_type on an empty session applies directly (PATCH + reload)', async () => {
    await setup('7', { ...eventNoRounds, training_type: TrainingTypeEnum.Structured });
    const retrieveCallsBefore = eventsMock.eventsRetrieve.mock.calls.length;
    access(component).onTrainingTypeChange(TrainingTypeEnum.Freeform);
    expect(eventsMock.eventsPartialUpdate).toHaveBeenCalledWith({
      id: 7,
      patchedEventRequest: { training_type: TrainingTypeEnum.Freeform },
    });
    // applyTrainingType → reloadEvent() refetches the event.
    expect(eventsMock.eventsRetrieve.mock.calls.length).toBeGreaterThan(retrieveCallsBefore);
  });

  it('accepting the confirm applies the training_type change', async () => {
    await setup('7', { ...eventWithRounds, training_type: TrainingTypeEnum.Structured });
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).onTrainingTypeChange(TrainingTypeEnum.Freeform);
    expect(eventsMock.eventsPartialUpdate).toHaveBeenCalledWith({
      id: 7,
      patchedEventRequest: { training_type: TrainingTypeEnum.Freeform },
    });
  });

  it('rejecting the confirm reverts the select control to the original type and does not PATCH', async () => {
    await setup('7', { ...eventWithRounds, training_type: TrainingTypeEnum.Structured });
    // Simulate the widget having moved to the rejected option, mirroring how
    // PrimeNG would have written the new value into the control before onChange.
    access(component).trainingTypeControl.setValue(TrainingTypeEnum.Freeform, { emitEvent: false });
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.reject?.();
      return confirmation;
    });
    access(component).onTrainingTypeChange(TrainingTypeEnum.Freeform);
    // No PATCH fires for a rejected switch.
    expect(eventsMock.eventsPartialUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        patchedEventRequest: { training_type: TrainingTypeEnum.Freeform },
      }),
    );
    // The revert is real: the control value is written back to the original type.
    expect(access(component).trainingTypeControl.value).toBe(TrainingTypeEnum.Structured);
  });
});
