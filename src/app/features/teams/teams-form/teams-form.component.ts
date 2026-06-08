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
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
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
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { TableModule } from 'primeng/table';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
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
import { NominatimResult, NominatimService } from '../../../core/geo/nominatim.service';
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
    AutoComplete,
    TableModule,
    Checkbox,
    ToggleSwitch,
    DatePicker,
    Dialog,
    Button,
    Tooltip,
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
  private readonly nominatim = inject(NominatimService);
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
  /**
   * Indices of slot rows currently shown in inline-edit mode. Existing slots
   * render as a read-only summary line by default; a freshly-added slot starts
   * in edit mode. The set is keyed by the slot's position in the FormArray.
   */
  protected readonly editingSlotIndices = signal<ReadonlySet<number>>(new Set());

  // ── Lieux (shared sport pool, linked to the team via M2M) ───────────────
  /**
   * The whole venue pool for the team's sport (loaded via `?sport`). The owner
   * links a subset by checking items; the selected ids are persisted via the
   * `place_ids` write-only field on the team PATCH. The default-place selector
   * picks from the currently-linked subset.
   */
  protected readonly places = signal<Place[]>([]);
  protected readonly placesLoading = signal(false);
  /**
   * "Ajouter un lieu" dialog state. The dialog offers two affordances:
   *  - an autocomplete over the sport pool (existing places not yet linked) to
   *    link one to the team; and
   *  - a "create new" mode revealing a name field + a Nominatim-backed address
   *    autocomplete to create a brand-new venue then link it.
   */
  protected readonly placeDialogVisible = signal(false);
  protected readonly placeSaving = signal(false);
  /** Whether the dialog is in "create a new place" mode (vs. link-existing). */
  protected readonly placeCreateMode = signal(false);
  /** Bound value of the pool autocomplete (a Place or a typed string). */
  protected readonly placePoolSelection = signal<Place | string | null>(null);
  /** Pool autocomplete suggestions (existing, not-yet-linked places). */
  protected readonly placePoolSuggestions = signal<Place[]>([]);
  protected readonly placeName = signal('');
  protected readonly placeAddress = signal('');
  protected readonly placeNameError = signal<string | null>(null);
  /** Nominatim address suggestions for the create-new address field. */
  protected readonly addressSuggestions = signal<NominatimResult[]>([]);
  /** The `display_name` labels of the current Nominatim suggestions. */
  protected readonly addressSuggestionLabels = computed<string[]>(() =>
    this.addressSuggestions().map((r) => r.display_name),
  );

  /** Pushes raw address-field input into the debounced Nominatim pipeline. */
  private readonly addressQuery$ = new Subject<string>();

  /** Currently-linked place ids, mirrored from the `place_ids` form control. */
  private readonly placeIdsValue = signal<number[]>([]);
  /** The subset of the pool currently linked to the team (the table rows). */
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
    // Debounced Nominatim address lookup for the create-new place flow.
    this.addressQuery$
      .pipe(
        debounceTime(350),
        map((q) => q.trim()),
        distinctUntilChanged(),
        switchMap((q) => this.nominatim.search(q, this.transloco.getActiveLang())),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => this.addressSuggestions.set(results));

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
      this.loading.set(true);
      this.teamsService
        .teamsRetrieve(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (t) => {
            this.team.set(t);
            this.activeValue.set(t.is_active ?? true);
            this.logoValue.set(t.logo ?? '');
            this.availableManagers.set(t.managers ?? []);
            this.partitionStatuses(this.availableStatuses(), t.attendance_statuses ?? null);
            // Load the sport's equipment catalog + venue pool so the owner can
            // enable/link a subset of each.
            const sportId = t.sport?.id;
            if (sportId != null) {
              this.loadEquipmentCatalog(sportId);
              this.loadPlacePool(sportId);
            } else {
              this.equipmentCatalog.set([]);
              this.places.set([]);
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

  /** Managers currently selected (id present in the `managers_ids` control). */
  protected readonly selectedManagersValue = toSignal(
    this.form.controls.managers_ids.valueChanges,
    { initialValue: this.form.controls.managers_ids.value },
  );
  protected readonly selectedManagers = computed<CustomUserPublic[]>(() => {
    const ids = new Set(this.selectedManagersValue() ?? []);
    return this.availableManagers().filter((m) => ids.has(m.id));
  });

  /** Currently-chosen default place id, mirrored from the form control. */
  protected readonly defaultPlaceIdValue = toSignal(
    this.form.controls.default_place_id.valueChanges,
    { initialValue: this.form.controls.default_place_id.value },
  );
  /** True for the team's current default place (drives the star/check column). */
  protected isDefaultPlace(id: number): boolean {
    return this.defaultPlaceIdValue() === id;
  }

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

  // ── Encadrement: add-manager picker dialog ──────────────────────────────
  protected readonly managerDialogVisible = signal(false);
  protected readonly managerPickId = signal<number | null>(null);

  /** Managers not yet selected — the candidate pool for the add picker. */
  protected readonly addableManagers = computed<CustomUserPublic[]>(() => {
    const selected = new Set(this.selectedManagersValue() ?? []);
    return this.availableManagers().filter((m) => !selected.has(m.id));
  });

  protected openAddManager(): void {
    this.managerPickId.set(null);
    this.managerDialogVisible.set(true);
  }

  protected closeAddManagerDialog(): void {
    this.managerDialogVisible.set(false);
  }

  /** Append the picked candidate to managers_ids and close the dialog. */
  protected confirmAddManager(): void {
    const id = this.managerPickId();
    if (id === null) return;
    const current = this.form.controls.managers_ids.value ?? [];
    if (!current.includes(id)) {
      this.form.controls.managers_ids.setValue([...current, id]);
      this.form.controls.managers_ids.markAsDirty();
    }
    this.managerDialogVisible.set(false);
  }

  /** Friendly display label for a candidate in the picker. */
  protected managerLabel(m: CustomUserPublic): string {
    const name = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
    return name ? `${name} (@${m.username})` : `@${m.username}`;
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

    // Ensure the default place (if any) is part of the linked set for
    // consistency; the server auto-adds it too, but we keep the payload honest.
    const defaultPlaceId = value.default_place_id ?? null;
    const placeIds =
      defaultPlaceId != null && !value.place_ids.includes(defaultPlaceId)
        ? [...value.place_ids, defaultPlaceId]
        : value.place_ids;

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
    // A new slot has no values yet — open it directly in edit mode.
    this.editingSlotIndices.update((cur) => new Set(cur).add(this.slots.length - 1));
  }

  protected removeSlot(index: number): void {
    this.slots.removeAt(index);
    this.slots.markAsDirty();
    // Drop the removed index and shift every higher index down by one so the
    // edit-mode set keeps tracking the right rows after the array re-indexes.
    this.editingSlotIndices.update((cur) => {
      const next = new Set<number>();
      for (const i of cur) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  }

  /** Whether the slot row at `index` is currently in inline-edit mode. */
  protected isSlotEditing(index: number): boolean {
    return this.editingSlotIndices().has(index);
  }

  /** Switch a slot row to inline-edit mode. */
  protected editSlot(index: number): void {
    this.editingSlotIndices.update((cur) => new Set(cur).add(index));
  }

  /** Collapse a slot row back to its read-only summary (if it is valid). */
  protected confirmSlot(index: number): void {
    const group = this.slots.at(index);
    if (group && group.invalid) {
      group.markAllAsTouched();
      return;
    }
    this.editingSlotIndices.update((cur) => {
      const next = new Set(cur);
      next.delete(index);
      return next;
    });
  }

  /** Read-only one-line summary for a slot, e.g. "Lundi 18:00 – 19:30". */
  protected slotSummary(index: number): string {
    const group = this.slots.at(index);
    if (!group) return '';
    const weekday = group.controls.weekday.value;
    const label = this.weekdayOptions()[weekday]?.label ?? '';
    const start = toHourMinute(group.controls.hour_start.value) ?? '—';
    const end = toHourMinute(group.controls.hour_end.value) ?? '—';
    return `${label} ${start} – ${end}`.trim();
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
          // Existing slots start collapsed (read-only summary).
          this.editingSlotIndices.set(new Set());
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

  // ── Lieux (shared sport pool) management ────────────────────────────────

  /** Fetch the whole venue pool for the team's sport (to attach/share). */
  private loadPlacePool(sportId: number): void {
    this.placesLoading.set(true);
    this.placesService
      // Signature: (ordering, page, pageSize, search, sport, team) — ?sport pool.
      .placesList(undefined, undefined, undefined, undefined, sportId)
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

  /** Whether the given pool place is currently linked to the team. */
  protected isPlaceSelected(id: number): boolean {
    return (this.form.controls.place_ids.value ?? []).includes(id);
  }

  /** Link/unlink a pool place to the team via the `place_ids` control. */
  protected togglePlace(place: Place, checked: boolean): void {
    const current = this.form.controls.place_ids.value ?? [];
    const next = checked
      ? current.includes(place.id)
        ? current
        : [...current, place.id]
      : current.filter((pid) => pid !== place.id);
    this.form.controls.place_ids.setValue(next);
    this.form.controls.place_ids.markAsDirty();
    this.placeIdsValue.set(next);
    // Unlinking the current default clears the default selector.
    if (!checked && this.form.controls.default_place_id.value === place.id) {
      this.form.controls.default_place_id.setValue(null);
      this.form.controls.default_place_id.markAsDirty();
    }
  }

  /**
   * Make `place` the team default (star action). Ensures the place is linked
   * (its id is in `place_ids`) and sets `default_place_id`.
   */
  protected setDefaultPlace(place: Place): void {
    if (!this.isPlaceSelected(place.id)) this.togglePlace(place, true);
    this.form.controls.default_place_id.setValue(place.id);
    this.form.controls.default_place_id.markAsDirty();
  }

  /** Unlink `place` from the team (trash action); clears default if it was it. */
  protected removePlace(place: Place): void {
    this.togglePlace(place, false);
  }

  /** Open the "Ajouter un lieu" dialog in link-existing mode. */
  protected openAddPlace(): void {
    this.placeCreateMode.set(false);
    this.placePoolSelection.set(null);
    this.placePoolSuggestions.set([]);
    this.placeName.set('');
    this.placeAddress.set('');
    this.placeNameError.set(null);
    this.addressSuggestions.set([]);
    this.placeDialogVisible.set(true);
  }

  protected closePlaceDialog(): void {
    this.placeDialogVisible.set(false);
  }

  /** Reveal the "create a new place" fields inside the dialog. */
  protected enterCreateMode(): void {
    this.placeCreateMode.set(true);
    this.placeNameError.set(null);
  }

  /**
   * Pool autocomplete: suggest existing sport-pool places matching the typed
   * text that are NOT already linked to the team.
   */
  protected searchPool(event: AutoCompleteCompleteEvent): void {
    const q = (event.query ?? '').trim().toLowerCase();
    const linked = new Set(this.form.controls.place_ids.value ?? []);
    const matches = this.places().filter(
      (p) =>
        !linked.has(p.id) &&
        (q.length === 0 ||
          p.name.toLowerCase().includes(q) ||
          (p.address ?? '').toLowerCase().includes(q)),
    );
    this.placePoolSuggestions.set(matches);
  }

  /** Pool autocomplete selection → link the chosen existing place. */
  protected onPoolSelect(place: Place): void {
    this.togglePlace(place, true);
    this.placeDialogVisible.set(false);
    this.notifyPlaceToast('place.linked');
  }

  /** Address field input → push into the debounced Nominatim pipeline. */
  protected onAddressInput(value: string): void {
    this.placeAddress.set(value);
    this.addressQuery$.next(value);
  }

  /** Address autocomplete: re-emit on each keystroke (debounced downstream). */
  protected searchAddress(event: AutoCompleteCompleteEvent): void {
    this.addressQuery$.next(event.query ?? '');
  }

  /** A Nominatim suggestion was picked → fill the address with its label. */
  protected onAddressSelect(displayName: string): void {
    this.placeAddress.set(displayName);
  }

  /** Create a new place in the pool, link it to the team, and refresh. */
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
    const payload: PlaceRequest = { team: teamId, name, address };
    this.placesService
      .placesCreate(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.placeSaving.set(false);
          this.placeDialogVisible.set(false);
          this.places.update((cur) => [...cur, created]);
          // A freshly-created place belongs to the team: link it immediately.
          this.togglePlace(created, true);
          this.notifyPlaceToast('place.created');
        },
        error: () => {
          this.placeSaving.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('place.error_create'),
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
          this.templateSaving.set(false);
          this.templateForm.markAsPristine();
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('training_template.saved'),
          });
        },
        error: onTemplateError,
      });
  }
}
