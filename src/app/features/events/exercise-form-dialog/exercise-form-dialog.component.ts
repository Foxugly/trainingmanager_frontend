import { CommonModule, KeyValuePipe } from '@angular/common';
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
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
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

interface FieldErrors {
  [field: string]: string[];
}

@Component({
  selector: 'app-exercise-form-dialog',
  imports: [
    CommonModule,
    KeyValuePipe,
    ReactiveFormsModule,
    Button,
    Dialog,
    InputNumber,
    InputText,
    Message,
    Select,
    Textarea,
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
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    modality_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    energysegment_id: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    repetition: [1, [Validators.required, Validators.min(1)]],
    distance: [50, [Validators.required, Validators.min(0)]],
    t_start: [''],
    t_break: [''],
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
        this.errorMessage.set(null);
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
    this.errorMessage.set(null);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue();
    if (this.mode() === 'create') {
      const round = this.roundId();
      if (round == null) {
        this.errorMessage.set('events.errors.unknown');
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
        this.errorMessage.set('events.errors.unknown');
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
    const body = err?.error as
      | { code?: string; detail?: string; fields?: FieldErrors }
      | null
      | undefined;

    if (body?.code === 'not_authorized_round') {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('events.exercise_form.errors.not_authorized_round'),
      });
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

    this.errorMessage.set(body?.detail ?? 'events.errors.unknown');
  }
}
