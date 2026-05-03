import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
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
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { ProgramsFormComponent } from './programs-form.component';

const ownerUser = { id: 17, username: 'testfrontend' } as CustomUserPublic;

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const ownedTeam: Team = {
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

const teamMinimal = { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr } as const;

const program: Program = {
  id: 7,
  name: 'Cycle aérobie',
  date_start: '2026-06-01',
  date_end: '2026-08-31',
  team: teamMinimal,
  team_id: 4,
  events: [],
  frequency_per_week: 3,
  description: 'Existant',
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  is_active: true,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

interface ProtectedFields {
  programId(): number | null;
  program(): Program | null;
  isEditMode(): boolean;
  saving(): boolean;
  errorMessage(): string | null;
  fieldErrors(): { [k: string]: string[] } | null;
  availableTeams(): Team[];
  form: {
    getRawValue(): Record<string, unknown>;
    patchValue(v: Record<string, unknown>): void;
    invalid: boolean;
    valid: boolean;
    controls: { team_id: { disabled: boolean } };
  };
  submit(): void;
}

describe('ProgramsFormComponent', () => {
  let fixture: ComponentFixture<ProgramsFormComponent>;
  let component: ProgramsFormComponent;
  let programsMock: {
    programsRetrieve: ReturnType<typeof vi.fn>;
    programsCreate: ReturnType<typeof vi.fn>;
    programsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let teamsMock: { teamsList: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;
  let routeQueryTeam: string | null;
  let router: Router;

  const access = (c: ProgramsFormComponent) => c as unknown as ProtectedFields;

  async function setup(
    idParam: string | null = null,
    retrieved: Program | null = program,
    teams: Team[] = [ownedTeam],
    queryTeam: string | null = null,
  ) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    routeQueryTeam = queryTeam;
    programsMock = {
      programsRetrieve: vi
        .fn()
        .mockReturnValue(retrieved ? of(retrieved) : throwError(() => new Error('404'))),
      programsCreate: vi.fn().mockReturnValue(of({ ...program, id: 42 })),
      programsPartialUpdate: vi.fn().mockReturnValue(of(program)),
    };
    teamsMock = {
      teamsList: vi.fn().mockReturnValue(of({ count: teams.length, results: teams })),
    };
    userSig = signal<CustomUserPublic | null>(ownerUser);

    await TestBed.configureTestingModule({
      imports: [
        ProgramsFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: ProgramsService, useValue: programsMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (k: string) => (k === 'id' ? routeIdParam : null) },
              queryParamMap: { get: (k: string) => (k === 'team' ? routeQueryTeam : null) },
            },
          },
        },
      ],
    })
      .overrideComponent(ProgramsFormComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(ProgramsFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('starts in create mode with empty required form when no id param', () => {
    expect(access(component).isEditMode()).toBe(false);
    expect(access(component).form.invalid).toBe(true);
    expect(programsMock.programsRetrieve).not.toHaveBeenCalled();
  });

  it('loads only manager/owner teams in create mode', () => {
    expect(teamsMock.teamsList).toHaveBeenCalled();
    expect(access(component).availableTeams()).toHaveLength(1);
    expect(access(component).availableTeams()[0].id).toBe(4);
  });

  it('preselects team_id from ?team query param in create mode', async () => {
    await setup(null, null, [ownedTeam], '4');
    expect(access(component).form.getRawValue()).toMatchObject({ team_id: 4 });
  });

  it('blocks submit while form is invalid', () => {
    access(component).submit();
    expect(programsMock.programsCreate).not.toHaveBeenCalled();
  });

  it('on edit mode, fetches the program with includeInactive=true and pre-fills the form', async () => {
    await setup('7');
    expect(programsMock.programsRetrieve).toHaveBeenCalledWith(7, true);
    expect(access(component).isEditMode()).toBe(true);
    expect(access(component).form.getRawValue()).toMatchObject({
      name: 'Cycle aérobie',
      team_id: 4,
      frequency_per_week: 3,
      description: 'Existant',
    });
  });

  it('on edit mode, team_id control is disabled', async () => {
    await setup('7');
    expect(access(component).form.controls.team_id.disabled).toBe(true);
  });

  it('on create success, navigates to /programs/:id with the new id', () => {
    access(component).form.patchValue({ name: 'New', team_id: 4 });
    access(component).submit();
    expect(programsMock.programsCreate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/programs', 42]);
  });

  it('on edit success, calls partialUpdate with includeInactive=undefined and routes to /programs/:id', async () => {
    await setup('7');
    access(component).form.patchValue({ name: 'Renamed' });
    access(component).submit();
    expect(programsMock.programsPartialUpdate).toHaveBeenCalledTimes(1);
    expect(programsMock.programsPartialUpdate.mock.calls[0][0]).toBe(7);
    expect(programsMock.programsPartialUpdate.mock.calls[0][1]).toBeUndefined();
    expect(router.navigate).toHaveBeenCalledWith(['/programs', 7]);
  });

  it('maps server field errors into fieldErrors signal', () => {
    programsMock.programsCreate.mockReturnValueOnce(
      throwError(() => ({
        error: { code: 'validation_error', fields: { name: ['required'] } },
      })),
    );
    access(component).form.patchValue({ name: 'X', team_id: 4 });
    access(component).submit();
    expect(access(component).fieldErrors()).not.toBeNull();
    expect(access(component).fieldErrors()?.['name']).toEqual(['required']);
  });
});
