import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Program } from '../../../api/model/program';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { EventsFormComponent } from './events-form.component';

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
  owner: { id: 17, username: 'owner', first_name: '', last_name: '' },
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
  is_active: true,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const eventFromBackend: Event = {
  id: 7,
  name: 'Séance 1',
  goal: 'Endurance',
  color: '#FF5733',
  date: '2026-05-02',
  hour_start: '18:00:00',
  hour_end: '19:30:00',
  total: 1500,
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
}

describe('EventsFormComponent', () => {
  let fixture: ComponentFixture<EventsFormComponent>;
  let component: EventsFormComponent;
  let eventsMock: {
    eventsRetrieve: ReturnType<typeof vi.fn>;
    eventsCreate: ReturnType<typeof vi.fn>;
    eventsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let teamsMock: { teamsList: ReturnType<typeof vi.fn> };
  let programsMock: { programsList: ReturnType<typeof vi.fn> };
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
    };
    programsMock = {
      programsList: vi.fn().mockReturnValue(of({ count: 1, results: [program] })),
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
    expect(teamsMock.teamsList).toHaveBeenCalledWith(true);
    expect(programsMock.programsList).toHaveBeenCalled();
    expect(access(component).availablePrograms().length).toBeGreaterThan(0);
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
    expect(eventsMock.eventsRetrieve).toHaveBeenCalledWith(7);
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
    expect(eventsMock.eventsPartialUpdate.mock.calls[0][0]).toBe(7);
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
    eventsMock.eventsCreate.mockReturnValueOnce(
      throwError(() => ({ error: { detail: 'boom' } })),
    );
    access(component).form.patchValue({
      name: 'X',
      refer_program_id: 4,
      date: new Date(2026, 4, 5),
    });
    access(component).submit();
    expect(access(component).fieldErrors()).toBeNull();
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
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
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
  });
});
