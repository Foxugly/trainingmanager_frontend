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
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Textarea } from 'primeng/textarea';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';
import { AttendanceStatusesService } from '../../../api/api/attendance-statuses.service';
import { LevelsService } from '../../../api/api/levels.service';
import { PlacesService } from '../../../api/api/places.service';
import { EquipmentService } from '../../../api/api/equipment.service';
import { SportsService } from '../../../api/api/sports.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Place } from '../../../api/model/place';
import { PlaceRequest } from '../../../api/model/place-request';
import { PatchedPlace } from '../../../api/model/patched-place';
import { Equipment } from '../../../api/model/equipment';
import { AttendanceStatus } from '../../../api/model/attendance-status';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { JoinRequestPolicyEnum } from '../../../api/model/join-request-policy-enum';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Level } from '../../../api/model/level';
import { PatchedTeam } from '../../../api/model/patched-team';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { TopicCreationEnum } from '../../../api/model/topic-creation-enum';
import { TrainingSlot } from '../../../api/model/training-slot';
import { TrainingTemplate } from '../../../api/model/training-template';
import { WeekdayEnum } from '../../../api/model/weekday-enum';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { AuthService } from '../../../core/auth/auth.service';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../../../core/i18n/available-languages';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { buildVisibilityOptions } from '../../../shared/forms/visibility-options';
import {
  ActiveToggleComponent,
  type ActiveToggleLabels,
} from '../../../shared/ui/active-toggle/active-toggle.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge/status-badge.component';

function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toHourMinute(d: Date | null | undefined): string | null {
  if (!d) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date();
  d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return d;
}

type SlotFormGroup = FormGroup<{
  weekday: FormControl<WeekdayEnum>;
  hour_start: FormControl<Date | null>;
  hour_end: FormControl<Date | null>;
}>;

