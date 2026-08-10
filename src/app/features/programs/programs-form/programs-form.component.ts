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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { handleInvalidSubmit } from '../../../shared/form-validation';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { DatePicker } from 'primeng/datepicker';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tooltip } from 'primeng/tooltip';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { PatchedProgramRequest } from '../../../api/model/patched-program-request';
import { ProgramRequest } from '../../../api/model/program-request';
import { Program } from '../../../api/model/program';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { ToastService } from '../../../core/notifications/toast.service';
import {
  ActiveToggleComponent,
  type ActiveToggleLabels,
} from '../../../shared/ui/active-toggle/active-toggle.component';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { RichEditorComponent } from '../../../shared/ui/rich-editor/rich-editor.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge/status-badge.component';
import { AriaDescribesDirective } from '../../../shared/a11y/aria-describes.directive';
import { TeamRole, computeTeamRole } from '../../teams/teams-list/teams-list.component';
import { LanguageService } from '../../../core/i18n/language.service';

function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-programs-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    DatePicker,
    Select,
    Button,
    Message,
    RichEditorComponent,
    ConfirmDialog,
    Tooltip,
    PageHeaderComponent,
    StatusBadgeComponent,
    ActiveToggleComponent,
    MetaFieldComponent,
    FormFooterComponent,
    AriaDescribesDirective,
    TranslocoPipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './programs-form.component.html',
  styleUrl: './programs-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly programId = signal<number | null>(null);
  protected readonly program = signal<Program | null>(null);
  protected readonly loading = signal(false);
  // Edit-mode load failure: never render a blank edit form (a Save would PATCH
  // the real program with defaults). notFound = 404, loadError = other.
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);
  protected readonly saving = signal(false);
  protected readonly availableTeams = signal<Team[]>([]);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);
  protected readonly activeValue = signal(true);

  protected readonly isEditMode = computed(() => this.programId() !== null);

  /** A program with ≥1 linked session cannot be deleted (PROTECTed server-side). */
  protected readonly hasLinkedEvents = computed(() => (this.program()?.events?.length ?? 0) > 0);

  protected readonly patchActive = (id: number, value: boolean) =>
    this.programsService.programsPartialUpdate({
      id,
      patchedProgramRequest: {
        is_active: value,
      },
    });

  protected readonly activeLabels = computed<ActiveToggleLabels>(() => {
    this.language.revision();
    return {
      active: this.transloco.translate('common.active'),
      inactive: this.transloco.translate('common.inactive'),
      confirm: this.transloco.translate('common.confirm_deactivate'),
      errorSummary: this.transloco.translate('common.error'),
      errorDetail: this.transloco.translate('common.update_failed'),
    };
  });

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    team_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    date_start: this.fb.nonNullable.control<Date | null>(null),
    date_end: this.fb.nonNullable.control<Date | null>(null),
    description: [''],
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        this.notifyLoadError();
        return;
      }
      this.programId.set(id);
      this.loadProgram(id);
      return;
    }

    this.loadManagerTeams();

    const teamQ = this.route.snapshot.queryParamMap.get('team');
    if (teamQ) {
      const tid = Number(teamQ);
      if (Number.isFinite(tid)) {
        this.form.patchValue({ team_id: tid });
      }
    }
  }

  protected loadProgram(id: number): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    this.programsService
      .programsRetrieve({ id, includeInactive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.program.set(p);
          this.activeValue.set(p.is_active ?? true);
          // Seed the (disabled) team select with the program's own team so the
          // p-select can resolve and display its label. Team is not changeable
          // on update, so we don't load the full managed-teams list here.
          if (p.team) {
            // codegen: Program.team is a TeamMinimal (id/name/language only),
            // but availableTeams seeds the disabled p-select which only reads
            // id/name. The two codegen interfaces don't overlap enough for a
            // direct `as Team`, so the double-cast bridges the read shape.
            this.availableTeams.set([p.team as unknown as Team]);
          }
          this.form.reset({
            name: p.name,
            team_id: p.team?.id ?? null,
            date_start: fromIsoDate(p.date_start),
            date_end: fromIsoDate(p.date_end),
            description: p.description ?? '',
          });
          this.form.controls.team_id.disable();
          this.loading.set(false);
        },
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.notFound.set(true);
          } else {
            this.loadError.set(true);
          }
          this.loading.set(false);
        },
      });
  }

  /** Retry button handler for the edit-mode load-failure state. */
  protected reloadProgram(): void {
    const id = this.programId();
    if (id != null) {
      this.loadProgram(id);
    }
  }

  private loadManagerTeams(): void {
    const userId = this.authService.currentUser()?.id;
    if (userId == null) return;
    this.teamsService
      .teamsList({ isActive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const teams = (res.results ?? []).filter((t) => {
            const role: TeamRole = computeTeamRole(t, userId);
            return role === 'owner' || role === 'manager';
          });
          this.availableTeams.set(teams);
        },
      });
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  protected cancel(): void {
    const id = this.programId();
    this.router.navigate(id ? ['/programs', id] : ['/programs']);
  }

  /** CanDeactivate hook (unsavedChangesGuard): warn before leaving with edits. */
  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  protected submit(): void {
    if (handleInvalidSubmit(this.form, this.messageService, this.transloco)) return;
    this.saving.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const id = this.programId();

    if (id === null) {
      // team_id is guaranteed non-null here: the field is `Validators.required`
      // and `submit()` bails on an invalid form above.
      const createPayload: ProgramRequest = {
        name: value.name,
        team_id: value.team_id!,
        date_start: toIsoDate(value.date_start),
        date_end: toIsoDate(value.date_end),
        description: value.description,
      };
      this.programsService
        .programsCreate({ programRequest: createPayload })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.notifySaved('programs.form.saved_create');
            this.saving.set(false);
            this.form.markAsPristine();
            this.router.navigate(['/programs', created.id]);
          },
          error: (err: HttpErrorResponse) => {
            this.applyServerError(err);
            this.saving.set(false);
          },
        });
      return;
    }

    const patch: PatchedProgramRequest = {
      name: value.name,
      date_start: toIsoDate(value.date_start),
      date_end: toIsoDate(value.date_end),
      description: value.description,
    };
    this.programsService
      .programsPartialUpdate({ id, patchedProgramRequest: patch })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifySaved('programs.form.saved_edit');
          this.saving.set(false);
          this.form.markAsPristine();
          this.router.navigate(['/programs', id]);
        },
        error: (err: HttpErrorResponse) => {
          this.applyServerError(err);
          this.saving.set(false);
        },
      });
  }

  protected confirmDelete(): void {
    if (this.hasLinkedEvents()) return;
    this.confirmationService.confirm({
      header: this.transloco.translate('common.delete'),
      message: this.transloco.translate('programs.form.delete_confirm'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteProgram(),
    });
  }

  private deleteProgram(): void {
    const id = this.programId();
    if (id === null) return;
    this.saving.set(true);
    const teamId = this.program()?.team?.id ?? null;
    this.programsService
      .programsDestroy({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('programs.form.deleted');
          this.router.navigate(teamId != null ? ['/teams', teamId] : ['/programs']);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.applyServerError(err);
        },
      });
  }

  private notifySaved(detailKey: string): void {
    this.toast.success(detailKey);
  }

  private notifyLoadError(): void {
    this.toast.error('programs.errors.unknown');
  }

  private applyServerError(err: HttpErrorResponse): void {
    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.toast.error(detail ?? 'programs.errors.unknown');
    }
  }
}
