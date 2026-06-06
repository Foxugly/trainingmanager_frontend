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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { InputText } from 'primeng/inputtext';
import { MultiSelect } from 'primeng/multiselect';
import { PickList } from 'primeng/picklist';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { AttendanceStatusesService } from '../../../api/api/attendance-statuses.service';
import { LevelsService } from '../../../api/api/levels.service';
import { SportsService } from '../../../api/api/sports.service';
import { TeamsService } from '../../../api/api/teams.service';
import { AttendanceStatus } from '../../../api/model/attendance-status';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { JoinRequestPolicyEnum } from '../../../api/model/join-request-policy-enum';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Level } from '../../../api/model/level';
import { PatchedTeam } from '../../../api/model/patched-team';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../../../core/i18n/available-languages';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import {
  ActiveToggleComponent,
  type ActiveToggleLabels,
} from '../../../shared/ui/active-toggle/active-toggle.component';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge/status-badge.component';

@Component({
  selector: 'app-teams-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Select,
    MultiSelect,
    PickList,
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
  private readonly statusesService = inject(AttendanceStatusesService);
  private readonly authService = inject(AuthService);
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
  protected readonly statusesSource = signal<AttendanceStatus[]>([]);
  protected readonly statusesTarget = signal<AttendanceStatus[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly quotaExceeded = signal<{ used: number; max: number } | null>(null);
  protected readonly activeValue = signal(true);

  protected readonly availableLanguages = AVAILABLE_LANGUAGES;

  protected readonly isEditMode = computed(() => this.teamId() !== null);

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
    weekly_recap_enabled: [false],
    managers_ids: this.fb.nonNullable.control<number[]>([]),
    auto_accept_policy: [false],
    notify_managers_on_join_request: [true],
  });

  private readonly autoAcceptValue = toSignal(this.form.controls.auto_accept_policy.valueChanges, {
    initialValue: this.form.controls.auto_accept_policy.value,
  });
  protected readonly isAutoPolicy = computed(() => this.autoAcceptValue() === true);

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
            this.form.reset({
              name: t.name,
              sport_id: t.sport?.id ?? null,
              level_id: t.level?.id ?? null,
              language: (t.language as LanguageCode) ?? 'fr',
              is_public: t.is_public ?? false,
              logo: t.logo ?? '',
              roti_enabled: t.roti_enabled ?? false,
              weekly_recap_enabled: t.weekly_recap_enabled ?? false,
              managers_ids: (t.managers ?? []).map((m) => m.id),
              auto_accept_policy: t.join_request_policy === JoinRequestPolicyEnum.Auto,
              notify_managers_on_join_request: t.notify_managers_on_join_request ?? true,
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
      weekly_recap_enabled: value.weekly_recap_enabled,
      managers_ids: value.managers_ids,
      attendance_statuses: this.statusesTarget().map((s) => s.id),
      join_request_policy: value.auto_accept_policy
        ? JoinRequestPolicyEnum.Auto
        : JoinRequestPolicyEnum.Manual,
      notify_managers_on_join_request: value.notify_managers_on_join_request,
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
      this.statusesSource.set(all);
      return;
    }
    const selected = new Set(selectedIds);
    const target = all.filter((s) => selected.has(s.id));
    const source = all.filter((s) => !selected.has(s.id));
    this.statusesTarget.set(target);
    this.statusesSource.set(source);
  }

  protected onStatusesMoveToTarget(items: AttendanceStatus[]): void {
    const ids = new Set(items.map((s) => s.id));
    this.statusesTarget.update((cur) => [...cur, ...items.filter((i) => !cur.some((c) => c.id === i.id))]);
    this.statusesSource.update((cur) => cur.filter((s) => !ids.has(s.id)));
  }

  protected onStatusesMoveToSource(items: AttendanceStatus[]): void {
    const ids = new Set(items.map((s) => s.id));
    this.statusesSource.update((cur) => [...cur, ...items.filter((i) => !cur.some((c) => c.id === i.id))]);
    this.statusesTarget.update((cur) => cur.filter((s) => !ids.has(s.id)));
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
}
