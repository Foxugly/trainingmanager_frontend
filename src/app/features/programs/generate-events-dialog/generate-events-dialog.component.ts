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
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { ProgramsService } from '../../../api/api/programs.service';
import { GeneratePlanRequest } from '../../../api/model/generate-plan-request';
import { OverlapStrategyEnum } from '../../../api/model/overlap-strategy-enum';
import { Program } from '../../../api/model/program';
import { AiErrorMappingService } from '../../ai/ai-error-mapping.service';

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
    TranslocoPipe,
  ],
  templateUrl: './generate-events-dialog.component.html',
  styleUrl: './generate-events-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateEventsDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly programsService = inject(ProgramsService);
  private readonly aiErrorMapping = inject(AiErrorMappingService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly program = input.required<Program>();
  readonly visible = model<boolean>(false);
  readonly generated = output<GenerateEventsResult>();

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

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

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const p = this.program();
      this.form.reset({
        date_start: parseDate(p.date_start),
        date_end: parseDate(p.date_end),
        frequency_per_week: p.frequency_per_week ?? 3,
        description: p.description ?? '',
        overlap_strategy: 'add_only',
      });
      this.errorMessage.set(null);
    });
  }

  protected submit(): void {
    if (this.form.invalid) return;

    this.loading.set(true);
    this.errorMessage.set(null);

    const value = this.form.getRawValue();
    const payload: GeneratePlanRequest = {
      date_start: toIsoDate(value.date_start),
      date_end: toIsoDate(value.date_end),
      frequency_per_week: value.frequency_per_week,
      description: value.description || undefined,
      overlap_strategy: value.overlap_strategy as unknown as OverlapStrategyEnum,
    };

    this.programsService
      .programsGenerateEventsCreate(this.program().id, payload)
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
