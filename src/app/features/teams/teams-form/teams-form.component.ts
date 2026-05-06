import { KeyValuePipe } from '@angular/common';
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
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { MultiSelect } from 'primeng/multiselect';
import { PickList } from 'primeng/picklist';
import { Select } from 'primeng/select';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { AttendanceStatusesService } from '../../../api/api/attendance-statuses.service';
import { SportsService } from '../../../api/api/sports.service';
import { TeamsService } from '../../../api/api/teams.service';
import { AttendanceStatus } from '../../../api/model/attendance-status';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { JoinRequestPolicyEnum } from '../../../api/model/join-request-policy-enum';
import { LanguageEnum } from '../../../api/model/language-enum';
import { PatchedTeam } from '../../../api/model/patched-team';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../../../core/i18n/available-languages';

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-teams-form',
  imports: [
    KeyValuePipe,
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Select,
    MultiSelect,
    PickList,
    Checkbox,
    ToggleSwitch,
    Button,
    Message,
    ConfirmDialog,
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
  protected readonly availableManagers = signal<CustomUserPublic[]>([]);
  protected readonly availableStatuses = signal<AttendanceStatus[]>([]);
  protected readonly statusesSource = signal<AttendanceStatus[]>([]);
  protected readonly statusesTarget = signal<AttendanceStatus[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly quotaExceeded = signal<{ used: number; max: number } | null>(null);

  protected readonly availableLanguages = AVAILABLE_LANGUAGES;

  protected readonly isEditMode = computed(() => this.teamId() !== null);
  protected readonly isOwner = computed(() => {
    const t = this.team();
    const userId = this.authService.currentUser()?.id;
    return t != null && userId != null && t.owner?.id === userId;
  });

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    sport_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    language: this.fb.nonNullable.control<LanguageCode>('fr', [Validators.required]),
    is_public: [false],
    is_active: [true],
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
            this.availableManagers.set(t.managers ?? []);
            this.partitionStatuses(this.availableStatuses(), t.attendance_statuses ?? null);
            this.form.reset({
              name: t.name,
              sport_id: t.sport?.id ?? null,
              language: (t.language as LanguageCode) ?? 'fr',
              is_public: t.is_public ?? false,
              is_active: t.is_active ?? true,
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
        language: value.language as LanguageEnum,
        is_public: value.is_public,
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
      language: value.language as LanguageEnum,
      is_public: value.is_public,
      is_active: value.is_active,
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

  protected confirmDeactivate(): void {
    const id = this.teamId();
    if (id === null) return;
    this.confirmationService.confirm({
      header: this.transloco.translate('teams.detail.deactivate_confirm_title'),
      message: this.transloco.translate('teams.detail.deactivate_confirm_message'),
      accept: () => this.deactivate(id),
    });
  }

  private deactivate(id: number): void {
    this.teamsService
      .teamsPartialUpdate(id, { is_active: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.authService.refreshMe();
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.detail.deactivated'),
          });
          this.router.navigate(['/teams']);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('teams.errors.unknown'),
          });
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
          fields?: FieldErrors;
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

    if (body?.fields && Object.keys(body.fields).length > 0) {
      this.fieldErrors.set(body.fields);
      return;
    }

    if (body && typeof body === 'object') {
      const fieldEntries: FieldErrors = {};
      for (const [key, value] of Object.entries(body)) {
        if (key === 'code' || key === 'detail' || key === 'fields') continue;
        if (Array.isArray(value)) {
          fieldEntries[key] = value.filter((m): m is string => typeof m === 'string');
        }
      }
      if (Object.keys(fieldEntries).length > 0) {
        this.fieldErrors.set(fieldEntries);
        return;
      }
    }

    this.errorMessage.set(body?.detail ?? 'teams.errors.unknown');
  }
}
