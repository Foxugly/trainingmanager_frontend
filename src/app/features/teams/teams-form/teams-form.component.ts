import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { handleInvalidSubmit } from '../../../shared/form-validation';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { InputText } from 'primeng/inputtext';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { AttendanceStatusesService } from '../../../api/api/attendance-statuses.service';
import { LevelsService } from '../../../api/api/levels.service';
import { EquipmentService } from '../../../api/api/equipment.service';
import { SportsService } from '../../../api/api/sports.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Place } from '../../../api/model/place';
import { Equipment } from '../../../api/model/equipment';
import { AttendanceStatus } from '../../../api/model/attendance-status';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { JoinRequestPolicyEnum } from '../../../api/model/join-request-policy-enum';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Level } from '../../../api/model/level';
import { PatchedTeamRequest } from '../../../api/model/patched-team-request';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { SportTrainingTypeWriteRequestTrainingTypeEnum } from '../../../api/model/sport-training-type-write-request';
import { TopicCreationEnum } from '../../../api/model/topic-creation-enum';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { AuthService } from '../../../core/auth/auth.service';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../../../core/i18n/available-languages';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { ToastService } from '../../../core/notifications/toast.service';
import { openContactEmail } from '../../../shared/contact';
import { buildVisibilityOptions } from '../../../shared/forms/visibility-options';
import {
  LOGO_MAX_CHARS,
  LOGO_MAX_DIM,
  resizeImageToDataUrl,
} from '../../../shared/media/resize-image';
import { timezoneOptions } from '../../../shared/datetime/timezones';
import {
  ActiveToggleComponent,
  type ActiveToggleLabels,
} from '../../../shared/ui/active-toggle/active-toggle.component';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge/status-badge.component';
import { AriaDescribesDirective } from '../../../shared/a11y/aria-describes.directive';
import { TeamManagersComponent } from '../team-managers/team-managers.component';
import { TeamPlacePoolComponent } from '../team-place-pool/team-place-pool.component';
import { TeamSlotsEditorComponent } from '../team-slots-editor/team-slots-editor.component';

