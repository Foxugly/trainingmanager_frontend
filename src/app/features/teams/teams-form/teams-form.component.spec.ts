import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LevelsService } from '../../../api/api/levels.service';
import { PlacesService } from '../../../api/api/places.service';
import { SportsService } from '../../../api/api/sports.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { Place } from '../../../api/model/place';
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
  // Planning type tab
  slots: { length: number };
  addSlot(): void;
  removeSlot(i: number): void;
  slotHasTimeError(i: number): boolean;
  saveTemplate(): void;
  weekdayOptions(): Array<{ label: string; value: number }>;
  // Lieux (managed places)
  places(): Place[];
  editingPlaceId(): number | null;
  placeName(): string;
  placeAddress(): string;
  placeNameError(): string | null;
  placeDialogVisible(): boolean;
  openCreatePlace(): void;
  openEditPlace(p: Place): void;
  savePlace(): void;
  confirmDeletePlace(p: Place): void;
  templateForm: {
    patchValue(v: Record<string, unknown>): void;
    invalid: boolean;
    controls: { default_place_id: { value: number | null; setValue(v: number | null): void } };
  };
}

describe('TeamsFormComponent', () => {
  let fixture: ComponentFixture<TeamsFormComponent>;
  let component: TeamsFormComponent;
  let teamsMock: {
    teamsRetrieve: ReturnType<typeof vi.fn>;
    teamsCreate: ReturnType<typeof vi.fn>;
    teamsPartialUpdate: ReturnType<typeof vi.fn>;
    teamsTrainingTemplateRetrieve: ReturnType<typeof vi.fn>;
    teamsTrainingTemplateUpdate: ReturnType<typeof vi.fn>;
    teamsPoolsRetrieve: ReturnType<typeof vi.fn>;
  };
  let sportsMock: { sportsList: ReturnType<typeof vi.fn> };
  let levelsMock: { levelsList: ReturnType<typeof vi.fn> };
  let placesMock: {
    placesList: ReturnType<typeof vi.fn>;
    placesCreate: ReturnType<typeof vi.fn>;
    placesPartialUpdate: ReturnType<typeof vi.fn>;
    placesDestroy: ReturnType<typeof vi.fn>;
  };
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
      teamsTrainingTemplateRetrieve: vi
        .fn()
        .mockReturnValue(of({ slots: [], default_pool: '', season_start: null, season_end: null })),
      teamsTrainingTemplateUpdate: vi
        .fn()
        .mockImplementation((_id, tpl) => of(tpl)),
      teamsPoolsRetrieve: vi.fn().mockReturnValue(of({ pools: ['Piscine A', 'Piscine B'] })),
    };
    sportsMock = {
      sportsList: vi.fn().mockReturnValue(of({ count: 1, results: [sport] })),
    };
    levelsMock = {
      levelsList: vi.fn().mockReturnValue(of({ count: 1, results: [level] })),
    };
    placesMock = {
      placesList: vi.fn().mockReturnValue(
        of({
          count: 1,
          results: [{ id: 7, team: 5, name: 'Piscine olympique', address: '1 rue X' } as Place],
        }),
      ),
      placesCreate: vi
        .fn()
        .mockReturnValue(of({ id: 8, team: 5, name: 'Nouveau', address: '' } as Place)),
      placesPartialUpdate: vi
        .fn()
        .mockReturnValue(of({ id: 7, team: 5, name: 'Renommé', address: 'Y' } as Place)),
      placesDestroy: vi.fn().mockReturnValue(of(undefined)),
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
        { provide: PlacesService, useValue: placesMock },
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

  it('seeds rsvp_enabled from the loaded team on edit', async () => {
    await setup('5', ownerUser, { ...team, rsvp_enabled: true });
    expect(access(component).form.getRawValue()).toMatchObject({ rsvp_enabled: true });
  });

  it('update payload includes rsvp_enabled', async () => {
    await setup('5');
    access(component).form.patchValue({ rsvp_enabled: true });
    access(component).submit();
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ rsvp_enabled: true }),
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

  it('pre-fills topic_creation from the loaded team on edit', async () => {
    await setup('5', ownerUser, { ...team, topic_creation: 'members' as never });
    expect(access(component).form.getRawValue()).toMatchObject({ topic_creation: 'members' });
  });

  it('defaults topic_creation to coaches when the team has none', async () => {
    await setup('5', ownerUser, { ...team, topic_creation: undefined });
    expect(access(component).form.getRawValue()).toMatchObject({ topic_creation: 'coaches' });
  });

  it('update payload includes topic_creation', async () => {
    await setup('5');
    access(component).form.patchValue({ topic_creation: 'members' });
    access(component).submit();
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ topic_creation: 'members' }),
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

  // ── Planning type (weekly training template) ──────────────────────────────

  it('loads the team training template + places on edit', async () => {
    await setup('5');
    expect(teamsMock.teamsTrainingTemplateRetrieve).toHaveBeenCalledWith(5);
    expect(placesMock.placesList).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      5,
    );
    expect(access(component).places()).toHaveLength(1);
    expect(access(component).places()[0].name).toBe('Piscine olympique');
  });

  it('addSlot appends and removeSlot removes a slot row', async () => {
    await setup('5');
    expect(access(component).slots.length).toBe(0);
    access(component).addSlot();
    access(component).addSlot();
    expect(access(component).slots.length).toBe(2);
    access(component).removeSlot(0);
    expect(access(component).slots.length).toBe(1);
  });

  it('saveTemplate calls teamsTrainingTemplateUpdate with HH:MM slots + ISO dates', async () => {
    await setup('5');
    access(component).addSlot();
    const start = new Date();
    start.setHours(18, 0, 0, 0);
    const end = new Date();
    end.setHours(19, 30, 0, 0);
    const season = new Date(2026, 8, 1); // 2026-09-01
    (access(component).slots as unknown as { at(i: number): { patchValue(v: unknown): void } })
      .at(0)
      .patchValue({ weekday: 2, hour_start: start, hour_end: end });
    access(component).templateForm.patchValue({
      default_pool: 'Piscine X',
      default_place_id: 7,
      season_start: season,
      season_end: null,
    });
    access(component).saveTemplate();
    expect(teamsMock.teamsTrainingTemplateUpdate).toHaveBeenCalledTimes(1);
    const [id, payload] = teamsMock.teamsTrainingTemplateUpdate.mock.calls[0];
    expect(id).toBe(5);
    expect(payload.default_pool).toBe('Piscine X');
    expect(payload.season_start).toBe('2026-09-01');
    expect(payload.season_end).toBe(null);
    expect(payload.slots).toEqual([
      { weekday: 2, hour_start: '18:00', hour_end: '19:30' },
    ]);
    // The default place is persisted via a team PATCH after the template update.
    expect(teamsMock.teamsPartialUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ default_place_id: 7 }),
    );
  });

  // ── Lieux (managed places) CRUD ───────────────────────────────────────────

  it('pre-selects the team default_place on edit', async () => {
    await setup('5', ownerUser, {
      ...team,
      default_place: { id: 7, name: 'Piscine olympique', address: '1 rue X' },
    });
    expect(access(component).templateForm.controls.default_place_id.value).toBe(7);
  });

  it('openCreatePlace resets the dialog to create mode', async () => {
    await setup('5');
    access(component).openCreatePlace();
    expect(access(component).editingPlaceId()).toBeNull();
    expect(access(component).placeName()).toBe('');
    expect(access(component).placeDialogVisible()).toBe(true);
  });

  it('savePlace creates a new place and appends it to the list', async () => {
    await setup('5');
    access(component).openCreatePlace();
    (component as unknown as { placeName: { set(v: string): void } }).placeName.set('Nouveau');
    access(component).savePlace();
    expect(placesMock.placesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ team: 5, name: 'Nouveau' }),
    );
    expect(access(component).places().some((p) => p.id === 8)).toBe(true);
  });

  it('savePlace blocks and flags an error when the name is empty', async () => {
    await setup('5');
    access(component).openCreatePlace();
    access(component).savePlace();
    expect(placesMock.placesCreate).not.toHaveBeenCalled();
    expect(access(component).placeNameError()).not.toBeNull();
  });

  it('openEditPlace + savePlace updates an existing place', async () => {
    await setup('5');
    access(component).openEditPlace({ id: 7, team: 5, name: 'Piscine olympique', address: '1 rue X' } as Place);
    expect(access(component).editingPlaceId()).toBe(7);
    access(component).savePlace();
    expect(placesMock.placesPartialUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ name: 'Piscine olympique' }),
    );
  });

  it('surfaces a duplicate-name error from the backend', async () => {
    await setup('5');
    placesMock.placesCreate.mockReturnValueOnce(
      throwError(() => ({ status: 400, error: { code: 'place_already_exists' } })),
    );
    access(component).openCreatePlace();
    (component as unknown as { placeName: { set(v: string): void } }).placeName.set('Dup');
    access(component).savePlace();
    expect(access(component).placeNameError()).not.toBeNull();
  });

  it('confirmDeletePlace → deletePlace removes the place from the list', async () => {
    await setup('5');
    // ConfirmationService is component-scoped (provided on the component), so
    // resolve it from the component's own injector, not the module root.
    const confirm = fixture.debugElement.injector.get(ConfirmationService);
    const confirmSpy = vi.spyOn(confirm, 'confirm').mockReturnValue(confirm);
    access(component).confirmDeletePlace({
      id: 7,
      team: 5,
      name: 'Piscine olympique',
      address: '',
    } as Place);
    // Invoke the captured accept callback to simulate the user confirming.
    const opts = confirmSpy.mock.calls[0][0];
    opts.accept?.();
    expect(placesMock.placesDestroy).toHaveBeenCalledWith(7);
    expect(access(component).places().some((p) => p.id === 7)).toBe(false);
  });

  it('slotHasTimeError flags a slot whose end is before its start', async () => {
    await setup('5');
    access(component).addSlot();
    const start = new Date();
    start.setHours(19, 0, 0, 0);
    const end = new Date();
    end.setHours(18, 0, 0, 0);
    (access(component).slots as unknown as { at(i: number): { patchValue(v: unknown): void } })
      .at(0)
      .patchValue({ weekday: 0, hour_start: start, hour_end: end });
    expect(access(component).slotHasTimeError(0)).toBe(true);
    expect(access(component).templateForm.invalid).toBe(true);
  });
});
