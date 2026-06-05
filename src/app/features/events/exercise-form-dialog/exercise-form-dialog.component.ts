import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { firstValueFrom } from 'rxjs';
import { EnergySegmentsService } from '../../../api/api/energy-segments.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { SportsService } from '../../../api/api/sports.service';
import { EnergySegment } from '../../../api/model/energy-segment';
import { Exercise } from '../../../api/model/exercise';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Modality } from '../../../api/model/modality';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { timeMmSsValidator } from '../shared/time-validator';

@Component({
  selector: 'app-exercise-form-dialog',
  imports: [
    ReactiveFormsModule,
    Dialog,
    InputNumber,
    InputText,
    Select,
    Textarea,
    MetaFieldComponent,
    FormFooterComponent,
    TranslocoPipe,
  ],
  templateUrl: './exercise-form-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExerciseFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly exercisesService = inject(ExercisesService);
  private readonly sportsService = inject(SportsService);
  private readonly energySegmentsService = inject(EnergySegmentsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = input.required<boolean>();
  readonly mode = input.required<'create' | 'edit'>();
  readonly exercise = input<Exercise | null>(null);
  readonly roundId = input<number | null>(null);
  readonly sportId = input<number | null>(null);
  readonly language = input<string>('fr');

  readonly closed = output<Exercise | null>();

  protected readonly saving = signal(false);
  protected readonly loadingOptions = signal(false);
  protected readonly modalities = signal<Modality[]>([]);
  protected readonly energySegments = signal<EnergySegment[]>([]);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    modality_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    energysegment_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    repetition: [1, [Validators.required, Validators.min(1)]],
    distance: [50, [Validators.required, Validators.min(0)]],
    t_start: ['', [timeMmSsValidator]],
    t_break: ['', [timeMmSsValidator]],
    notes: [''],
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        const ex = this.exercise();
        this.form.reset({
          modality_id: ex?.modality_id ?? ex?.modality?.id ?? null,
          energysegment_id: ex?.energysegment_id ?? ex?.energysegment?.id ?? null,
          repetition: ex?.repetition ?? 1,
          distance: ex?.distance ?? 50,
          t_start: ex?.t_start ?? '',
          t_break: ex?.t_break ?? '',
          notes: ex?.notes ?? '',
        });
        this.fieldErrors.set(null);
        void this.loadOptions();
      }
    });
  }

  private async loadOptions(): Promise<void> {
    const sport = this.sportId();
    if (sport == null) return;
    this.loadingOptions.set(true);
    try {
      const [modList, segList] = await Promise.all([
        firstValueFrom(this.sportsService.sportsModalitiesList(sport)),
        firstValueFrom(this.energySegmentsService.energySegmentsList()),
      ]);
      this.modalities.set((modList.results ?? []).filter((m) => m.is_active));
      this.energySegments.set((segList.results ?? []).filter((s) => s.is_active));
    } catch (_err) {
      this.modalities.set([]);
      this.energySegments.set([]);
    } finally {
      this.loadingOptions.set(false);
    }
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  protected onCancel(): void {
    if (this.saving()) return;
    this.closed.emit(null);
  }

  protected onVisibleChange(value: boolean): void {
    if (!value && !this.saving()) {
      this.closed.emit(null);
    }
  }

  protected hasOptions(): boolean {
    return this.modalities().length > 0 && this.energySegments().length > 0;
  }

  protected submit(): void {
    if (this.form.invalid || this.saving() || !this.hasOptions()) return;
    this.saving.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    if (this.mode() === 'create') {
      const round = this.roundId();
      if (round == null) {
        this.notifyGlobalError('events.errors.unknown');
        this.saving.set(false);
        return;
      }
      const payload = {
        round_id: round,
        modality_id: value.modality_id,
        energysegment_id: value.energysegment_id,
        repetition: value.repetition,
        distance: value.distance,
        t_start: value.t_start || null,
        t_break: value.t_break || null,
        notes: value.notes ?? '',
        language: this.language() as LanguageEnum,
      };
      this.exercisesService
        .exercisesCreate(payload as unknown as Exercise)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            this.saving.set(false);
            this.closed.emit(created);
          },
          error: (err: HttpErrorResponse) => {
            this.saving.set(false);
            this.applyServerError(err);
          },
        });
    } else {
      const ex = this.exercise();
      if (!ex) {
        this.notifyGlobalError('events.errors.unknown');
        this.saving.set(false);
        return;
      }
      this.exercisesService
        .exercisesPartialUpdate(ex.id, {
          modality_id: value.modality_id,
          energysegment_id: value.energysegment_id,
          repetition: value.repetition,
          distance: value.distance,
          t_start: value.t_start || null,
          t_break: value.t_break || null,
          notes: value.notes ?? '',
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (updated) => {
            this.saving.set(false);
            this.closed.emit(updated);
          },
          error: (err: HttpErrorResponse) => {
            this.saving.set(false);
            this.applyServerError(err);
          },
        });
    }
  }

  private applyServerError(err: HttpErrorResponse): void {
    const code = (err?.error as { code?: string } | null | undefined)?.code;
    if (code === 'not_authorized_round') {
      this.notifyGlobalError('events.exercise_form.errors.not_authorized_round');
      return;
    }

    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.notifyGlobalError(detail ?? 'events.errors.unknown');
    }
  }

  private notifyGlobalError(detailKey: string): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(detailKey),
    });
  }
}
