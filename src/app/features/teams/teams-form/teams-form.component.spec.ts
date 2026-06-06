import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LevelsService } from '../../../api/api/levels.service';
import { SportsService } from '../../../api/api/sports.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { JoinRequestPolicyEnum } from '../../../api/model/join-request-policy-enum';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Level } from '../../../api/model/level';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { AuthService } from '../../../core/auth/auth.service';
import { TeamsFormComponent } from './teams-form.component';

const ownerUser = { id: 17, username: 'testfrontend' } as CustomUserPublic;
const managerUser = {
  id: 99,
  username: 'mgr',
  first_name: 'M',
  last_name: 'Gr',
} as CustomUserPublic;

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const level: Level = {
  id: 3,
  code: 'regional',
  name: 'Régional',
  description: 'Niveau régional',
  order: 2,
  is_active: true,
};

const team: Team = {
  id: 5,
  name: 'Team P9',
  sport,
  sport_id: 1,
  level,
  owner: ownerUser,
  managers: [managerUser],
  language: LanguageEnum.Fr,
  is_active: true,
  is_public: false,
  attendance_statuses: [],
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

interface ProtectedFields {
  team(): Team | null;
  teamId(): number | null;
  isEditMode(): boolean;
  isAutoPolicy(): boolean;
  saving(): boolean;
  errorMessage(): string | null;
  fieldErrors(): { [k: string]: string[] } | null;
  quotaExceeded(): { used: number; max: number } | null;
  availableSports(): Sport[];
  availableLevels(): Level[];
  availableManagers(): CustomUserPublic[];
  activeValue(): boolean;
  patchActive: (id: number, value: boolean) => unknown;
  logoValue(): string;
  removeLogo(): void;
  onLogoSelected(e: globalThis.Event): Promise<void>;
  form: {
    getRawValue(): Record<string, unknown>;
    patchValue(v: Record<string, unknown>): void;
    setValue?(v: Record<string, unknown>): void;
    invalid: boolean;
    valid: boolean;
  };
  submit(): void;
  cancel(): void;
}

describe('TeamsFormComponent', () => {
  let fixture: ComponentFixture<TeamsFormComponent>;
  let component: TeamsFormComponent;
  let teamsMock: {
    teamsRetrieve: ReturnType<typeof vi.fn>;
    teamsCreate: ReturnType<typeof vi.fn>;
    teamsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let sportsMock: { sportsList: ReturnType<typeof vi.fn> };
  let levelsMock: { levelsList: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;
  let router: Router;

  const access = (c: TeamsFormComponent) => c as unknown as ProtectedFields;

  async function setup(idParam: string | null = null, currentUser = ownerUser, retrieved: Team | null = team) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    teamsMock = {
      teamsRetrieve: vi
        .fn()
        .mockReturnValue(retrieved ? of(retrieved) : throwError(() => new Error('404'))),
      teamsCreate: vi.fn().mockReturnValue(of({ ...team, id: 42 })),
      teamsPartialUpdate: vi.fn().mockReturnValue(of(team)),
    };
    sportsMock = {
      sportsList: vi.fn().mockReturnValue(of({ count: 1, results: [sport] })),
    };
    levelsMock = {
      levelsList: vi.fn().mockReturnValue(of({ count: 1, results: [level] })),
    };
    userSig = signal<CustomUserPublic | null>(currentUser);

    await TestBed.configureTestingModule({
      imports: [
        TeamsFormComponent,
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
        { provide: TeamsService, useValue: teamsMock },
        { provide: SportsService, useValue: sportsMock },
        { provide: LevelsService, useValue: levelsMock },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly(), refreshMe: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeIdParam } } },
        },
      ],
    })
      .overrideComponent(TeamsFormComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(TeamsFormComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('starts in create mode with empty form when no id route param', () => {
    expect(access(component).isEditMode()).toBe(false);
    expect(access(component).form.getRawValue()).toMatchObject({
      name: '',
      sport_id: null,
      level_id: null,
      language: 'fr',
      is_public: false,
    });
    expect(access(component).availableLevels()).toEqual([level]);
    expect(teamsMock.teamsRetrieve).not.toHaveBeenCalled();
  });

  it('blocks submit while form is invalid', () => {
    expect(access(component).form.invalid).toBe(true);
    access(component).submit();
    expect(teamsMock.teamsCreate).not.toHaveBeenCalled();
  });

  it('on edit mode, pre-fills the form from the team and exposes managers', async () => {
    await setup('5');
    expect(access(component).isEditMode()).toBe(true);
    expect(access(component).team()?.id).toBe(5);
    expect(access(component).availableManagers()).toHaveLength(1);
    expect(access(component).form.getRawValue()).toMatchObject({
      name: 'Team P9',
      sport_id: 1,
      level_id: 3,
      language: 'fr',
      is_public: false,
      managers_ids: [99],
    });
  });

  it('seeds level_id to null when the loaded team has no level', async () => {
    await setup('5', ownerUser, { ...team, level: undefined });
    expect(access(component).form.getRawValue()).toMatchObject({ level_id: null });
  });

  it('on create success, navigates to /teams/:id/edit with the new id', async () => {
    access(component).form.patchValue({ name: 'New', sport_id: 1, level_id: 3, language: 'fr' });
    access(component).submit();
    expect(teamsMock.teamsCreate).toHaveBeenCalledTimes(1);
    expect(teamsMock.teamsCreate).toHaveBeenCalledWith(expect.objectContaining({ level_id: 3 }));
    expect(router.navigate).toHaveBeenCalledWith(['/teams', 42, 'edit']);
  });

  it('on edit success, navigates to /teams/:id detail page', async () => {
    await setup('5');
    access(component).form.patchValue({ name: 'Renamed' });
    access(component).submit();
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledTimes(1);
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ level_id: 3 }),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/teams', 5]);
  });

  it('on edit, sends level_id: null to clear the level when cleared in the form', async () => {
    await setup('5');
    access(component).form.patchValue({ level_id: null });
    access(component).submit();
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ level_id: null }),
    );
  });

  it('maps server field errors into fieldErrors signal', () => {
    teamsMock.teamsCreate.mockReturnValueOnce(
      throwError(() => ({
        error: { code: 'validation_error', fields: { name: [{ code: 'required', detail: 'required' }] } },
      })),
    );
    access(component).form.patchValue({ name: 'X', sport_id: 1, language: 'fr' });
    access(component).submit();
    expect(access(component).fieldErrors()).not.toBeNull();
  });

  it('seeds activeValue from the loaded team is_active', async () => {
    await setup('5', ownerUser, { ...team, is_active: true });
    expect(access(component).activeValue()).toBe(true);

    await setup('5', ownerUser, { ...team, is_active: false });
    expect(access(component).activeValue()).toBe(false);
  });

  it('patchActive calls teamsPartialUpdate with the is_active body as 2nd arg', async () => {
    await setup('5');
    access(component).patchActive(5, false);
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(5, { is_active: false });
  });

  it('pre-fills auto_accept_policy + notify_managers from team policy fields', async () => {
    await setup('5', ownerUser, {
      ...team,
      join_request_policy: JoinRequestPolicyEnum.Auto,
      notify_managers_on_join_request: false,
    });
    expect(access(component).form.getRawValue()).toMatchObject({
      auto_accept_policy: true,
      notify_managers_on_join_request: false,
    });
    expect(access(component).isAutoPolicy()).toBe(true);
  });

  it('submit converts auto_accept_policy boolean back to JoinRequestPolicyEnum on PATCH', async () => {
    await setup('5');
    access(component).form.patchValue({
      auto_accept_policy: true,
      notify_managers_on_join_request: false,
    });
    access(component).submit();
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        join_request_policy: JoinRequestPolicyEnum.Auto,
        notify_managers_on_join_request: false,
      }),
    );
  });

  it('pre-fills the note-notify toggles from the team', async () => {
    await setup('5', ownerUser, {
      ...team,
      notify_coaches_on_note: false,
      notify_athlete_on_visible_note: false,
    });
    expect(access(component).form.getRawValue()).toMatchObject({
      notify_coaches_on_note: false,
      notify_athlete_on_visible_note: false,
    });
  });

  it('update payload includes the note-notify toggles', async () => {
    await setup('5');
    access(component).form.patchValue({
      notify_coaches_on_note: false,
      notify_athlete_on_visible_note: true,
    });
    access(component).submit();
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        notify_coaches_on_note: false,
        notify_athlete_on_visible_note: true,
      }),
    );
  });

  it('on create 403 team_quota_exceeded → quotaExceeded set, no navigation, refreshMe called', async () => {
    teamsMock.teamsCreate.mockReturnValueOnce(
      throwError(() => ({
        status: 403,
        error: {
          code: 'team_quota_exceeded',
          detail: 'You have reached your team quota.',
          used: 3,
          max: 3,
          can_create: false,
        },
      })),
    );
    const authService = TestBed.inject(AuthService) as unknown as { refreshMe: ReturnType<typeof vi.fn> };
    access(component).form.patchValue({ name: 'X', sport_id: 1, language: 'fr' });
    access(component).submit();
    expect(access(component).quotaExceeded()).toEqual({ used: 3, max: 3 });
    expect(access(component).errorMessage()).toBe('You have reached your team quota.');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(authService.refreshMe).toHaveBeenCalled();
  });

  it('cancel() navigates back to /teams in create mode', () => {
    access(component).cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/teams']);
  });

  it('cancel() navigates back to /teams/:id in edit mode', async () => {
    await setup('5');
    access(component).cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/teams', 5]);
  });

  it('seeds logo + roti_enabled from the loaded team on edit', async () => {
    await setup('5', ownerUser, { ...team, logo: 'data:image/png;base64,AAA', roti_enabled: true });
    expect(access(component).logoValue()).toBe('data:image/png;base64,AAA');
    expect(access(component).form.getRawValue()).toMatchObject({
      logo: 'data:image/png;base64,AAA',
      roti_enabled: true,
    });
  });

  it('removeLogo() clears the logo control + signal', async () => {
    await setup('5', ownerUser, { ...team, logo: 'data:image/png;base64,AAA' });
    access(component).removeLogo();
    expect(access(component).logoValue()).toBe('');
    expect(access(component).form.getRawValue()).toMatchObject({ logo: '' });
  });

  it('create payload includes the logo data-URL', () => {
    access(component).form.patchValue({
      name: 'New',
      sport_id: 1,
      language: 'fr',
      logo: 'data:image/png;base64,LOGO',
    });
    access(component).submit();
    expect(teamsMock.teamsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ logo: 'data:image/png;base64,LOGO' }),
    );
  });

  it('update payload includes logo + roti_enabled', async () => {
    await setup('5');
    access(component).form.patchValue({ logo: 'data:image/png;base64,X', roti_enabled: true });
    access(component).submit();
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ logo: 'data:image/png;base64,X', roti_enabled: true }),
    );
  });

  it('seeds weekly_recap_enabled from the loaded team on edit', async () => {
    await setup('5', ownerUser, { ...team, weekly_recap_enabled: true });
    expect(access(component).form.getRawValue()).toMatchObject({ weekly_recap_enabled: true });
  });

  it('update payload includes weekly_recap_enabled', async () => {
    await setup('5');
    access(component).form.patchValue({ weekly_recap_enabled: true });
    access(component).submit();
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ weekly_recap_enabled: true }),
    );
  });

  it('defaults visibility controls to "always" and timezone to Europe/Brussels on create', () => {
    expect(access(component).form.getRawValue()).toMatchObject({
      vis_distance: VisibilityMode.Always,
      vis_goal: VisibilityMode.Always,
      vis_rounds: VisibilityMode.Always,
      timezone: 'Europe/Brussels',
    });
  });

  it('seeds visibility + timezone from the loaded team on edit', async () => {
    await setup('5', ownerUser, {
      ...team,
      timezone: 'Europe/Paris',
      vis_distance: VisibilityMode.After,
      vis_goal: VisibilityMode.Never,
      vis_rounds: VisibilityMode.After,
    });
    expect(access(component).form.getRawValue()).toMatchObject({
      timezone: 'Europe/Paris',
      vis_distance: VisibilityMode.After,
      vis_goal: VisibilityMode.Never,
      vis_rounds: VisibilityMode.After,
    });
  });

  it('create payload includes timezone + vis_* defaults', () => {
    access(component).form.patchValue({
      name: 'New',
      sport_id: 1,
      language: 'fr',
      timezone: 'UTC',
      vis_distance: VisibilityMode.After,
    });
    access(component).submit();
    expect(teamsMock.teamsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'UTC', vis_distance: VisibilityMode.After }),
    );
  });

  it('update payload includes timezone + vis_*', async () => {
    await setup('5');
    access(component).form.patchValue({
      timezone: 'America/New_York',
      vis_rounds: VisibilityMode.Never,
    });
    access(component).submit();
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        timezone: 'America/New_York',
        vis_rounds: VisibilityMode.Never,
      }),
    );
  });
});
