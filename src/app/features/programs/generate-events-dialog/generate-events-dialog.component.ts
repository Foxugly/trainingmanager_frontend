import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { RouterLink } from '@angular/router';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { GeneratePlanRequestRequest } from '../../../api/model/generate-plan-request-request';
import { OverlapStrategyEnum } from '../../../api/model/overlap-strategy-enum';
import { Program } from '../../../api/model/program';
import { TrainingTemplate } from '../../../api/model/training-template';
import { AiErrorMappingService } from '../../ai/ai-error-mapping.service';
import { shortTime } from '../../../shared/datetime/short-time';

export interface GenerateEventsResult {
  created: number;
  deleted: number;
  rationale: string;
}

function toIsoDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

@Component({
  selector: 'app-generate-events-dialog',
  imports: [
    ReactiveFormsModule,
    Dialog,
    DatePicker,
    InputNumber,
    Textarea,
    Select,
    Button,
    Message,
    ProgressSpinner,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './generate-events-dialog.component.html',
  styleUrl: './generate-events-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateEventsDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly aiErrorMapping = inject(AiErrorMappingService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly program = input.required<Program>();
  readonly visible = model<boolean>(false);
  readonly generated = output<GenerateEventsResult>();

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** The team's weekly training template (null until loaded / when none). */
  protected readonly template = signal<TrainingTemplate | null>(null);
  /** Team id the template was last loaded for (avoids redundant fetches). */
  private templateLoadedForTeamId: number | null = null;

  /** True when the team defines a weekly template with at least one slot. */
  protected readonly hasTemplate = computed(() => (this.template()?.slots?.length ?? 0) > 0);

  /** Human-readable one-line summary of the template slots + default pool. */
  protected readonly templateSummary = computed(() => {
    const tpl = this.template();
    if (!tpl || !tpl.slots?.length) return '';
    this.transloco.getActiveLang();
    const dayKeys = [
      'training_template.weekday_short.monday',
      'training_template.weekday_short.tuesday',
      'training_template.weekday_short.wednesday',
      'training_template.weekday_short.thursday',
      'training_template.weekday_short.friday',
      'training_template.weekday_short.saturday',
      'training_template.weekday_short.sunday',
    ];
    const parts = tpl.slots.map((s) => {
      const day = this.transloco.translate(dayKeys[s.weekday] ?? '');
      return `${day} ${shortTime(s.hour_start)}–${shortTime(s.hour_end)}`;
    });
    let summary = parts.join(', ');
    if (tpl.default_pool) summary += ` · ${tpl.default_pool}`;
    return summary;
  });

  protected readonly form = this.fb.nonNullable.group({
    date_start: this.fb.nonNullable.control<Date | null>(null, [Validators.required]),
    date_end: this.fb.nonNullable.control<Date | null>(null, [Validators.required]),
    frequency_per_week: this.fb.nonNullable.control<number>(3, [
      Validators.required,
      Validators.min(1),
      Validators.max(14),
    ]),
    description: [''],
    overlap_strategy: this.fb.nonNullable.control<'add_only' | 'replace'>('add_only', [
      Validators.required,
    ]),
  });

  protected readonly overlapOptions = computed(() => [
    {
      value: 'add_only',
      label: this.transloco.translate('programs.generate.overlap.add_only'),
    },
    {
      value: 'replace',
      label: this.transloco.translate('programs.generate.overlap.replace'),
    },
  ]);

  /** Program start — the earliest a session may be generated (issue #12). */
  protected readonly minDate = computed(() => parseDate(this.program().date_start));
  /** Program end — the latest a session may be generated (issue #12). */
  protected readonly maxDate = computed(() => parseDate(this.program().date_end));

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const p = this.program();
      this.form.reset({
        date_start: this.defaultStartDate(p),
        date_end: parseDate(p.date_end),
        frequency_per_week: 3,
        description: p.description ?? '',
        overlap_strategy: 'add_only',
      });
      this.errorMessage.set(null);
      this.loadTemplate(p);
    });
  }

  /**
   * Default generation start (issue #12): today when it falls inside the
   * program window, otherwise the program's own start date. Never earlier than
   * the program start.
   */
  private defaultStartDate(p: Program): Date | null {
    const start = parseDate(p.date_start);
    const end = parseDate(p.date_end);
    if (start && end) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (today >= start && today <= end) return today;
    }
    return start;
  }

  /**
   * Fetch the program team's weekly training template. When the template has
   * slots, the frequency field is derived server-side: it's hidden + its
   * validators dropped, and date_start/date_end are pre-filled from the
   * season window when present.
   */
  private loadTemplate(program: Program): void {
    const teamId = program.team?.id ?? null;
    if (teamId == null) return;
    if (this.templateLoadedForTeamId === teamId && this.template() !== null) {
      this.applyTemplate(this.template());
      return;
    }
    this.templateLoadedForTeamId = teamId;
    this.teamsService
      .teamsTrainingTemplateRetrieve({ id: teamId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tpl) => {
          this.template.set(tpl);
          this.applyTemplate(tpl);
        },
        error: () => {
          this.template.set(null);
          this.templateLoadedForTeamId = null;
        },
      });
  }

  /**
   * Toggle the frequency validators from the template. The generation window is
   * governed by the program's own dates (issue #12), so the team's season window
   * no longer overrides date_start/date_end here.
   */
  private applyTemplate(tpl: TrainingTemplate | null): void {
    const freq = this.form.controls.frequency_per_week;
    if (tpl && (tpl.slots?.length ?? 0) > 0) {
      freq.clearValidators();
      freq.updateValueAndValidity();
    } else {
      freq.setValidators([Validators.required, Validators.min(1), Validators.max(14)]);
      freq.updateValueAndValidity();
    }
  }

  protected submit(): void {
    if (this.form.invalid) return;

    this.loading.set(true);
    this.errorMessage.set(null);

    const value = this.form.getRawValue();
    const payload: GeneratePlanRequestRequest = {
      date_start: toIsoDate(value.date_start),
      date_end: toIsoDate(value.date_end),
      // When the team has a weekly template, the backend derives the frequency
      // from its slots — omit frequency_per_week entirely.
      ...(this.hasTemplate() ? {} : { frequency_per_week: value.frequency_per_week }),
      description: value.description || undefined,
      // The form control is constrained to the enum's string values; narrow to
      // the enum type (the values are identical strings).
      overlap_strategy: value.overlap_strategy as OverlapStrategyEnum,
    };

    this.programsService
      .programsGenerateEventsCreate({
        id: this.program().id,
        generatePlanRequestRequest: payload,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.visible.set(false);
          this.generated.emit({
            created: res.created_count,
            deleted: res.deleted_count,
            rationale: res.rationale,
          });
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.applyError(err);
        },
      });
  }

  protected cancel(): void {
    if (this.loading()) return;
    this.visible.set(false);
  }

  private applyError(err: HttpErrorResponse): void {
    const info = this.aiErrorMapping.map(err);
    if (info.retryAfterSeconds != null) {
      this.errorMessage.set(
        this.transloco.translate(info.i18nKey, {
          minutes: Math.ceil(info.retryAfterSeconds / 60),
        }),
      );
    } else {
      this.errorMessage.set(this.transloco.translate(info.i18nKey));
    }
  }
}
