import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { Event } from '../../../api/model/event';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Program } from '../../../api/model/program';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
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

interface ProtectedFields {
  event(): Event | null;
  loading(): boolean;
  notFound(): boolean;
  canRegenerate(): boolean;
  confirmRegenerate(): void;
}

describe('EventsDetailComponent', () => {
  let fixture: ComponentFixture<EventsDetailComponent>;
  let component: EventsDetailComponent;
  let eventsMock: {
    eventsRetrieve: ReturnType<typeof vi.fn>;
    eventsGenerateTrainingCreate: ReturnType<typeof vi.fn>;
  };
  let programsMock: { programsRetrieve: ReturnType<typeof vi.fn> };
  let teamsMock: { teamsRetrieve: ReturnType<typeof vi.fn> };
  let roundsMock: { roundsDestroy: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;

  const access = (c: EventsDetailComponent) => c as unknown as ProtectedFields;

  async function setup(
    idParam: string | null = '7',
    eventResult: Event | null = eventNoRounds,
    currentUser: CustomUserPublic = ownerUser,
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
    };
    programsMock = { programsRetrieve: vi.fn().mockReturnValue(of(program)) };
    teamsMock = { teamsRetrieve: vi.fn().mockReturnValue(of(team)) };
    roundsMock = { roundsDestroy: vi.fn().mockReturnValue(of(null)) };
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
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeIdParam } } },
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

  it('confirmRegenerate without rounds calls eventsGenerateTrainingCreate on accept', () => {
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).confirmRegenerate();
    expect(eventsMock.eventsGenerateTrainingCreate).toHaveBeenCalledWith(7);
    expect(roundsMock.roundsDestroy).not.toHaveBeenCalled();
  });

  it('confirmRegenerate with existing rounds deletes them then regenerates', async () => {
    await setup('7', eventWithRounds);
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).confirmRegenerate();
    await new Promise((r) => setTimeout(r, 0));
    expect(roundsMock.roundsDestroy).toHaveBeenCalledTimes(3);
    expect(roundsMock.roundsDestroy).toHaveBeenNthCalledWith(1, 11);
    expect(eventsMock.eventsGenerateTrainingCreate).toHaveBeenCalledWith(7);
  });
});
