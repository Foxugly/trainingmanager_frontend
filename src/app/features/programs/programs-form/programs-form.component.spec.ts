import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
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
  sports: [{ id: 1, name: 'Sport', slug: 'sport', is_default: true, order: 0 }],
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
  hasLinkedEvents(): boolean;
  saving(): boolean;
  activeValue(): boolean;
  fieldErrors(): { [k: string]: string[] } | null;
  fieldError(name: string): string | null;
  availableTeams(): Team[];
  patchActive: (id: number, value: boolean) => unknown;
  form: {
    getRawValue(): Record<string, unknown>;
    patchValue(v: Record<string, unknown>): void;
    invalid: boolean;
    valid: boolean;
    controls: { team_id: { disabled: boolean } };
  };
  cancel(): void;
  submit(): void;
  confirmDelete(): void;
}

describe('ProgramsFormComponent', () => {
  let fixture: ComponentFixture<ProgramsFormComponent>;
  let component: ProgramsFormComponent;
  let programsMock: {
    programsRetrieve: ReturnType<typeof vi.fn>;
    programsCreate: ReturnType<typeof vi.fn>;
    programsPartialUpdate: ReturnType<typeof vi.fn>;
    programsDestroy: ReturnType<typeof vi.fn>;
  };
  let confirmationService: ConfirmationService;
  let teamsMock: { teamsList: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;
  let routeQueryTeam: string | null;
  let router: Router;
  let messageService: MessageService;

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
      programsDestroy: vi.fn().mockReturnValue(of(null)),
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
    confirmationService = fixture.debugElement.injector.get(ConfirmationService);
    messageService = TestBed.inject(MessageService);
    vi.spyOn(messageService, 'add');
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
    expect(programsMock.programsRetrieve).toHaveBeenCalledWith({ id: 7, includeInactive: true });
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

  it('on edit mode, seeds availableTeams with the program team so the disabled select shows its label', async () => {
    await setup('7');
    // Manager-team list is NOT fetched on edit; the select is seeded from the program.
    expect(teamsMock.teamsList).not.toHaveBeenCalled();
    expect(access(component).availableTeams()).toHaveLength(1);
    expect(access(component).availableTeams()[0].id).toBe(4);
  });

  it('on edit mode, seeds activeValue from the loaded program', async () => {
    await setup('7');
    expect(access(component).activeValue()).toBe(true);
  });

  it('on edit mode with inactive program, activeValue is false', async () => {
    await setup('7', { ...program, is_active: false });
    expect(access(component).activeValue()).toBe(false);
  });

  it('patchActive calls programsPartialUpdate with the is_active body as 3rd arg', async () => {
    await setup('7');
    access(component).patchActive(7, false);
    expect(programsMock.programsPartialUpdate).toHaveBeenCalledWith({
      id: 7,
      patchedProgram: { is_active: false },
    });
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
    expect(programsMock.programsPartialUpdate.mock.calls[0][0].id).toBe(7);
    expect(programsMock.programsPartialUpdate.mock.calls[0][0].includeInactive).toBeUndefined();
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

  it('exposes field errors via fieldError() helper', () => {
    programsMock.programsCreate.mockReturnValueOnce(
      throwError(() => ({ error: { fields: { name: ['required', 'too short'] } } })),
    );
    access(component).form.patchValue({ name: 'X', team_id: 4 });
    access(component).submit();
    expect(access(component).fieldError('name')).toBe('required, too short');
    expect(access(component).fieldError('description')).toBeNull();
  });

  it('toasts a global error (no field errors) instead of inline display', () => {
    programsMock.programsCreate.mockReturnValueOnce(
      throwError(() => ({ error: { detail: 'programs.errors.unknown' } })),
    );
    access(component).form.patchValue({ name: 'X', team_id: 4 });
    access(component).submit();
    expect(access(component).fieldErrors()).toBeNull();
    expect(messageService.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('toasts an error when a program fails to load in edit mode', async () => {
    await setup('7', null);
    expect(messageService.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('cancel() navigates back to /programs in create mode', () => {
    access(component).cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/programs']);
  });

  it('cancel() navigates back to /programs/:id in edit mode', async () => {
    await setup('7');
    access(component).cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/programs', 7]);
  });

  it('hasLinkedEvents is false when the program has no linked sessions', async () => {
    await setup('7', { ...program, events: [] });
    expect(access(component).hasLinkedEvents()).toBe(false);
  });

  it('hasLinkedEvents is true when the program has ≥1 linked session', async () => {
    await setup('7', { ...program, events: [1, 2] });
    expect(access(component).hasLinkedEvents()).toBe(true);
  });

  it('confirmDelete → accept destroys the program and navigates to its team', async () => {
    await setup('7', { ...program, events: [] });
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });
    access(component).confirmDelete();
    expect(programsMock.programsDestroy).toHaveBeenCalledWith({ id: 7 });
    expect(router.navigate).toHaveBeenCalledWith(['/teams', 4]);
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
  });

  it('confirmDelete is a no-op when the program has linked sessions', async () => {
    await setup('7', { ...program, events: [1] });
    const confirmSpy = vi.spyOn(confirmationService, 'confirm');
    access(component).confirmDelete();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(programsMock.programsDestroy).not.toHaveBeenCalled();
  });

  it('confirmDelete → destroy failure toasts an error', async () => {
    await setup('7', { ...program, events: [] });
    programsMock.programsDestroy.mockReturnValueOnce(
      throwError(() => ({ error: { detail: 'programs.errors.unknown' } })),
    );
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });
    access(component).confirmDelete();
    expect(messageService.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