/** Per-slot validator: hour_end must be strictly after hour_start. */
function slotTimeRangeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('hour_start')?.value as Date | null;
  const end = group.get('hour_end')?.value as Date | null;
  if (!start || !end) return null;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return endMinutes <= startMinutes ? { time_range: true } : null;
}

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
    DatePicker,
    Dialog,
    Textarea,
    Tooltip,
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
    EmptyStateComponent,
    MetaFieldComponent,
    FormFooterComponent,
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
  private readonly placesService = inject(PlacesService);
  private readonly equipmentService = inject(EquipmentService);
  private readonly statusesService = inject(AttendanceStatusesService);
  private readonly authService = inject(AuthService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
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

  /** Curated fallback if Intl.supportedValuesOf is unavailable (older runtimes). */
  private static readonly TIMEZONE_FALLBACK: readonly string[] = [
    'UTC',
    'Europe/Brussels',
    'Europe/Paris',
    'Europe/Amsterdam',
    'Europe/Madrid',
    'Europe/Rome',
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Los_Angeles',
  ];

  /** IANA timezones as {label,value} for the filterable select, precomputed once. */
  protected readonly timezoneOptions: { label: string; value: string }[] = (() => {
    let zones: readonly string[];
    try {
      const supported = (
        Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
      ).supportedValuesOf;
      zones =
        typeof supported === 'function'
          ? supported('timeZone')
          : TeamsFormComponent.TIMEZONE_FALLBACK;
    } catch {
      zones = TeamsFormComponent.TIMEZONE_FALLBACK;
    }
    return zones.map((z) => ({ label: z, value: z }));
  })();

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

  // ── Planning type (weekly training template) ────────────────────────────
  protected readonly templateLoading = signal(false);
  protected readonly templateSaving = signal(false);

  // ── Lieux (managed places) ──────────────────────────────────────────────
  /** The team's managed places (Lieux), shared by the manager list + default selector. */
  protected readonly places = signal<Place[]>([]);
  protected readonly placesLoading = signal(false);
  /** Inline create/edit dialog state. */
  protected readonly placeDialogVisible = signal(false);
  protected readonly placeSaving = signal(false);
  /** Id of the place being edited, or null when creating a new one. */
  protected readonly editingPlaceId = signal<number | null>(null);
  protected readonly placeName = signal('');
  protected readonly placeAddress = signal('');
  protected readonly placeNameError = signal<string | null>(null);

  // ── Équipements (global catalog, enabled per team) ──────────────────────
  /**
   * The full equipment (Matériel) catalog for the team's sport. The owner
   * enables a subset by checking items; the selected ids are persisted via
   * the `equipment_ids` write-only field on the team PATCH.
   */
  protected readonly equipmentCatalog = signal<Equipment[]>([]);
  protected readonly equipmentLoading = signal(false);

  /** Weekday select options (Mon=0 … Sun=6), re-translated on language change. */
  protected readonly weekdayOptions = computed(() => {
    this.transloco.getActiveLang();
    const keys = [
      'training_template.weekday.monday',
      'training_template.weekday.tuesday',
      'training_template.weekday.wednesday',
      'training_template.weekday.thursday',
      'training_template.weekday.friday',
      'training_template.weekday.saturday',
      'training_template.weekday.sunday',
    ];
    return keys.map((k, i) => ({ label: this.transloco.translate(k), value: i as WeekdayEnum }));
  });

  protected readonly templateForm = this.fb.group({
    slots: this.fb.array<SlotFormGroup>([]),
    default_pool: this.fb.nonNullable.control<string>(''),
    default_place_id: this.fb.nonNullable.control<number | null>(null),
    season_start: this.fb.nonNullable.control<Date | null>(null),
    season_end: this.fb.nonNullable.control<Date | null>(null),
  });

  protected get slots(): FormArray<SlotFormGroup> {
    return this.templateForm.controls.slots;
  }

  protected readonly patchActive = (id: number, value: boolean) =>
    this.teamsService.teamsPartialUpdate(id, { is_active: value } as PatchedTeam);

  protected readonly activeLabels = computed<ActiveToggleLabels>(() => ({
    active: this.transloco.translate('common.active'),
    inactive: this.transloco.translate('common.inactive'),
    confirm: this.transloco.translate('common.confirm_deactivate'),
    errorSummary: this.transloco.translate('common.error'),
    errorDetail: this.transloco.translate('common.update_failed'),
  }));

  /** Max base64 data-URL length accepted by the backend (~375 KB binary). */
  private static readonly LOGO_MAX_CHARS = 500000;
  /** Longest side (px) the logo is downscaled to before encoding. */
  private static readonly LOGO_MAX_DIM = 256;

  protected readonly logoValue = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    sport_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    level_id: this.fb.nonNullable.control<number | null>(null),
    language: this.fb.nonNullable.control<LanguageCode>('fr', [Validators.required]),
    is_public: [false],
    logo: this.fb.nonNullable.control<string>(''),
    roti_enabled: [false],
    rsvp_enabled: [false],
    weekly_recap_enabled: [false],
    managers_ids: this.fb.nonNullable.control<number[]>([]),
    equipment_ids: this.fb.nonNullable.control<number[]>([]),
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
      .subscribe((res) => this.availableSports.set(res.results ?? []));

    this.levelsService
      .levelsList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => this.availableLevels.set(res.results ?? []));

    this.statusesService
      .attendanceStatusesList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => {
        const list = (res.results ?? []).filter((s) => s.is_active);
        this.availableStatuses.set(list);
        this.partitionStatuses(list, this.team()?.attendance_statuses ?? null);
      });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        this.errorMessage.set('teams.errors.unknown');
        return;
      }
      this.teamId.set(id);
      this.loadTemplate(id);
      this.loadPlaces(id);
      this.loading.set(true);
      this.teamsService
        .teamsRetrieve(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (t) => {
            this.team.set(t);
            this.activeValue.set(t.is_active ?? true);
            this.logoValue.set(t.logo ?? '');
            this.templateForm.controls.default_place_id.setValue(t.default_place?.id ?? null, {
              emitEvent: false,
            });
            this.availableManagers.set(t.managers ?? []);
            this.partitionStatuses(this.availableStatuses(), t.attendance_statuses ?? null);
            // Load the sport's equipment catalog so the owner can enable a subset.
            const sportId = t.sport?.id;
            if (sportId != null) {
              this.loadEquipmentCatalog(sportId);
            } else {
              this.equipmentCatalog.set([]);
            }
            this.form.reset({
              name: t.name,
              sport_id: t.sport?.id ?? null,
              level_id: t.level?.id ?? null,
              language: (t.language as LanguageCode) ?? 'fr',
              is_public: t.is_public ?? false,
              logo: t.logo ?? '',
              roti_enabled: t.roti_enabled ?? false,
              rsvp_enabled: t.rsvp_enabled ?? false,
              weekly_recap_enabled: t.weekly_recap_enabled ?? false,
              managers_ids: (t.managers ?? []).map((m) => m.id),
              equipment_ids: (t.equipment ?? []).map((e) => e.id),
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

  /** Managers currently selected (id present in the `managers_ids` control). */
  protected readonly selectedManagersValue = toSignal(
    this.form.controls.managers_ids.valueChanges,
    { initialValue: this.form.controls.managers_ids.value },
  );
  protected readonly selectedManagers = computed<CustomUserPublic[]>(() => {
    const ids = new Set(this.selectedManagersValue() ?? []);
    return this.availableManagers().filter((m) => ids.has(m.id));
  });

  /** Two-letter initials for the avatar pill. */
  protected managerInitials(m: CustomUserPublic): string {
    const first = (m.first_name ?? '').trim();
    const last = (m.last_name ?? '').trim();
    if (first || last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.charAt(0).toUpperCase();
    }
    return (m.username ?? '?').charAt(0).toUpperCase();
  }

  /** Remove a manager by deselecting its id from the form control. */
  protected removeManager(id: number): void {
    const next = (this.form.controls.managers_ids.value ?? []).filter((mid) => mid !== id);
    this.form.controls.managers_ids.setValue(next);
    this.form.controls.managers_ids.markAsDirty();
  }

  /** Read + downscale the chosen image to a small data-URL, set the logo control. */
  protected async onLogoSelected(event: globalThis.Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await this.fileToResizedDataUrl(file);
      if (dataUrl.length > TeamsFormComponent.LOGO_MAX_CHARS) {
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
    this.messageService.add({
      severity: 'warn',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('teams.form.logo_too_large'),
    });
  }

  /**
   * Load the file into an <img>, draw it onto a canvas downscaled so the
   * longest side is at most LOGO_MAX_DIM (aspect preserved), and return a
   * PNG data-URL. SVGs are kept as-is (vector, already small).
   */
  private fileToResizedDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read_failed'));
      reader.onload = () => {
        const src = reader.result as string;
        if (file.type === 'image/svg+xml') {
          resolve(src);
          return;
        }
        const img = new Image();
        img.onerror = () => reject(new Error('decode_failed'));
        img.onload = () => {
          const max = TeamsFormComponent.LOGO_MAX_DIM;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('no_context'));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          // Prefer PNG; if too heavy, fall back to progressively lower JPEG quality.
          let out = canvas.toDataURL('image/png');
          for (const q of [0.85, 0.7, 0.55, 0.4]) {
            if (out.length <= TeamsFormComponent.LOGO_MAX_CHARS) break;
            out = canvas.toDataURL('image/jpeg', q);
          }
          resolve(out);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  }

  protected cancel(): void {
    const id = this.teamId();
    this.router.navigate(id ? ['/teams', id] : ['/teams']);
  }

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.quotaExceeded.set(null);

    const value = this.form.getRawValue();
    const id = this.teamId();

    if (id === null) {
      const createPayload = {
        name: value.name,
        sport_id: value.sport_id,
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
        .teamsCreate(createPayload as unknown as Team)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.notifySaved('teams.form.saved_create');
            this.authService.refreshMe();
            this.saving.set(false);
            this.router.navigate(['/teams', created.id, 'edit']);
          },
          error: (err: HttpErrorResponse) => {
            this.applyServerError(err);
            this.saving.set(false);
          },
        });
      return;
    }

    const updatePayload: PatchedTeam = {
      name: value.name,
      sport_id: value.sport_id ?? undefined,
      level_id: value.level_id ?? null,
      language: value.language as LanguageEnum,
      is_public: value.is_public,
      logo: value.logo,
      roti_enabled: value.roti_enabled,
      rsvp_enabled: value.rsvp_enabled,
      weekly_recap_enabled: value.weekly_recap_enabled,
      managers_ids: value.managers_ids,
      equipment_ids: value.equipment_ids,
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
      .teamsPartialUpdate(id, updatePayload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifySaved('teams.form.saved_edit');
          this.authService.refreshMe();
          this.saving.set(false);
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
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate(detailKey),
    });
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
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: detail
          ? this.transloco.translate(detail)
          : this.transloco.translate('teams.errors.unknown'),
      });
    }
  }

  // ── Planning type (weekly training template) ────────────────────────────

  /** Build a slot form group from an optional existing slot. */
  private buildSlotGroup(slot?: TrainingSlot): SlotFormGroup {
    return this.fb.group(
      {
        weekday: this.fb.nonNullable.control<WeekdayEnum>(
          slot?.weekday ?? WeekdayEnum.NUMBER_0,
          [Validators.required],
        ),
        hour_start: this.fb.nonNullable.control<Date | null>(parseTime(slot?.hour_start), [
          Validators.required,
        ]),
        hour_end: this.fb.nonNullable.control<Date | null>(parseTime(slot?.hour_end), [
          Validators.required,
        ]),
      },
      { validators: [slotTimeRangeValidator] },
    ) as SlotFormGroup;
  }

  protected addSlot(): void {
    this.slots.push(this.buildSlotGroup());
    this.slots.markAsDirty();
  }

  protected removeSlot(index: number): void {
    this.slots.removeAt(index);
    this.slots.markAsDirty();
  }

  /** True when the slot at `index` has an end time at or before its start. */
  protected slotHasTimeError(index: number): boolean {
    const group = this.slots.at(index);
    return !!group && group.errors?.['time_range'] === true;
  }

  private loadTemplate(teamId: number): void {
    this.templateLoading.set(true);
    this.teamsService
      .teamsTrainingTemplateRetrieve(teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tpl) => {
          this.slots.clear();
          for (const slot of tpl.slots ?? []) {
            this.slots.push(this.buildSlotGroup(slot));
          }
          this.templateForm.patchValue({
            default_pool: tpl.default_pool ?? '',
            season_start: parseDate(tpl.season_start),
            season_end: parseDate(tpl.season_end),
          });
          this.templateForm.markAsPristine();
          this.templateLoading.set(false);
        },
        error: () => {
          this.templateLoading.set(false);
        },
      });
  }

  // ── Lieux (managed places) management ───────────────────────────────────

  private loadPlaces(teamId: number): void {
    this.placesLoading.set(true);
    this.placesService
      .placesList(undefined, undefined, undefined, undefined, teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.places.set(res.results ?? []);
          this.placesLoading.set(false);
        },
        error: () => {
          this.places.set([]);
          this.placesLoading.set(false);
        },
      });
  }

  /** Open the dialog to create a new place. */
  protected openCreatePlace(): void {
    this.editingPlaceId.set(null);
    this.placeName.set('');
    this.placeAddress.set('');
    this.placeNameError.set(null);
    this.placeDialogVisible.set(true);
  }

  /** Open the dialog pre-filled to edit an existing place. */
  protected openEditPlace(place: Place): void {
    this.editingPlaceId.set(place.id);
    this.placeName.set(place.name);
    this.placeAddress.set(place.address ?? '');
    this.placeNameError.set(null);
    this.placeDialogVisible.set(true);
  }

  protected closePlaceDialog(): void {
    this.placeDialogVisible.set(false);
  }

  /** Create or update the place currently in the dialog. */
  protected savePlace(): void {
    const teamId = this.teamId();
    const name = this.placeName().trim();
    if (teamId === null) return;
    if (!name) {
      this.placeNameError.set(this.transloco.translate('place.name_required'));
      return;
    }
    this.placeSaving.set(true);
    this.placeNameError.set(null);
    const address = this.placeAddress().trim() || undefined;
    const id = this.editingPlaceId();

    const onError = (err: HttpErrorResponse) => {
      this.placeSaving.set(false);
      const body = err?.error as { code?: string } | null | undefined;
      if (err.status === 400 && body?.code === 'place_already_exists') {
        this.placeNameError.set(this.transloco.translate('place.error_duplicate'));
      } else {
        this.messageService.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('place.error_create'),
        });
      }
    };

    if (id === null) {
      const payload: PlaceRequest = { team: teamId, name, address };
      this.placesService
        .placesCreate(payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.placeSaving.set(false);
            this.placeDialogVisible.set(false);
            this.places.update((cur) => [...cur, created]);
            this.notifyPlaceToast('place.created');
          },
          error: onError,
        });
    } else {
      const payload: PatchedPlace = { name, address };
      this.placesService
        .placesPartialUpdate(id, payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (updated) => {
            this.placeSaving.set(false);
            this.placeDialogVisible.set(false);
            this.places.update((cur) => cur.map((p) => (p.id === updated.id ? updated : p)));
            this.notifyPlaceToast('place.updated');
          },
          error: onError,
        });
    }
  }

  /** Confirm + delete a place (past sessions keep their location text). */
  protected confirmDeletePlace(place: Place): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('place.delete_confirm', { name: place.name }),
      header: this.transloco.translate('place.delete'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deletePlace(place.id),
    });
  }

  private deletePlace(id: number): void {
    this.placesService
      .placesDestroy(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.places.update((cur) => cur.filter((p) => p.id !== id));
          if (this.templateForm.controls.default_place_id.value === id) {
            this.templateForm.controls.default_place_id.setValue(null, { emitEvent: false });
          }
          this.notifyPlaceToast('place.deleted');
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('place.error_delete'),
          });
        },
      });
  }

  private notifyPlaceToast(detailKey: string): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate(detailKey),
    });
  }

  // ── Équipements (enable a subset of the sport catalog) ──────────────────

  /** Fetch the full equipment catalog for the team's sport. */
  private loadEquipmentCatalog(sportId: number): void {
    this.equipmentLoading.set(true);
    this.equipmentService
      // Signature: (ordering, page, pageSize, search, sport, team)
      .equipmentList(undefined, undefined, undefined, undefined, sportId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.equipmentCatalog.set(res.results ?? []);
          this.equipmentLoading.set(false);
        },
        error: () => {
          this.equipmentCatalog.set([]);
          this.equipmentLoading.set(false);
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

  protected saveTemplate(): void {
    const id = this.teamId();
    if (id === null || this.templateForm.invalid) return;

    this.templateSaving.set(true);
    const value = this.templateForm.getRawValue();
    const slots: TrainingSlot[] = (value.slots ?? []).map((s) => ({
      weekday: s.weekday as WeekdayEnum,
      hour_start: toHourMinute(s.hour_start) ?? '',
      hour_end: toHourMinute(s.hour_end) ?? '',
    }));

    const payload: TrainingTemplate = {
      slots,
      default_pool: value.default_pool || '',
      season_start: toIsoDate(value.season_start),
      season_end: toIsoDate(value.season_end),
    };

    const onTemplateError = (err: HttpErrorResponse) => {
      this.templateSaving.set(false);
      const detail =
        err.status === 403
          ? this.transloco.translate('training_template.error_forbidden')
          : this.transloco.translate('training_template.error');
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail,
      });
    };

    this.teamsService
      .teamsTrainingTemplateUpdate(id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          // The default place is a team field (the backend syncs default_pool
          // from it); persist it via a team PATCH after the template update.
          this.teamsService
            .teamsPartialUpdate(id, {
              default_place_id: value.default_place_id ?? null,
            } as PatchedTeam)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (t) => {
                this.templateSaving.set(false);
                this.templateForm.markAsPristine();
                this.team.set(t);
                this.messageService.add({
                  severity: 'success',
                  summary: this.transloco.translate('common.success'),
                  detail: this.transloco.translate('training_template.saved'),
                });
              },
              error: onTemplateError,
            });
        },
        error: onTemplateError,
      });
  }
}
