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
};

const team: Team = {
  id: 4,
  name: 'RBP WP Senior',
  sport,
  sport_id: 1,
  owner: ownerUser,
  managers: [],
  language: LanguageEnum.Fr,
  is_active: true,
  is_public: false,
  attendance_statuses: [],
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const program: Program = {
  id: 4,
  name: 'Cycle aérobie',
  date_start: '2026-05-01',
  date_end: '2026-08-31',
  team: { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr },
  team_id: 4,
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
  id: 7,
  name: 'Séance 1',
  goal: null,
  color: undefined,
  date: '2026-05-02',
  hour_start: null,
  hour_end: null,
  total: undefined,
  refer_program: { id: 4, name: 'Cycle aérobie' },
  refer_program_id: 4,
  rounds: [],
  members: [],
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const eventWithRounds: Event = { ...eventNoRounds, rounds: [11, 12, 13] };

const round1: Round = {
  id: 11,
  sport,
  sport_id: 1,
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
  energysegment: { id: 1, abv: 'Z2', description: '', energy_system: { id: 1, name: 'Aérobie', abbreviation: 'AE' }, is_active: true },
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
  canRegenerate(): boolean;
  canManage(): boolean;
  confirmRegenerate(): void;
  confirmDelete(): void;
  deleting(): boolean;
  rounds(): Round[];
  exercisesByRound(): Map<number, Exercise[]>;
  loadingRounds(): boolean;
  activeTab(): string;
  exerciseDistance(ex: Exercise): number;
  roundTotalDistance(round: Round): number;
  eventTotalDistance(): number;
  formatDistance(meters: number): string;
  showRoundDialog(): boolean;
  roundDialogMode(): 'create' | 'edit';
  editingRound(): Round | null;
  openCreateRound(): void;
  openEditRound(r: Round): void;
  onRoundDialogClosed(r: Round | null): void;
  confirmDeleteRound(r: Round): void;
  confirmDeleteExercise(ex: Exercise): void;
  // Inline exercise editing
  editingExerciseId(): number | null;
  newRows(): { key: string; roundId: number }[];
  modalities(): Modality[];
  energySegments(): EnergySegment[];
  rowKeyForExercise(ex: Exercise): string;
  formFor(key: string): ExerciseRowForm | null;
  isEditingExercise(ex: Exercise): boolean;
  newRowsFor(roundId: number): { key: string; roundId: number }[];
  startEditExercise(ex: Exercise): void;
  startAddExercise(roundId: number): void;
  cancelEditExercise(ex: Exercise): void;
  cancelNewRow(key: string): void;
  saveEditExercise(ex: Exercise): void;
  saveNewRow(row: { key: string; roundId: number }): void;
  // ROTI
  rotiEnabled(): boolean;
  isAthlete(): boolean;
  rotiSummary(): { average: number | null; count: number; distribution: { [k: string]: number }; my_score: number | null } | null;
  rotiDistribution(): { score: number; count: number }[];
  submitRoti(score: number): void;
  // RSVP
  rsvpEnabled(): boolean;
  rsvpSummary(): {
    counts: { going: number; maybe: number; not_going: number; no_response: number };
    total_members: number;
    my_status: string | null;
    by_member: { member_id: number; name: string; status: string | null }[];
  } | null;
  rsvpHasResponses(): boolean;
  isMyStatus(status: string): boolean;
  submitRsvp(status: string): void;
  confirmApplyRsvpToAttendance(): void;
  // Athlete-side visibility hints
  isRestrictedViewer(): boolean;
  distanceHidden(): boolean;
  goalHidden(): boolean;
  roundsHidden(): boolean;
  distanceHiddenVariant(): 'never' | 'after';
  goalHiddenVariant(): 'never' | 'after';
  roundsHiddenVariant(): 'never' | 'after';
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

  const access = (c: EventsDetailComponent) => c as unknown as ProtectedFields;

  async function setup(
    idParam: string | null = '7',
    eventResult: Event | null = eventNoRounds,
    currentUser: CustomUserPublic = ownerUser,
    teamResult: Team = team,
  ) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    eventsMock = {
      eventsRetrieve: vi
        .fn()
        .mockReturnValue(eventResult ? of(eventResult) : throwError(() => new Error('404'))),
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
        .mockImplementation((_id: number, body: { total?: number }) =>
          of({ ...(eventResult ?? eventNoRounds), total: body?.total ?? 0 } as Event),
        ),
      eventsRotiRetrieve: vi
        .fn()
        .mockReturnValue(
          of([{ average: 3.4, count: 5, distribution: { '1': 0, '2': 1, '3': 2, '4': 1, '5': 1 }, my_score: 4 }]),
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
      eventsRsvpUpdate: vi
        .fn()
        .mockImplementation((_id: number, body: { status: string }) =>
          of({
            counts: { going: 3, maybe: 1, not_going: 1, no_response: 0 },
            total_members: 5,
            my_status: body.status,
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
      exercisesRetrieve: vi.fn().mockImplementation((id: number) =>
        of(id === 201 ? exercise1 : exercise2),
      ),
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
            snapshot: { paramMap: { get: () => routeIdParam } },
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

  it('loads the event for route :id and resolves the team for role', () => {
    expect(eventsMock.eventsRetrieve).toHaveBeenCalledWith(7);
    expect(programsMock.programsRetrieve).toHaveBeenCalledWith(4);
    expect(teamsMock.teamsRetrieve).toHaveBeenCalledWith(4);
    expect(access(component).event()?.id).toBe(7);
    expect(access(component).canRegenerate()).toBe(true);
  });

  it('flags notFound when eventsRetrieve fails', async () => {
    await setup('7', null);
    expect(access(component).notFound()).toBe(true);
  });

  it('hides regenerate for member-only users', async () => {
    await setup('7', eventNoRounds, otherUser);
    expect(access(component).canRegenerate()).toBe(false);
  });

  it('onRegenerateConfirmed without rounds calls eventsGenerateTrainingCreate with the additional prompt', () => {
    (component as unknown as { onRegenerateConfirmed: (s: string) => void }).onRegenerateConfirmed(
      'focus on endurance',
    );
    expect(eventsMock.eventsGenerateTrainingCreate).toHaveBeenCalledWith(7, {
      additional_prompt: 'focus on endurance',
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
    expect(roundsMock.roundsDestroy).toHaveBeenNthCalledWith(1, 11);
    expect(eventsMock.eventsGenerateTrainingCreate).toHaveBeenCalledWith(7, {
      additional_prompt: 'with kickboard',
    });
  });

  it('skips roundsRetrieve when event has no rounds', () => {
    expect(roundsMock.roundsRetrieve).not.toHaveBeenCalled();
    expect(access(component).rounds()).toEqual([]);
    expect(access(component).exercisesByRound().size).toBe(0);
  });

  it('fetches rounds + exercises when event has rounds', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(roundsMock.roundsRetrieve).toHaveBeenCalledTimes(3);
    expect(exercisesMock.exercisesRetrieve).toHaveBeenCalled();
    expect(access(component).rounds().length).toBe(3);
  });

  it('exposes ordered exercises per round', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const map = access(component).exercisesByRound();
    const exercises = map.get(11);
    expect(exercises?.length).toBe(2);
    expect(exercises?.[0].order).toBeLessThanOrEqual(exercises?.[1].order ?? 999);
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
    expect(eventsMock.eventsDestroy).toHaveBeenCalledWith(7);
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

  it('activeTab can switch to "attendance"', () => {
    const tab = (component as unknown as { activeTab: { set(v: string): void } }).activeTab;
    tab.set('attendance');
    expect(access(component).activeTab()).toBe('attendance');
  });

  it('exerciseDistance returns repetition × distance', () => {
    const ex = { repetition: 4, distance: 50 } as unknown as Exercise;
    expect(access(component).exerciseDistance(ex)).toBe(200);
  });

  it('exerciseDistance treats missing repetition as 1 and missing distance as 0', () => {
    const noRep = { distance: 100 } as unknown as Exercise;
    const noDist = { repetition: 5 } as unknown as Exercise;
    expect(access(component).exerciseDistance(noRep)).toBe(100);
    expect(access(component).exerciseDistance(noDist)).toBe(0);
  });

  it('roundTotalDistance multiplies count by the sum of exercise distances', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const rounds = access(component).rounds();
    expect(rounds.length).toBe(3);
    // each round has count=2, exercises [201 (4×50=200) + 202 (4×100=400)] = 600 per iteration
    // round total = 2 × 600 = 1200
    expect(access(component).roundTotalDistance(rounds[0])).toBe(1200);
  });

  it('eventTotalDistance sums each round.count × Σ(rep × dist) across all rounds', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    // 3 rounds × 1200 m = 3600 m
    expect(access(component).eventTotalDistance()).toBe(3600);
  });

  it('eventTotalDistance is 0 when the event has no rounds loaded', () => {
    expect(access(component).eventTotalDistance()).toBe(0);
  });

  it('formatDistance formats meters as plain "N m" and ≥1000 m as km (no trailing zero)', () => {
    const fd = (n: number) => access(component).formatDistance(n);
    expect(fd(0)).toBe('0 m');
    expect(fd(200)).toBe('200 m');
    expect(fd(999)).toBe('999 m');
    expect(fd(1000)).toBe('1 km');
    expect(fd(1500)).toBe('1.5 km');
    expect(fd(2000)).toBe('2 km');
    expect(fd(2500)).toBe('2.5 km');
  });

  it('openCreateRound opens the dialog in create mode with no editing round', () => {
    access(component).openCreateRound();
    expect(access(component).showRoundDialog()).toBe(true);
    expect(access(component).roundDialogMode()).toBe('create');
    expect(access(component).editingRound()).toBeNull();
  });

  it('openEditRound opens the dialog in edit mode with the target round', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const round = access(component).rounds()[0];
    access(component).openEditRound(round);
    expect(access(component).showRoundDialog()).toBe(true);
    expect(access(component).roundDialogMode()).toBe('edit');
    expect(access(component).editingRound()).toEqual(round);
  });

  it('confirmDeleteRound triggers ConfirmDialog and on accept calls roundsDestroy + reloads', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const round = access(component).rounds()[0];
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    eventsMock.eventsRetrieve.mockClear();
    access(component).confirmDeleteRound(round);
    expect(roundsMock.roundsDestroy).toHaveBeenCalledWith(round.id);
    // reload triggers eventsRetrieve a second time
    expect(eventsMock.eventsRetrieve).toHaveBeenCalledWith(7);
  });

  it('onRoundDialogClosed with a truthy round closes the dialog and reloads the event', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    eventsMock.eventsRetrieve.mockClear();
    access(component).openCreateRound();
    expect(access(component).showRoundDialog()).toBe(true);
    access(component).onRoundDialogClosed({
      ...exercise1,
      id: 999,
    } as unknown as Round);
    expect(access(component).showRoundDialog()).toBe(false);
    expect(access(component).editingRound()).toBeNull();
    expect(eventsMock.eventsRetrieve).toHaveBeenCalledWith(7);
  });

  it('onRoundDialogClosed(null) closes without reloading', async () => {
    await setup('7', eventNoRounds);
    eventsMock.eventsRetrieve.mockClear();
    access(component).openCreateRound();
    access(component).onRoundDialogClosed(null);
    expect(access(component).showRoundDialog()).toBe(false);
    expect(eventsMock.eventsRetrieve).not.toHaveBeenCalled();
  });

  it('confirmDeleteExercise triggers ConfirmDialog and on accept calls exercisesDestroy + reloads', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const ex = exercise1;
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    eventsMock.eventsRetrieve.mockClear();
    access(component).confirmDeleteExercise(ex);
    expect(exercisesMock.exercisesDestroy).toHaveBeenCalledWith(ex.id);
    expect(eventsMock.eventsRetrieve).toHaveBeenCalledWith(7);
  });

  // --- Inline exercise editing ---

  it('loads modality + energy-segment options once the team sport is known', async () => {
    await new Promise((r) => setTimeout(r, 0));
    expect(sportsMock.sportsModalitiesList).toHaveBeenCalledWith(1);
    expect(energySegmentsMock.energySegmentsList).toHaveBeenCalled();
    expect(access(component).modalities().length).toBe(1);
    expect(access(component).energySegments().length).toBe(1);
  });

  it('startAddExercise appends a new row pre-filled from the last exercise of the round', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    // round 11 has exercise1 (201) + exercise2 (202, distance 100, t_break 00:30)
    access(component).startAddExercise(11);
    const rows = access(component).newRowsFor(11);
    expect(rows.length).toBe(1);
    const form = access(component).formFor(rows[0].key);
    expect(form).not.toBeNull();
    const v = form!.getRawValue();
    // pre-fill from last exercise (202): modality 1, segment 1, distance 100, t_break 00:30
    expect(v.modality_id).toBe(1);
    expect(v.energysegment_id).toBe(1);
    expect(v.distance).toBe(100);
    expect(v.t_break).toBe('00:30');
    // repetition resets to 1, notes empties
    expect(v.repetition).toBe(1);
    expect(v.notes).toBe('');
  });

  it('startAddExercise on an empty round seeds defaults (rep 1, distance 50)', async () => {
    access(component).startAddExercise(11);
    const rows = access(component).newRowsFor(11);
    const v = access(component).formFor(rows[0].key)!.getRawValue();
    expect(v.repetition).toBe(1);
    expect(v.distance).toBe(50);
    expect(v.modality_id).toBeNull();
  });

  it('saveNewRow calls exercisesCreate with round linkage + payload and clears the row', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    access(component).startAddExercise(11);
    const row = access(component).newRowsFor(11)[0];
    const form = access(component).formFor(row.key)!;
    form.controls.modality_id.setValue(1);
    form.controls.energysegment_id.setValue(1);
    form.controls.repetition.setValue(6);
    form.controls.distance.setValue(75);
    access(component).saveNewRow(row);
    await new Promise((r) => setTimeout(r, 0));
    expect(exercisesMock.exercisesCreate).toHaveBeenCalledTimes(1);
    const payload = exercisesMock.exercisesCreate.mock.calls[0][0];
    expect(payload.round_id).toBe(11);
    expect(payload.modality_id).toBe(1);
    expect(payload.energysegment_id).toBe(1);
    expect(payload.repetition).toBe(6);
    expect(payload.distance).toBe(75);
    // row removed after success, new exercise appended to the round
    expect(access(component).newRowsFor(11).length).toBe(0);
    const list = access(component).exercisesByRound().get(11) ?? [];
    expect(list.some((e) => e.id === 999)).toBe(true);
  });

  it('startEditExercise then saveEditExercise calls exercisesPartialUpdate and exits edit mode', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    access(component).startEditExercise(exercise1);
    expect(access(component).isEditingExercise(exercise1)).toBe(true);
    const form = access(component).formFor(access(component).rowKeyForExercise(exercise1))!;
    form.controls.repetition.setValue(8);
    access(component).saveEditExercise(exercise1);
    await new Promise((r) => setTimeout(r, 0));
    expect(exercisesMock.exercisesPartialUpdate).toHaveBeenCalledTimes(1);
    expect(exercisesMock.exercisesPartialUpdate.mock.calls[0][0]).toBe(exercise1.id);
    expect(exercisesMock.exercisesPartialUpdate.mock.calls[0][1].repetition).toBe(8);
    expect(access(component).editingExerciseId()).toBeNull();
    // updated row reflected in the round's exercise list
    const updated = (access(component).exercisesByRound().get(11) ?? []).find(
      (e) => e.id === exercise1.id,
    );
    expect(updated?.repetition).toBe(8);
  });

  it('cancelNewRow removes a freshly-added row without any API call', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    access(component).startAddExercise(11);
    const row = access(component).newRowsFor(11)[0];
    access(component).cancelNewRow(row.key);
    expect(access(component).newRowsFor(11).length).toBe(0);
    expect(access(component).formFor(row.key)).toBeNull();
    expect(exercisesMock.exercisesCreate).not.toHaveBeenCalled();
  });

  it('cancelEditExercise reverts an existing-exercise edit to display mode', async () => {
    await setup('7', eventWithRounds);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    access(component).startEditExercise(exercise1);
    expect(access(component).isEditingExercise(exercise1)).toBe(true);
    access(component).cancelEditExercise(exercise1);
    expect(access(component).editingExerciseId()).toBeNull();
    expect(access(component).formFor(access(component).rowKeyForExercise(exercise1))).toBeNull();
    expect(exercisesMock.exercisesPartialUpdate).not.toHaveBeenCalled();
  });

  // --- ROTI (session difficulty) ---

  const rotiTeam: Team = { ...team, roti_enabled: true };
  const athleteUser = otherUser; // not owner, not in managers → 'member' / athlete

  it('does not load ROTI when the team has roti_enabled falsy', () => {
    expect(access(component).rotiEnabled()).toBe(false);
    expect(eventsMock.eventsRotiRetrieve).not.toHaveBeenCalled();
    expect(access(component).rotiSummary()).toBeNull();
  });

  it('loads the ROTI summary when the team has roti_enabled', async () => {
    await setup('7', eventNoRounds, ownerUser, rotiTeam);
    await new Promise((r) => setTimeout(r, 0));
    expect(access(component).rotiEnabled()).toBe(true);
    expect(eventsMock.eventsRotiRetrieve).toHaveBeenCalledWith(7);
    // array payload unwrapped to a single summary
    expect(access(component).rotiSummary()?.count).toBe(5);
    expect(access(component).rotiSummary()?.average).toBe(3.4);
  });

  it('isAthlete is true for a member-only user and false for the owner', async () => {
    await setup('7', eventNoRounds, athleteUser, rotiTeam);
    expect(access(component).isAthlete()).toBe(true);
    await setup('7', eventNoRounds, ownerUser, rotiTeam);
    expect(access(component).isAthlete()).toBe(false);
  });

  it('athlete submitRoti PUTs the score then refreshes the summary', async () => {
    await setup('7', eventNoRounds, athleteUser, rotiTeam);
    await new Promise((r) => setTimeout(r, 0));
    access(component).submitRoti(2);
    expect(eventsMock.eventsRotiUpdate).toHaveBeenCalledWith(7, { score: 2 });
    expect(access(component).rotiSummary()?.my_score).toBe(2);
  });

  it('rotiDistribution maps the 1..5 buckets to counts', async () => {
    await setup('7', eventNoRounds, ownerUser, rotiTeam);
    await new Promise((r) => setTimeout(r, 0));
    const dist = access(component).rotiDistribution();
    expect(dist.map((d) => d.score)).toEqual([1, 2, 3, 4, 5]);
    expect(dist.map((d) => d.count)).toEqual([0, 1, 2, 1, 1]);
  });

  // --- RSVP (availability) ---

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
    expect(eventsMock.eventsRsvpRetrieve).toHaveBeenCalledWith(7);
    expect(access(component).rsvpSummary()?.counts.going).toBe(2);
    expect(access(component).rsvpSummary()?.total_members).toBe(5);
    expect(access(component).rsvpHasResponses()).toBe(true);
  });

  it('athlete submitRsvp PUTs the status then refreshes the summary', async () => {
    await setup('7', eventNoRounds, athleteUser, rsvpTeam);
    await new Promise((r) => setTimeout(r, 0));
    access(component).submitRsvp('going');
    expect(eventsMock.eventsRsvpUpdate).toHaveBeenCalledWith(7, { status: 'going' });
    expect(access(component).rsvpSummary()?.my_status).toBe('going');
    expect(access(component).isMyStatus('going')).toBe(true);
    expect(access(component).isMyStatus('maybe')).toBe(false);
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
    expect(eventsMock.eventsRsvpApplyToAttendance).toHaveBeenCalledWith(7);
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
    expect(access(component).roundsHidden()).toBe(true);
    expect(access(component).distanceHiddenVariant()).toBe('after');
    expect(access(component).goalHiddenVariant()).toBe('never');
    expect(access(component).roundsHiddenVariant()).toBe('after');
  });

  it('never shows hidden hints to a manager/owner', async () => {
    await setup('7', hiddenEvent, ownerUser);
    await new Promise((r) => setTimeout(r, 0));
    expect(access(component).isRestrictedViewer()).toBe(false);
    expect(access(component).distanceHidden()).toBe(false);
    expect(access(component).goalHidden()).toBe(false);
    expect(access(component).roundsHidden()).toBe(false);
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
    expect(access(component).roundsHidden()).toBe(false);
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
      ...eventWithRounds,
      vis_distance: VisibilityMode.After,
    };
    await setup('7', visibleDistanceEvent, otherUser);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    // 3 rounds × 1200 m loaded → distance is visible, not hidden.
    expect(access(component).eventTotalDistance()).toBeGreaterThan(0);
    expect(access(component).distanceHidden()).toBe(false);
  });
});
