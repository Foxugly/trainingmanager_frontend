import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { EventsCalendarComponent } from './events-calendar.component';

const ownerUser = { id: 17, username: 'testfrontend' } as CustomUserPublic;

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
  sport_id: 1,
  sports: [{ id: 1, name: 'Sport', slug: 'sport', is_default: true, order: 0, training_type: null }],
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

const team2: Team = { ...team, id: 5, name: 'Coach2' };

const program: Program = {
  id: 4,
  name: 'Cycle aérobie',
  date_start: '2026-04-01',
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

const program2: Program = { ...program, id: 5, name: 'Plan B', team_id: 5, team: { id: 5, name: 'Coach2', language: LanguageEnum.Fr } };

const event1: Event = {
  id: 100,
  name: 'Séance lundi',
  goal: null,
  color: '#FF5733',
  date: '2026-04-13',
  hour_start: null,
  hour_end: null,
  total: 0,
  refer_program: { id: 4, name: 'Cycle aérobie' },
  refer_program_id: 4,
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

const event2: Event = {
  ...event1,
  id: 101,
  name: 'Séance mercredi',
  date: '2026-04-15',
  color: 'invalid',
};

interface ProtectedFields {
  currentMonth: WritableSignal<Date>;
  selectedTeamIds(): number[];
  selectedProgramIds(): number[];
  availableTeams(): Team[];
  availablePrograms(): Program[];
  filteredAvailablePrograms(): Program[];
  events(): Event[];
  eventsByDay(): Map<string, Event[]>;
  loading(): boolean;
  daysInGrid(): Date[];
  previousMonth(): void;
  nextMonth(): void;
  goToToday(): void;
  selectedTeamIdsModel: number[];
  selectedProgramIdsModel: number[];
  eventBgColor(e: Event): string;
  canCreate(): boolean;
  skeletonIndices: Set<number>;
}

describe('EventsCalendarComponent', () => {
  let fixture: ComponentFixture<EventsCalendarComponent>;
  let component: EventsCalendarComponent;
  let teamsMock: { teamsList: ReturnType<typeof vi.fn> };
  let programsMock: { programsList: ReturnType<typeof vi.fn> };
  let eventsMock: { eventsList: ReturnType<typeof vi.fn> };
  let messageService: MessageService;
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;

  const access = (c: EventsCalendarComponent) => c as unknown as ProtectedFields;

  async function setup(
    currentUser: CustomUserPublic | null = ownerUser,
    teams: Team[] = [team, team2],
    opts: { teamsListFails?: boolean; programsListFails?: boolean } = {},
  ) {
    TestBed.resetTestingModule();
    userSig = signal<CustomUserPublic | null>(currentUser);
    teamsMock = {
      teamsList: vi
        .fn()
        .mockReturnValue(
          opts.teamsListFails
            ? throwError(() => new Error('boom'))
            : of({ count: teams.length, results: teams }),
        ),
    };
    programsMock = {
      programsList: vi.fn().mockImplementation(
        (params: { team?: number } = {}) => {
          if (opts.programsListFails) return throwError(() => new Error('boom'));
          // single-object request params (ProgramsListRequestParams)
          const teamId = params.team;
          if (teamId === 4) return of({ count: 1, results: [program] });
          if (teamId === 5) return of({ count: 1, results: [program2] });
          return of({ count: 0, results: [] });
        },
      ),
    };
    eventsMock = {
      eventsList: vi.fn().mockImplementation((params: { referProgram?: number } = {}) => {
        // single-object request params (EventsListRequestParams)
        const referProgram = params.referProgram;
        if (referProgram === 4) return of({ count: 2, results: [event1, event2] });
        return of({ count: 0, results: [] });
      }),
    };

    await TestBed.configureTestingModule({
      imports: [
        EventsCalendarComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: TeamsService, useValue: teamsMock },
        { provide: ProgramsService, useValue: programsMock },
        { provide: EventsService, useValue: eventsMock },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
      ],
    })
      .overrideComponent(EventsCalendarComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EventsCalendarComponent);
    component = fixture.componentInstance;
    messageService = TestBed.inject(MessageService);
    vi.spyOn(messageService, 'add');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads teams + their programs and pre-selects everything', async () => {
    expect(teamsMock.teamsList).toHaveBeenCalledWith({ isActive: true });
    expect(access(component).availableTeams()).toHaveLength(2);
    expect(access(component).selectedTeamIds()).toEqual([4, 5]);
    expect(access(component).availablePrograms().length).toBeGreaterThan(0);
  });

  it('previousMonth / nextMonth shift currentMonth by one', () => {
    const initial = access(component).currentMonth();
    access(component).previousMonth();
    const back = access(component).currentMonth();
    expect(back.getMonth()).toBe((initial.getMonth() + 11) % 12);
    access(component).nextMonth();
    access(component).nextMonth();
    const forward = access(component).currentMonth();
    expect(forward.getMonth()).toBe((initial.getMonth() + 1) % 12);
  });

  it('goToToday resets currentMonth to first of current month', () => {
    access(component).previousMonth();
    access(component).previousMonth();
    access(component).goToToday();
    const now = new Date();
    const m: Date = access(component).currentMonth();
    expect(m.getMonth()).toBe(now.getMonth());
    expect(m.getFullYear()).toBe(now.getFullYear());
    expect(m.getDate()).toBe(1);
  });

  it('filteredAvailablePrograms restricts programs to selected teams', () => {
    access(component).selectedTeamIdsModel = [4];
    expect(access(component).filteredAvailablePrograms().every((p) => p.team!.id === 4)).toBe(
      true,
    );
  });

  it('selectedProgramIds drops orphans when teams selection changes', () => {
    expect(access(component).selectedProgramIds()).toEqual(expect.arrayContaining([4, 5]));
    access(component).selectedTeamIdsModel = [4];
    fixture.detectChanges();
    expect(access(component).selectedProgramIds()).not.toContain(5);
  });

  it('clears events when no program is selected', async () => {
    access(component).selectedProgramIdsModel = [];
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    expect(access(component).events()).toEqual([]);
  });

  it('groups loaded events by date string into eventsByDay', async () => {
    access(component).currentMonth.set(new Date(2026, 3, 1));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const map = access(component).eventsByDay();
    expect(map.get('2026-04-13')?.length).toBe(1);
    expect(map.get('2026-04-15')?.length).toBe(1);
  });

  it('eventBgColor falls back to neutral for invalid hex', () => {
    expect(access(component).eventBgColor(event1)).toBe('#FF573333');
    expect(access(component).eventBgColor(event2)).toBe('#E0E7FF');
  });

  it('canCreate is true when current user owns or manages at least one team', () => {
    expect(access(component).canCreate()).toBe(true);
  });

  it('canCreate is false when current user is member-only of every team', async () => {
    const stranger = { id: 999, username: 'guest' } as CustomUserPublic;
    await setup(stranger);
    expect(access(component).canCreate()).toBe(false);
  });

  // Skeleton placeholders during initial load — see I-2 follow-up. The
  // template renders a <p-skeleton> in any same-month cell whose grid
  // index is in skeletonIndices and while loading() is true. We verify
  // the contract here (the Set is sparse-but-non-trivial); the DOM
  // rendering itself is tested via the build-time strictTemplates check
  // since this spec strips the template via overrideComponent.
  it('exposes a non-empty skeletonIndices Set distributed across the grid', () => {
    const set = access(component).skeletonIndices;
    expect(set.size).toBeGreaterThanOrEqual(6);
    // Indices should fall within the 6-week (42-cell) calendar window.
    for (const i of set) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(42);
    }
  });

  it('toasts a load error when the teams list fails', async () => {
    await setup(ownerUser, [team, team2], { teamsListFails: true });
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'common.load_failed' }),
    );
  });

  it('toasts a load error when the program fan-out fails', async () => {
    await setup(ownerUser, [team, team2], { programsListFails: true });
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'common.load_failed' }),
    );
  });
});
