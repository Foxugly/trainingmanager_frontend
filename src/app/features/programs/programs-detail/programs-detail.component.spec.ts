import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Program } from '../../../api/model/program';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { ProgramsDetailComponent } from './programs-detail.component';

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

const fullTeam: Team = {
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

const team = { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr } as const;

const program: Program = {
  id: 7,
  name: 'Plan IA été',
  date_start: '2026-06-01',
  date_end: '2026-08-31',
  team,
  team_id: 4,
  events: [10, 11, 12],
  frequency_per_week: 4,
  description: 'Cycle estival généré par IA.',
  generated_by_ai: true,
  ai_response: '...',
  ai_generated_at: '2026-04-15T00:00:00Z',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

interface ProtectedFields {
  programId(): number | null;
  program(): Program | null;
  loading(): boolean;
  notFound(): boolean;
  canGenerate(): boolean;
  showGenerateDialog(): boolean;
  lastGenerationResult(): { created: number; deleted: number; rationale: string } | null;
  openGenerateDialog(): void;
  onGenerated(r: { created: number; deleted: number; rationale: string }): void;
}

describe('ProgramsDetailComponent', () => {
  let fixture: ComponentFixture<ProgramsDetailComponent>;
  let component: ProgramsDetailComponent;
  let serviceMock: { programsRetrieve: ReturnType<typeof vi.fn> };
  let teamsMock: { teamsRetrieve: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;

  const access = (c: ProgramsDetailComponent) => c as unknown as ProtectedFields;

  async function setup(
    idParam: string | null = '7',
    retrieveResult: Program | null = program,
    currentUser: CustomUserPublic = ownerUser,
  ) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    serviceMock = {
      programsRetrieve: vi
        .fn()
        .mockReturnValue(retrieveResult ? of(retrieveResult) : throwError(() => new Error('404'))),
    };
    teamsMock = { teamsRetrieve: vi.fn().mockReturnValue(of(fullTeam)) };
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
        { provide: ProgramsService, useValue: serviceMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
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
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads the program for the route :id on init', () => {
    expect(serviceMock.programsRetrieve).toHaveBeenCalledWith(7);
    expect(access(component).program()?.id).toBe(7);
  });

  it('flags notFound when programsRetrieve fails', async () => {
    await setup('7', null);
    expect(access(component).notFound()).toBe(true);
    expect(access(component).program()).toBeNull();
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

  it('canGenerate is true for owner', () => {
    expect(teamsMock.teamsRetrieve).toHaveBeenCalledWith(4);
    expect(access(component).canGenerate()).toBe(true);
  });

  it('canGenerate is false for member-only user', async () => {
    await setup('7', program, otherUser);
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
});