@Component({
  selector: 'app-teams-form',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    InputText,
    Select,
    MultiSelect,
    Checkbox,
    ToggleSwitch,
    Button,
    ConfirmDialog,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    PageHeaderComponent,
    StatusBadgeComponent,
    ActiveToggleComponent,
    MetaFieldComponent,
    FormFooterComponent,
    TeamSlotsEditorComponent,
    TeamManagersComponent,
    TeamPlacePoolComponent,
    AriaDescribesDirective,
    TranslocoPipe,
  ],
  templateUrl: './teams-form.component.html',
  styleUrl: './teams-form.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly teamsService = inject(TeamsService);
  private readonly sportsService = inject(SportsService);
  private readonly levelsService = inject(LevelsService);
  private readonly equipmentService = inject(EquipmentService);
  private readonly statusesService = inject(AttendanceStatusesService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly teamId = signal<number | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly availableSports = signal<Sport[]>([]);
  protected readonly availableLevels = signal<Level[]>([]);
  protected readonly availableManagers = signal<CustomUserPublic[]>([]);
  protected readonly availableStatuses = signal<AttendanceStatus[]>([]);
  protected readonly statusesTarget = signal<AttendanceStatus[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly quotaExceeded = signal<{ used: number; max: number } | null>(null);
  protected readonly activeValue = signal(true);

  protected readonly availableLanguages = AVAILABLE_LANGUAGES;

  /** Visibility-mode select options, re-translated on language change. */
  protected readonly visibilityOptions = computed(() => {
    // Touch the active lang so the labels recompute when it changes.
    this.transloco.getActiveLang();
    return buildVisibilityOptions(this.transloco);
  });

  /** IANA timezones as {label,value} for the filterable select, precomputed once. */
  protected readonly timezoneOptions: { label: string; value: string }[] = timezoneOptions();

  /** Topic-creation policy select options, re-translated on language change. */
  protected readonly topicCreationOptions = computed(() => {
    // Touch the active lang so labels recompute when it changes.
    this.transloco.getActiveLang();
    return [
      {
        label: this.transloco.translate('teams.topic_creation.owner'),
        value: TopicCreationEnum.Owner,
      },
      {
        label: this.transloco.translate('teams.topic_creation.coaches'),
        value: TopicCreationEnum.Coaches,
      },
      {
        label: this.transloco.translate('teams.topic_creation.members'),
        value: TopicCreationEnum.Members,
      },
    ];
  });

  protected readonly isEditMode = computed(() => this.teamId() !== null);

  // ── Lieux (shared sport pool) — managed by app-team-place-pool ──────────
  /** The team's sport ids, driving the place-pool union fetch in the child. */
  protected readonly teamSportIds = signal<number[]>([]);
  /** The venue pool emitted by the place-pool child, kept here so the slots
   *  editor can resolve the linked Place objects (selectedPlaces). */
  protected readonly places = signal<Place[]>([]);
  /** Currently-linked place ids, mirrored from the `place_ids` form control. */
  protected readonly placeIdsValue = signal<number[]>([]);
  /** The subset of the pool currently linked to the team (fed to the slots
   *  editor's per-slot place select). */
  protected readonly selectedPlaces = computed<Place[]>(() => {
    const ids = new Set(this.placeIdsValue());
    return this.places().filter((p) => ids.has(p.id));
  });

  // ── Équipements (global catalog, enabled per team) ──────────────────────
  /**
   * The full equipment (Matériel) catalog for the team's sport. The owner
   * enables a subset by checking items; the selected ids are persisted via
   * the `equipment_ids` write-only field on the team PATCH.
   */
  protected readonly equipmentCatalog = signal<Equipment[]>([]);
  protected readonly equipmentLoading = signal(false);

  protected readonly patchActive = (id: number, value: boolean) =>
    this.teamsService.teamsPartialUpdate({ id, patchedTeamRequest: { is_active: value } });

  protected readonly activeLabels = computed<ActiveToggleLabels>(() => ({
    active: this.transloco.translate('common.active'),
    inactive: this.transloco.translate('common.inactive'),
    confirm: this.transloco.translate('common.confirm_deactivate'),
    errorSummary: this.transloco.translate('common.error'),
    errorDetail: this.transloco.translate('common.update_failed'),
  }));

  protected readonly logoValue = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    // Multi-sport: the team's set of sports + which one is the default. The
    // default must be one of the selected sports (kept in sync in ngOnInit).
    sport_ids: this.fb.nonNullable.control<number[]>([], [Validators.required]),
    default_sport_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    level_id: this.fb.nonNullable.control<number | null>(null),
    language: this.fb.nonNullable.control<LanguageCode>('fr', [Validators.required]),
    is_public: [false],
    logo: this.fb.nonNullable.control<string>(''),
    roti_enabled: [false],
    rsvp_enabled: [false],
    weekly_recap_enabled: [false],
    managers_ids: this.fb.nonNullable.control<number[]>([]),
    equipment_ids: this.fb.nonNullable.control<number[]>([]),
    place_ids: this.fb.nonNullable.control<number[]>([]),
    default_place_id: this.fb.nonNullable.control<number | null>(null),
    auto_accept_policy: [false],
    topic_creation: this.fb.nonNullable.control<TopicCreationEnum>(TopicCreationEnum.Coaches),
    notify_managers_on_join_request: [true],
    notify_coaches_on_note: [true],
    notify_athlete_on_visible_note: [true],
    timezone: this.fb.nonNullable.control<string>('Europe/Brussels'),
    vis_distance: this.fb.nonNullable.control<VisibilityMode>(VisibilityMode.Always),
    vis_goal: this.fb.nonNullable.control<VisibilityMode>(VisibilityMode.Always),
    vis_rounds: this.fb.nonNullable.control<VisibilityMode>(VisibilityMode.Always),
    public_sharing_enabled: [false],
    public_show_distance: [true],
    public_show_goal: [false],
    public_show_rounds: [true],
  });

  /** Selected sport ids, mirrored from the `sport_ids` control. Drives the
   *  default-sport picker options (default must be one of the selected sports). */
  private readonly sportIdsValue = toSignal(this.form.controls.sport_ids.valueChanges, {
    initialValue: this.form.controls.sport_ids.value,
  });
  /** The sports currently selected — options for the default-sport picker. */
  protected readonly selectedSports = computed(() => {
    const ids = new Set(this.sportIdsValue() ?? []);
    return this.availableSports().filter((s) => ids.has(s.id));
  });

  // ── Per-sport training-type override ────────────────────────────────────
  /** Map of sport id → its training-type override (null = inherit the sport's
   *  default). Seeded from the loaded team's sports[].training_type in edit
   *  mode; written to the team payload as sport_training_types on submit. */
  protected readonly sportTrainingTypes = signal<Map<number, SportTrainingTypeWriteRequestTrainingTypeEnum | null>>(new Map());

  /** Per-sport training-type select options, re-translated on language change.
   *  The first option (inherit) maps to null. */
  protected readonly sportTrainingTypeOptions = computed(() => {
    this.transloco.getActiveLang();
    return [
      {
        label: this.transloco.translate('teams.form.training_type_inherit'),
        value: null as SportTrainingTypeWriteRequestTrainingTypeEnum | null,
      },
      {
        label: this.transloco.translate('events.training.type_structured'),
        value: SportTrainingTypeWriteRequestTrainingTypeEnum.Structured as SportTrainingTypeWriteRequestTrainingTypeEnum | null,
      },
      {
        label: this.transloco.translate('events.training.type_freeform'),
        value: SportTrainingTypeWriteRequestTrainingTypeEnum.Freeform as SportTrainingTypeWriteRequestTrainingTypeEnum | null,
      },
    ];
  });

  /** Current override for a sport (null = inherit), read by the template select. */
  protected sportTrainingType(sportId: number): SportTrainingTypeWriteRequestTrainingTypeEnum | null {
    return this.sportTrainingTypes().get(sportId) ?? null;
  }

  /** Set (or clear, when value is null) a sport's training-type override. */
  protected setSportTrainingType(sportId: number, value: SportTrainingTypeWriteRequestTrainingTypeEnum | null): void {
    this.sportTrainingTypes.update((cur) => {
      const next = new Map(cur);
      next.set(sportId, value);
      return next;
    });
  }

  /** Current default sport id, mirrored from the form control — pre-fills the
   *  default sport on freshly-added training slots. */
  protected readonly defaultSportIdValue = toSignal(
    this.form.controls.default_sport_id.valueChanges,
    { initialValue: this.form.controls.default_sport_id.value },
  );

  private readonly autoAcceptValue = toSignal(this.form.controls.auto_accept_policy.valueChanges, {
    initialValue: this.form.controls.auto_accept_policy.value,
  });
  protected readonly isAutoPolicy = computed(() => this.autoAcceptValue() === true);

  private readonly publicSharingValue = toSignal(
    this.form.controls.public_sharing_enabled.valueChanges,
    { initialValue: this.form.controls.public_sharing_enabled.value },
  );
  protected readonly isPublicSharingEnabled = computed(() => this.publicSharingValue() === true);

  ngOnInit(): void {
    this.sportsService
      .sportsList(undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.availableSports.set(res.results ?? []),
        error: () => this.notifyLoadError(),
      });

    // Keep the default sport valid: when the selected set changes, drop a
    // default that's no longer selected (falling back to the first), and pick
    // a default automatically when the team has exactly one sport.
    this.form.controls.sport_ids.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ids) => {
        const current = this.form.controls.default_sport_id.value;
        if (current == null || !ids.includes(current)) {
          this.form.controls.default_sport_id.setValue(ids[0] ?? null);
        }
      });

    this.levelsService
      .levelsList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.availableLevels.set(res.results ?? []),
        error: () => this.notifyLoadError(),
      });

    this.statusesService
      .attendanceStatusesList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const list = (res.results ?? []).filter((s) => s.is_active);
          this.availableStatuses.set(list);
          this.partitionStatuses(list, this.team()?.attendance_statuses ?? null);
        },
        error: () => this.notifyLoadError(),
      });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        this.errorMessage.set('teams.errors.unknown');
        return;
      }
      this.teamId.set(id);
      this.loading.set(true);
      this.teamsService
        .teamsRetrieve({ id })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (t) => {
            this.team.set(t);
            this.activeValue.set(t.is_active ?? true);
            this.logoValue.set(t.logo ?? '');
            this.availableManagers.set(t.managers ?? []);
            this.partitionStatuses(this.availableStatuses(), t.attendance_statuses ?? null);
            // Multi-sport: the team's set of sports + its default.
            const sportIds = (t.sports ?? []).map((s) => s.id);
            const defaultSportId =
              (t.sports ?? []).find((s) => s.is_default)?.id ?? t.sport?.id ?? null;
            // Equipment stays mono-sport (default sport's catalog); the venue
            // pool spans every sport the team practises (union) — loaded by the
            // place-pool child from teamSportIds.
            if (defaultSportId != null) {
              this.loadEquipmentCatalog(defaultSportId);
            } else {
              this.equipmentCatalog.set([]);
            }
            this.teamSportIds.set(sportIds);
            // Seed the per-sport training-type overrides from the read model.
            const overrides = new Map<number, SportTrainingTypeWriteRequestTrainingTypeEnum | null>();
            for (const s of t.sports ?? []) {
              overrides.set(
                s.id,
                (s.training_type as SportTrainingTypeWriteRequestTrainingTypeEnum | null) ?? null,
              );
            }
            this.sportTrainingTypes.set(overrides);
            this.form.reset({
              name: t.name,
              sport_ids: sportIds,
              default_sport_id: defaultSportId,
              level_id: t.level?.id ?? null,
              language: (t.language as LanguageCode) ?? 'fr',
              is_public: t.is_public ?? false,
              logo: t.logo ?? '',
              roti_enabled: t.roti_enabled ?? false,
              rsvp_enabled: t.rsvp_enabled ?? false,
              weekly_recap_enabled: t.weekly_recap_enabled ?? false,
              managers_ids: (t.managers ?? []).map((m) => m.id),
              equipment_ids: (t.equipment ?? []).map((e) => e.id),
              place_ids: (t.places ?? []).map((p) => p.id),
              default_place_id: t.default_place?.id ?? null,
              auto_accept_policy: t.join_request_policy === JoinRequestPolicyEnum.Auto,
              topic_creation: t.topic_creation ?? TopicCreationEnum.Coaches,
              notify_managers_on_join_request: t.notify_managers_on_join_request ?? true,
              notify_coaches_on_note: t.notify_coaches_on_note ?? true,
              notify_athlete_on_visible_note: t.notify_athlete_on_visible_note ?? true,
              timezone: t.timezone || 'Europe/Brussels',
              vis_distance: t.vis_distance ?? VisibilityMode.Always,
              vis_goal: t.vis_goal ?? VisibilityMode.Always,
              vis_rounds: t.vis_rounds ?? VisibilityMode.Always,
              public_sharing_enabled: t.public_sharing_enabled ?? false,
              public_show_distance: t.public_show_distance ?? true,
              public_show_goal: t.public_show_goal ?? false,
              public_show_rounds: t.public_show_rounds ?? true,
            });
            this.placeIdsValue.set((t.places ?? []).map((p) => p.id));
            this.loading.set(false);
          },
          error: () => {
            this.errorMessage.set('teams.errors.unknown');
            this.loading.set(false);
          },
        });
    }
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  /** Selected manager ids, mirrored from the `managers_ids` control — passed to
   *  the app-team-managers editor, which emits changes back via onManagerIdsChange. */
  protected readonly selectedManagersValue = toSignal(
    this.form.controls.managers_ids.valueChanges,
    { initialValue: this.form.controls.managers_ids.value },
  );

  /** app-team-managers emitted a new id list — write it back to the form control. */
  protected onManagerIdsChange(ids: number[]): void {
    this.form.controls.managers_ids.setValue(ids);
    this.form.controls.managers_ids.markAsDirty();
  }

  /** Currently-chosen default place id, mirrored from the form control. */
  protected readonly defaultPlaceIdValue = toSignal(
    this.form.controls.default_place_id.valueChanges,
    { initialValue: this.form.controls.default_place_id.value },
  );

  /** app-team-place-pool emitted a new linked set → write it to the control. */
  protected onPlaceIdsChange(ids: number[]): void {
    this.form.controls.place_ids.setValue(ids);
    this.form.controls.place_ids.markAsDirty();
    this.placeIdsValue.set(ids);
  }

  /** app-team-place-pool emitted a new default place → write it to the control. */
  protected onDefaultPlaceIdChange(id: number | null): void {
    this.form.controls.default_place_id.setValue(id);
    this.form.controls.default_place_id.markAsDirty();
  }

  /** app-team-place-pool fetched/updated the venue pool → mirror it so the slots
   *  editor can resolve linked Place objects (selectedPlaces). */
  protected onPoolChange(pool: Place[]): void {
    this.places.set(pool);
  }

  /** Open the user's mail client to request a team-quota increase. Uses the
   *  shared anti-spam contact util (no plain email in the DOM) + a localized
   *  subject. */
  protected requestQuotaIncrease(): void {
    openContactEmail(this.transloco.translate('teams.quota.email_subject'));
  }

  /** Read + downscale the chosen image to a small data-URL, set the logo control. */
  protected async onLogoSelected(event: globalThis.Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, LOGO_MAX_DIM, LOGO_MAX_CHARS);
      if (dataUrl.length > LOGO_MAX_CHARS) {
        this.notifyLogoTooLarge();
      } else {
        this.applyLogo(dataUrl);
      }
    } catch {
      this.notifyLogoTooLarge();
    } finally {
      // Reset so re-selecting the same file fires change again.
      input.value = '';
    }
  }

  protected removeLogo(): void {
    this.applyLogo('');
  }

  private applyLogo(dataUrl: string): void {
    this.logoValue.set(dataUrl);
    this.form.controls.logo.setValue(dataUrl);
    this.form.controls.logo.markAsDirty();
  }

  private notifyLogoTooLarge(): void {
    this.toast.warn('teams.form.logo_too_large');
  }

  protected cancel(): void {
    const id = this.teamId();
    this.router.navigate(id ? ['/teams', id] : ['/teams']);
  }

  /** CanDeactivate hook (unsavedChangesGuard): warn before leaving with edits. */
  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  protected submit(): void {
    if (handleInvalidSubmit(this.form, this.messageService, this.transloco)) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.quotaExceeded.set(null);

    const value = this.form.getRawValue();
    const id = this.teamId();

    // Per-sport training-type overrides, scoped to the sports currently
    // selected (drop entries for sports that were removed).
    const selectedSportIds = new Set(value.sport_ids);
    const sportTrainingTypes = [...this.sportTrainingTypes()]
      .filter(([sportId]) => selectedSportIds.has(sportId))
      .map(([sport_id, training_type]) => ({ sport_id, training_type }));

    if (id === null) {
      const createPayload = {
        name: value.name,
        sport_ids: value.sport_ids,
        default_sport_id: value.default_sport_id ?? undefined,
        sport_training_types: sportTrainingTypes,
        level_id: value.level_id,
        language: value.language as LanguageEnum,
        is_public: value.is_public,
        logo: value.logo,
        timezone: value.timezone,
        vis_distance: value.vis_distance,
        vis_goal: value.vis_goal,
        vis_rounds: value.vis_rounds,
      };
      this.teamsService
        .teamsCreate({ teamRequest: createPayload })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.notifySaved('teams.form.saved_create');
            this.authService.refreshMe();
            this.saving.set(false);
            this.form.markAsPristine();
            this.router.navigate(['/teams', created.id, 'edit']);
          },
          error: (err: HttpErrorResponse) => {
            this.applyServerError(err);
            this.saving.set(false);
          },
        });
      return;
    }

    // Ensure the default place (if any) is part of the linked set for
    // consistency; the server auto-adds it too, but we keep the payload honest.
    const defaultPlaceId = value.default_place_id ?? null;
    const placeIds =
      defaultPlaceId != null && !value.place_ids.includes(defaultPlaceId)
        ? [...value.place_ids, defaultPlaceId]
        : value.place_ids;

    const updatePayload: PatchedTeamRequest = {
      name: value.name,
      sport_ids: value.sport_ids,
      default_sport_id: value.default_sport_id ?? undefined,
      sport_training_types: sportTrainingTypes,
      level_id: value.level_id ?? null,
      language: value.language as LanguageEnum,
      is_public: value.is_public,
      logo: value.logo,
      roti_enabled: value.roti_enabled,
      rsvp_enabled: value.rsvp_enabled,
      weekly_recap_enabled: value.weekly_recap_enabled,
      managers_ids: value.managers_ids,
      equipment_ids: value.equipment_ids,
      place_ids: placeIds,
      default_place_id: defaultPlaceId,
      attendance_statuses: this.statusesTarget().map((s) => s.id),
      join_request_policy: value.auto_accept_policy
        ? JoinRequestPolicyEnum.Auto
        : JoinRequestPolicyEnum.Manual,
      topic_creation: value.topic_creation,
      notify_managers_on_join_request: value.notify_managers_on_join_request,
      notify_coaches_on_note: value.notify_coaches_on_note,
      notify_athlete_on_visible_note: value.notify_athlete_on_visible_note,
      timezone: value.timezone,
      vis_distance: value.vis_distance,
      vis_goal: value.vis_goal,
      vis_rounds: value.vis_rounds,
      public_sharing_enabled: value.public_sharing_enabled,
      public_show_distance: value.public_show_distance,
      public_show_goal: value.public_show_goal,
      public_show_rounds: value.public_show_rounds,
    };

    this.teamsService
      .teamsPartialUpdate({ id, patchedTeamRequest: updatePayload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifySaved('teams.form.saved_edit');
          this.authService.refreshMe();
          this.saving.set(false);
          this.form.markAsPristine();
          this.router.navigate(['/teams', id]);
        },
        error: (err: HttpErrorResponse) => {
          this.applyServerError(err);
          this.saving.set(false);
        },
      });
  }

  private partitionStatuses(all: AttendanceStatus[], selectedIds: number[] | null): void {
    if (selectedIds === null || all.length === 0) {
      this.statusesTarget.set([]);
      return;
    }
    const selected = new Set(selectedIds);
    this.statusesTarget.set(all.filter((s) => selected.has(s.id)));
  }

  /** Whether the given status is currently selected for the team. */
  protected isStatusSelected(id: number): boolean {
    return this.statusesTarget().some((s) => s.id === id);
  }

  /**
   * Toggle a status on/off for the team. Mirrors the value into the
   * `statusesTarget` signal so the submit payload (the set of selected ids)
   * is unchanged from the previous picklist implementation.
   */
  protected toggleStatus(status: AttendanceStatus, checked: boolean): void {
    if (checked) {
      this.statusesTarget.update((cur) =>
        cur.some((s) => s.id === status.id) ? cur : [...cur, status],
      );
    } else {
      this.statusesTarget.update((cur) => cur.filter((s) => s.id !== status.id));
    }
  }

  private notifySaved(detailKey: string): void {
    this.toast.success(detailKey);
  }

  private applyServerError(err: HttpErrorResponse): void {
    const body = err?.error as
      | {
          code?: string;
          detail?: string;
          used?: number;
          max?: number;
        }
      | null
      | undefined;

    if (err.status === 403 && body?.code === 'team_quota_exceeded') {
      this.quotaExceeded.set({
        used: typeof body.used === 'number' ? body.used : 0,
        max: typeof body.max === 'number' ? body.max : 0,
      });
      this.errorMessage.set(body.detail ?? 'teams.errors.team_quota_exceeded');
      this.authService.refreshMe();
      return;
    }

    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.toast.error(detail ?? 'teams.errors.unknown');
    }
  }

  /** Error toast for a form-section loader, instead of swallowing the failure
   *  silently (the section just stays empty otherwise). */
  private notifyLoadError(): void {
    this.toast.error('common.load_failed');
  }

  // ── Équipements (enable a subset of the sport catalog) ──────────────────

  /** Fetch the full equipment catalog for the team's sport. */
  private loadEquipmentCatalog(sportId: number): void {
    this.equipmentLoading.set(true);
    this.equipmentService
      // Signature: (ordering, page, pageSize, search, sport, team)
      .equipmentList({ sport: sportId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.equipmentCatalog.set(res.results ?? []);
          this.equipmentLoading.set(false);
        },
        error: () => {
          this.equipmentCatalog.set([]);
          this.equipmentLoading.set(false);
          this.notifyLoadError();
        },
      });
  }

  /** Whether the given catalog item is enabled for the team. */
  protected isEquipmentEnabled(id: number): boolean {
    return (this.form.controls.equipment_ids.value ?? []).includes(id);
  }

  /** Toggle a catalog item on/off in the team's enabled set. */
  protected toggleEquipment(item: Equipment, checked: boolean): void {
    const current = this.form.controls.equipment_ids.value ?? [];
    const next = checked
      ? current.includes(item.id)
        ? current
        : [...current, item.id]
      : current.filter((eid) => eid !== item.id);
    this.form.controls.equipment_ids.setValue(next);
    this.form.controls.equipment_ids.markAsDirty();
  }

}
