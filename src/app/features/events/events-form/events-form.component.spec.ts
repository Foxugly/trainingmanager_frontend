import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../../api/api/events.service';
import { PlacesService } from '../../../api/api/places.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Program } from '../../../api/model/program';
import { Sport } from '../../../api/model/sport';
import { TrainingTypeEnum } from '../../../api/model/training-type-enum';
import { Team } from '../../../api/model/team';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { EventsFormComponent } from './events-form.component';

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
  owner: { id: 17, username: 'owner', first_name: '', last_name: '' },
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
  vis_distance: VisibilityMode.After,
  vis_goal: VisibilityMode.Never,
  vis_rounds: VisibilityMode.After,
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
  is_active: true,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const eventFromBackend: Event = {
  ai_athlete_brief: '',
  id: 7,
  name: 'Séance 1',
  goal: 'Endurance',
  color: '#FF5733',
  date: '2026-05-02',
  hour_start: '18:00:00',
  hour_end: '19:30:00',
  total: 1500,
  refer_program: { id: 4, name: 'Cycle aérobie' },
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

interface ProtectedFields {
  eventId(): number | null;
  isEditMode(): boolean;
  saving(): boolean;
  fieldErrors(): { [k: string]: string[] } | null;
  availablePrograms(): Program[];
  form: {
    getRawValue(): Record<string, unknown>;
    patchValue(v: Record<string, unknown>): void;
    invalid: boolean;
    errors: Record<string, unknown> | null;
    controls: { refer_program_id: { disabled: boolean } };
  };
  fieldError(name: string): string | null;
  cancel(): void;
  submit(): void;
  onVisChanged(): void;
  selectedTeamId(): number | null;
  legacyLocation(): string | null;
}

describe('EventsFormComponent', () => {
  let fixture: ComponentFixture<EventsFormComponent>;
  let component: EventsFormComponent;
  let eventsMock: {
    eventsRetrieve: ReturnType<typeof vi.fn>;
    eventsCreate: ReturnType<typeof vi.fn>;
    eventsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let teamsMock: {
    teamsList: ReturnType<typeof vi.fn>;
    teamsRetrieve: ReturnType<typeof vi.fn>;
    teamsPoolsRetrieve: ReturnType<typeof vi.fn>;
  };
  let programsMock: { programsList: ReturnType<typeof vi.fn> };
  let placesMock: {
    placesList: ReturnType<typeof vi.fn>;
    placesCreate: ReturnType<typeof vi.fn>;
  };
  let routeIdParam: string | null;
  let routeQueryProgram: string | null;
  let router: Router;
  let messageService: MessageService;

  const access = (c: EventsFormComponent) => c as unknown as ProtectedFields;

  async function setup(
    idParam: string | null = null,
    retrieved: Event | null = eventFromBackend,
    queryProgram: string | null = null,
  ) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    routeQueryProgram = queryProgram;
    eventsMock = {
      eventsRetrieve: vi
        .fn()
        .mockReturnValue(retrieved ? of(retrieved) : throwError(() => new Error('404'))),
      eventsCreate: vi.fn().mockReturnValue(of({ ...eventFromBackend, id: 42 })),
      eventsPartialUpdate: vi.fn().mockReturnValue(of(eventFromBackend)),
    };
    teamsMock = {
      teamsList: vi.fn().mockReturnValue(of({ count: 1, results: [team] })),
      teamsRetrieve: vi.fn().mockReturnValue(of(team)),
      teamsPoolsRetrieve: vi.fn().mockReturnValue(of({ pools: ['Olympic pool', 'Training pool'] })),
    };
    programsMock = {
      programsList: vi.fn().mockReturnValue(of({ count: 1, results: [program] })),
    };
    placesMock = {
      placesList: vi.fn().mockReturnValue(
        of({
          count: 1,
          results: [{ id: 9, team: 4, name: 'Piscine olympique', address: '1 rue X' }],
        }),
      ),
      placesCreate: vi
        .fn()
        .mockReturnValue(of({ id: 10, team: 4, name: 'Nouveau lieu', address: '' })),
    };

    await TestBed.configureTestingModule({
      imports: [
        EventsFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: EventsService, useValue: eventsMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: ProgramsService, useValue: programsMock },
        { provide: PlacesService, useValue: placesMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (k: string) => (k === 'id' ? routeIdParam : null) },
              queryParamMap: { get: (k: string) => (k === 'program' ? routeQueryProgram : null) },
            },
          },
        },
      ],
    })
      .overrideComponent(EventsFormComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(EventsFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    messageService = TestBed.inject(MessageService);
    vi.spyOn(messageService, 'add');
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('starts in create mode with an invalid form (name + program + date required)', () => {
    expect(access(component).isEditMode()).toBe(false);
    expect(access(component).form.invalid).toBe(true);
    expect(eventsMock.eventsRetrieve).not.toHaveBeenCalled();
  });

  it('loads available programs in create mode via teamsList → programsList per team', async () => {
    await new Promise((r) => setTimeout(r, 0));
    expect(teamsMock.teamsList).toHaveBeenCalledWith({ isActive: true });
    expect(programsMock.programsList).toHaveBeenCalled();
    expect(access(component).availablePrograms().length).toBeGreaterThan(0);
  });

  it('toasts a load error when the teams list fails (program dropdown would be empty)', async () => {
    TestBed.resetTestingModule();
    routeIdParam = null;
    routeQueryProgram = null;
    teamsMock = {
      teamsList: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
      teamsRetrieve: vi.fn().mockReturnValue(of(team)),
      teamsPoolsRetrieve: vi.fn().mockReturnValue(of({ pools: [] })),
    };
    programsMock = { programsList: vi.fn().mockReturnValue(of({ count: 0, results: [] })) };
    placesMock = {
      placesList: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
      placesCreate: vi.fn().mockReturnValue(of({ id: 10, team: 4, name: 'X', address: '' })),
    };

    await TestBed.configureTestingModule({
      imports: [
        EventsFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: EventsService, useValue: eventsMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: ProgramsService, useValue: programsMock },
        { provide: PlacesService, useValue: placesMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => null },
              queryParamMap: { get: () => null },
            },
          },
        },
      ],
    })
      .overrideComponent(EventsFormComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(EventsFormComponent);
    component = fixture.componentInstance;
    messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));

    expect(access(component).availablePrograms()).toEqual([]);
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: 'events.form.errors.load_programs_failed',
      }),
    );
  });

  it('preselects + locks refer_program_id when ?program= is provided', async () => {
    await setup(null, null, '4');
    expect(access(component).form.getRawValue()).toMatchObject({ refer_program_id: 4 });
    expect(access(component).form.controls.refer_program_id.disabled).toBe(true);
  });

  it('blocks submit when form is invalid', () => {
    access(component).submit();
    expect(eventsMock.eventsCreate).not.toHaveBeenCalled();
  });

  it('flags time_range error when hour_end is before hour_start', () => {
    const start = new Date(2026, 4, 1, 19, 0, 0);
    const end = new Date(2026, 4, 1, 18, 0, 0);
    access(component).form.patchValue({ hour_start: start, hour_end: end });
    expect(access(component).form.errors?.['time_range']).toBe(true);
  });

  it('on edit mode, fetches and pre-fills the form, locks refer_program_id', async () => {
    await setup('7');
    expect(eventsMock.eventsRetrieve).toHaveBeenCalledWith({ id: 7 });
    expect(access(component).isEditMode()).toBe(true);
    expect(access(component).form.getRawValue()).toMatchObject({
      name: 'Séance 1',
      refer_program_id: 4,
      goal: 'Endurance',
      total: 1500,
      color: '#FF5733',
    });
    expect(access(component).form.controls.refer_program_id.disabled).toBe(true);
  });

  it('on create success, navigates to /events/:id with the new id', async () => {
    access(component).form.patchValue({
      name: 'New session',
      refer_program_id: 4,
      date: new Date(2026, 4, 5),
    });
    access(component).submit();
    expect(eventsMock.eventsCreate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/events', 42]);
  });

  it('on edit success, calls partialUpdate and routes back to /events/:id', async () => {
    await setup('7');
    access(component).form.patchValue({ name: 'Renamed' });
    access(component).submit();
    expect(eventsMock.eventsPartialUpdate).toHaveBeenCalledTimes(1);
    expect(eventsMock.eventsPartialUpdate.mock.calls[0][0].id).toBe(7);
    expect(router.navigate).toHaveBeenCalledWith(['/events', 7]);
  });

  it('maps server field errors into fieldErrors signal', () => {
    eventsMock.eventsCreate.mockReturnValueOnce(
      throwError(() => ({
        error: { code: 'validation_error', fields: { name: ['required'] } },
      })),
    );
    access(component).form.patchValue({
      name: 'X',
      refer_program_id: 4,
      date: new Date(2026, 4, 5),
    });
    access(component).submit();
    expect(access(component).fieldErrors()).not.toBeNull();
    expect(access(component).fieldErrors()?.['name']).toEqual(['required']);
  });

  it('flattens DRF-style { name: [...] } into fieldErrors when no `fields` wrapper', () => {
    eventsMock.eventsCreate.mockReturnValueOnce(
      throwError(() => ({ error: { name: ['this field is required.'] } })),
    );
    access(component).form.patchValue({
      name: 'X',
      refer_program_id: 4,
      date: new Date(2026, 4, 5),
    });
    access(component).submit();
    expect(access(component).fieldErrors()?.['name']).toEqual(['this field is required.']);
  });

  it('toasts a global error (no field errors) instead of inline display', () => {
    eventsMock.eventsCreate.mockReturnValueOnce(throwError(() => ({ error: { detail: 'boom' } })));
    access(component).form.patchValue({
      name: 'X',
      refer_program_id: 4,
      date: new Date(2026, 4, 5),
    });
    access(component).submit();
    expect(access(component).fieldErrors()).toBeNull();
    expect(messageService.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('exposes field errors via fieldError() helper', () => {
    eventsMock.eventsCreate.mockReturnValueOnce(
      throwError(() => ({ error: { fields: { name: ['required', 'too short'] } } })),
    );
    access(component).form.patchValue({
      name: 'X',
      refer_program_id: 4,
      date: new Date(2026, 4, 5),
    });
    access(component).submit();
    expect(access(component).fieldError('name')).toBe('required, too short');
    expect(access(component).fieldError('goal')).toBeNull();
  });

  it('cancel() navigates back to /events in create mode', () => {
    access(component).cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/events']);
  });

  it('cancel() navigates back to /events/:id in edit mode', async () => {
    await setup('7');
    access(component).cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/events', 7]);
  });

  it('toasts an error when an event fails to load in edit mode', async () => {
    await setup('7', null);
    expect(messageService.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('prefills vis_* from the selected program team defaults on create', async () => {
    access(component).form.patchValue({ refer_program_id: 4 });
    await new Promise((r) => setTimeout(r, 0));
    expect(teamsMock.teamsRetrieve).toHaveBeenCalledWith({ id: 4 });
    expect(access(component).form.getRawValue()).toMatchObject({
      vis_distance: VisibilityMode.After,
      vis_goal: VisibilityMode.Never,
      vis_rounds: VisibilityMode.After,
    });
  });

  it('fetches the program team only ONCE per pick (single teamsRetrieve feeds vis + sports)', async () => {
    teamsMock.teamsRetrieve.mockClear();
    access(component).form.patchValue({ refer_program_id: 4 });
    await new Promise((r) => setTimeout(r, 0));
    // Both vis-prefill and sports defaulting are driven from one response.
    expect(teamsMock.teamsRetrieve).toHaveBeenCalledTimes(1);
    expect(teamsMock.teamsRetrieve).toHaveBeenCalledWith({ id: 4 });
  });

  it('does not overwrite vis_* with team defaults once the user has changed them', async () => {
    access(component).form.patchValue({ vis_distance: VisibilityMode.Never });
    access(component).onVisChanged();
    access(component).form.patchValue({ refer_program_id: 4 });
    await new Promise((r) => setTimeout(r, 0));
    // The team is still fetched (to populate the session-sport options), but the
    // user-touched visibility controls must NOT be overwritten by team defaults.
    expect(access(component).form.getRawValue()).toMatchObject({
      vis_distance: VisibilityMode.Never,
    });
  });

  it('includes vis_* in the create payload', () => {
    access(component).form.patchValue({
      name: 'New session',
      refer_program_id: 4,
      date: new Date(2026, 4, 5),
      vis_distance: VisibilityMode.After,
      vis_goal: VisibilityMode.Never,
      vis_rounds: VisibilityMode.Always,
    });
    access(component).submit();
    expect(eventsMock.eventsCreate.mock.calls[0][0].eventRequest).toMatchObject({
      vis_distance: VisibilityMode.After,
      vis_goal: VisibilityMode.Never,
      vis_rounds: VisibilityMode.Always,
    });
  });

  it('includes vis_* in the update payload and loads them in edit mode', async () => {
    await setup('7');
    access(component).form.patchValue({ vis_goal: VisibilityMode.After });
    access(component).submit();
    expect(eventsMock.eventsPartialUpdate.mock.calls[0][0].patchedEventRequest).toMatchObject({
      vis_goal: VisibilityMode.After,
    });
  });

  it('resolves the selected program team id for the Place selector', async () => {
    access(component).form.patchValue({ refer_program_id: 4 });
    await new Promise((r) => setTimeout(r, 0));
    expect(access(component).selectedTeamId()).toBe(4);
  });

  it('sends place_id (not location) in the create payload', async () => {
    access(component).form.patchValue({
      name: 'Place session',
      refer_program_id: 4,
      date: new Date(2026, 4, 5),
      place_id: 9,
    });
    access(component).submit();
    expect(eventsMock.eventsCreate.mock.calls[0][0].eventRequest).toMatchObject({ place_id: 9 });
    expect(eventsMock.eventsCreate.mock.calls[0][0].eventRequest).not.toHaveProperty('location');
  });

  it('sends place_id in the update payload on edit', async () => {
    await setup('7');
    access(component).form.patchValue({ place_id: 9 });
    access(component).submit();
    expect(eventsMock.eventsPartialUpdate.mock.calls[0][0].patchedEventRequest).toMatchObject({
      place_id: 9,
    });
  });

  it('pre-selects the event place and clears the legacy location hint on edit', async () => {
    await setup('7', {
      ...eventFromBackend,
      location: 'Old text pool',
      place: { id: 9, name: 'Piscine olympique', address: '1 rue X' },
    });
    expect(access(component).form.getRawValue()).toMatchObject({ place_id: 9 });
    expect(access(component).legacyLocation()).toBeNull();
  });

  it('shows the legacy location as a hint when the event has no linked place', async () => {
    await setup('7', { ...eventFromBackend, location: 'Lac libre', place: null });
    expect(access(component).form.getRawValue()).toMatchObject({ place_id: null });
    expect(access(component).legacyLocation()).toBe('Lac libre');
  });
});
