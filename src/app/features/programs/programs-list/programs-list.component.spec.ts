import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Program } from '../../../api/model/program';
import { Sport } from '../../../api/model/sport';
import { TrainingTypeEnum } from '../../../api/model/training-type-enum';
import { Team } from '../../../api/model/team';
import { Me } from '../../../api/model/me';
import { AuthService } from '../../../core/auth/auth.service';
import { ProgramsListComponent } from './programs-list.component';

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
  default_training_type: TrainingTypeEnum.Structured,
};

const ownerUser = { id: 17, username: 'testfrontend' } as CustomUserPublic;
const memberUser = { id: 88, username: 'athlete' } as CustomUserPublic;

const ownedTeam: Team = {
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

const memberOnlyTeam: Team = { ...ownedTeam, id: 9, owner: { id: 999 } as CustomUserPublic, managers: [] };

const teamMinimal = { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr } as const;

const programs: Program[] = [
  {
    id: 1,
    name: 'Cycle aérobie',
    date_start: '2026-05-01',
    date_end: '2026-08-31',
    team: teamMinimal,
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
  },
  {
    id: 2,
    name: 'Plan IA été',
    date_start: '2026-06-01',
    date_end: '2026-08-31',
    team: teamMinimal,
    team_id: 4,
    events: [10, 11, 12],
    frequency_per_week: 4,
    description: '',
    generated_by_ai: true,
    ai_response: '',
    ai_generated_at: '2026-04-15T00:00:00Z',
    is_active: true,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
];

interface ProtectedFields {
  programs(): Program[];
  loading(): boolean;
  showArchived(): boolean;
  canCreate(): boolean;
  canShowArchivedToggle(): boolean;
}

describe('ProgramsListComponent', () => {
  let fixture: ComponentFixture<ProgramsListComponent>;
  let component: ProgramsListComponent;
  let serviceMock: { programsList: ReturnType<typeof vi.fn> };
  let teamsMock: { teamsList: ReturnType<typeof vi.fn> };
  let messageMock: { add: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<Me | null>>;

  const access = (c: ProgramsListComponent) => c as unknown as ProtectedFields;

  async function setup(opts?: {
    teamFilter?: number | null;
    results?: Program[];
    user?: CustomUserPublic | null;
    isStaff?: boolean;
    teams?: Team[];
    teamsListError?: boolean;
  }) {
    const teamFilter = opts?.teamFilter ?? null;
    const results = opts?.results ?? programs;
    const user = opts?.user ?? ownerUser;
    const isStaff = opts?.isStaff ?? false;
    const teams = opts?.teams ?? [ownedTeam];

    TestBed.resetTestingModule();
    serviceMock = {
      programsList: vi.fn().mockReturnValue(of({ count: results.length, results })),
    };
    teamsMock = {
      teamsList: opts?.teamsListError
        ? vi.fn().mockReturnValue(throwError(() => new Error('boom')))
        : vi.fn().mockReturnValue(of({ count: teams.length, results: teams })),
    };
    messageMock = { add: vi.fn() };
    const meLike = user ? ({ ...(user as object), is_staff: isStaff } as Me) : null;
    userSig = signal<Me | null>(meLike);

    await TestBed.configureTestingModule({
      imports: [
        ProgramsListComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ProgramsService, useValue: serviceMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: MessageService, useValue: messageMock },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
      ],
    })
      .overrideComponent(ProgramsListComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProgramsListComponent);
    component = fixture.componentInstance;
    if (teamFilter !== null) {
      fixture.componentRef.setInput('teamFilter', teamFilter);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads programs without team filter when teamFilter is null', () => {
    expect(serviceMock.programsList).toHaveBeenCalledWith({ ordering: '-date_start' });
    expect(access(component).programs()).toHaveLength(2);
  });

  it('passes the team filter to the API when teamFilter input is set', async () => {
    await setup({ teamFilter: 4 });
    expect(serviceMock.programsList).toHaveBeenCalledWith({ ordering: '-date_start', team: 4 });
  });

  it('reloads with includeInactive=true when showArchived is toggled on', () => {
    serviceMock.programsList.mockClear();
    (component as unknown as { showArchived: { set: (v: boolean) => void } }).showArchived.set(true);
    fixture.detectChanges();
    expect(serviceMock.programsList).toHaveBeenLastCalledWith({
      includeInactive: true,
      ordering: '-date_start',
    });
  });

  it('shows empty state when results is empty', async () => {
    await setup({ results: [] });
    expect(access(component).programs()).toEqual([]);
  });

  it('exposes a program flagged as AI-generated', () => {
    const ai = access(component).programs().find((p) => p.generated_by_ai);
    expect(ai?.id).toBe(2);
    expect(ai?.ai_generated_at).toBe('2026-04-15T00:00:00Z');
  });

  it('canCreate is true for an owner of at least one team', () => {
    expect(access(component).canCreate()).toBe(true);
  });

  it('canCreate is false for a user that is member only', async () => {
    await setup({ user: memberUser, teams: [memberOnlyTeam] });
    expect(access(component).canCreate()).toBe(false);
  });

  it('canShowArchivedToggle is true for staff even without team management role', async () => {
    await setup({ user: memberUser, teams: [memberOnlyTeam], isStaff: true });
    expect(access(component).canShowArchivedToggle()).toBe(true);
  });

  it('canShowArchivedToggle is false for member-only non-staff users', async () => {
    await setup({ user: memberUser, teams: [memberOnlyTeam], isStaff: false });
    expect(access(component).canShowArchivedToggle()).toBe(false);
  });

  it('toasts a load error when loading manager team ids fails', async () => {
    await setup({ teamsListError: true });
    expect(messageMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
    // canCreate silently stays false, but the failure is now surfaced.
    expect(access(component).canCreate()).toBe(false);
  });
});
