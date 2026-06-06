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
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ColorPicker } from 'primeng/colorpicker';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { firstValueFrom } from 'rxjs';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { PatchedEvent } from '../../../api/model/patched-event';
import { Program } from '../../../api/model/program';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { buildVisibilityOptions } from '../../../shared/forms/visibility-options';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';

function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toIsoTime(d: Date | null | undefined): string | null {
  if (!d) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}:00`;
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

function timeRangeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('hour_start')?.value as Date | null;
  const end = group.get('hour_end')?.value as Date | null;
  if (!start || !end) return null;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return endMinutes < startMinutes ? { time_range: true } : null;
}

@Component({
  selector: 'app-events-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    InputNumber,
    Select,
    Textarea,
    DatePicker,
    ColorPicker,
    Button,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    PageHeaderComponent,
    MetaFieldComponent,
    FormFooterComponent,
    TranslocoPipe,
  ],
  templateUrl: './events-form.component.html',
  styleUrl: './events-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsService = inject(EventsService);
  private readonly teamsService = inject(TeamsService);
  private readonly programsService = inject(ProgramsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly eventId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly availablePrograms = signal<Program[]>([]);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly isEditMode = computed(() => this.eventId() !== null);

  /** Visibility-mode select options, re-translated on language change. */
  protected readonly visibilityOptions = computed(() => {
    this.transloco.getActiveLang();
    return buildVisibilityOptions(this.transloco);
  });

  /** True once the user has manually touched any vis_* control (suppresses team prefill). */
  private visTouchedByUser = false;
  /** Program id the vis_* controls were last prefilled from (avoids redundant fetches). */
  private prefilledForProgramId: number | null = null;

  protected readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.maxLength(100)]],
      refer_program_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
      goal: ['', [Validators.maxLength(100)]],
      location: ['', [Validators.maxLength(255)]],
      equipment: [''],
      date: this.fb.nonNullable.control<Date | null>(null, [Validators.required]),
      hour_start: this.fb.nonNullable.control<Date | null>(null),
      hour_end: this.fb.nonNullable.control<Date | null>(null),
      total: this.fb.nonNullable.control<number>(0, [Validators.min(0)]),
      color: ['#3B82F6', [Validators.maxLength(10)]],
      vis_distance: this.fb.nonNullable.control<VisibilityMode>(VisibilityMode.Always),
      vis_goal: this.fb.nonNullable.control<VisibilityMode>(VisibilityMode.Always),
      vis_rounds: this.fb.nonNullable.control<VisibilityMode>(VisibilityMode.Always),
    },
    { validators: [timeRangeValidator] },
  );

  ngOnInit(): void {
    this.loadAvailablePrograms();

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        this.notifyLoadError();
        return;
      }
      this.eventId.set(id);
      this.loadEvent(id);
    } else {
      // On CREATE, prefill the per-event visibility from the chosen program's team
      // defaults — unless the user has already overridden them.
      this.form.controls.refer_program_id.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((pid) => this.prefillVisFromTeam(pid));

      const programParam = this.route.snapshot.queryParamMap.get('program');
      if (programParam) {
        const pid = Number(programParam);
        if (Number.isFinite(pid)) {
          this.form.patchValue({ refer_program_id: pid });
          this.form.controls.refer_program_id.disable();
          this.prefillVisFromTeam(pid);
        }
      }
    }
  }

  /** Mark the visibility controls as user-overridden so team prefill stops. */
  protected onVisChanged(): void {
    this.visTouchedByUser = true;
  }

  /**
   * Prefill the 3 vis_* selects from the selected program's team defaults.
   * No-op once the user has manually changed a visibility value.
   */
  private prefillVisFromTeam(programId: number | null | undefined): void {
    if (this.visTouchedByUser || programId == null) return;
    if (this.prefilledForProgramId === programId) return;
    const program = this.availablePrograms().find((p) => p.id === programId);
    const teamId = program?.team_id ?? program?.team?.id ?? null;
    if (teamId == null) return;
    this.prefilledForProgramId = programId;
    this.teamsService
      .teamsRetrieve(teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          if (this.visTouchedByUser) return;
          this.form.patchValue(
            {
              vis_distance: t.vis_distance ?? VisibilityMode.Always,
              vis_goal: t.vis_goal ?? VisibilityMode.Always,
              vis_rounds: t.vis_rounds ?? VisibilityMode.Always,
            },
            { emitEvent: false },
          );
        },
      });
  }

  private loadAvailablePrograms(): void {
    this.teamsService
      .teamsList(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const teamIds = (res.results ?? []).map((t) => t.id);
          this.fetchProgramsForTeams(teamIds);
        },
      });
  }

  private async fetchProgramsForTeams(teamIds: number[]): Promise<void> {
    if (teamIds.length === 0) {
      this.availablePrograms.set([]);
      return;
    }
    const requests = teamIds.map((teamId) =>
      firstValueFrom(
        this.programsService.programsList(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          teamId,
        ),
      ),
    );
    const responses = await Promise.all(requests);
    const all: Program[] = responses.flatMap((r) => r.results ?? []);
    const dedup = new Map<number, Program>();
    for (const p of all) dedup.set(p.id, p);
    this.availablePrograms.set(Array.from(dedup.values()));
  }

  private loadEvent(id: number): void {
    this.loading.set(true);
    this.eventsService
      .eventsRetrieve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => {
          this.form.reset({
            name: e.name,
            refer_program_id: e.refer_program?.id ?? null,
            goal: e.goal ?? '',
            location: e.location ?? '',
            equipment: e.equipment ?? '',
            date: parseDate(e.date),
            hour_start: parseTime(e.hour_start),
            hour_end: parseTime(e.hour_end),
            total: e.total ?? 0,
            color: e.color || '#3B82F6',
            vis_distance: e.vis_distance ?? VisibilityMode.Always,
            vis_goal: e.vis_goal ?? VisibilityMode.Always,
            vis_rounds: e.vis_rounds ?? VisibilityMode.Always,
          });
          this.form.controls.refer_program_id.disable();
          this.loading.set(false);
        },
        error: () => {
          this.notifyLoadError();
          this.loading.set(false);
        },
      });
  }

  private notifyLoadError(): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('events.errors.unknown'),
    });
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  protected cancel(): void {
    const id = this.eventId();
    this.router.navigate(id ? ['/events', id] : ['/events']);
  }

  protected submit(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    const id = this.eventId();

    if (id === null) {
      const createPayload = {
        name: value.name,
        refer_program_id: value.refer_program_id,
        goal: value.goal || null,
        location: value.location || '',
        equipment: value.equipment || '',
        date: toIsoDate(value.date),
        hour_start: toIsoTime(value.hour_start),
        hour_end: toIsoTime(value.hour_end),
        total: value.total,
        color: value.color,
        vis_distance: value.vis_distance,
        vis_goal: value.vis_goal,
        vis_rounds: value.vis_rounds,
      };
      this.eventsService
        .eventsCreate(createPayload as unknown as Event)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.notifySaved();
            this.saving.set(false);
            this.router.navigate(['/events', created.id]);
          },
          error: (err: HttpErrorResponse) => {
            this.applyServerError(err);
            this.saving.set(false);
          },
        });
      return;
    }

    const updatePayload: PatchedEvent = {
      name: value.name,
      refer_program_id: value.refer_program_id ?? undefined,
      goal: value.goal || undefined,
      location: value.location ?? '',
      equipment: value.equipment ?? '',
      date: toIsoDate(value.date) ?? undefined,
      hour_start: toIsoTime(value.hour_start) ?? undefined,
      hour_end: toIsoTime(value.hour_end) ?? undefined,
      total: value.total,
      color: value.color,
      vis_distance: value.vis_distance,
      vis_goal: value.vis_goal,
      vis_rounds: value.vis_rounds,
    };

    this.eventsService
      .eventsPartialUpdate(id, updatePayload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifySaved();
          this.saving.set(false);
          this.router.navigate(['/events', id]);
        },
        error: (err: HttpErrorResponse) => {
          this.applyServerError(err);
          this.saving.set(false);
        },
      });
  }

  private notifySaved(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate('events.form.saved'),
    });
  }

  private applyServerError(err: HttpErrorResponse): void {
    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: detail ? this.transloco.translate(detail) : this.transloco.translate('events.errors.unknown'),
      });
    }
  }
}
