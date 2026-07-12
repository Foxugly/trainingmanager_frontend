import { NgTemplateOutlet } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tooltip } from 'primeng/tooltip';
import { catchError, distinctUntilChanged, filter, firstValueFrom, forkJoin, of, switchMap, tap } from 'rxjs';
import { EnergySegmentsService } from '../../../api/api/energy-segments.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { SportsService } from '../../../api/api/sports.service';
import { EnergySegment } from '../../../api/model/energy-segment';
import { Exercise } from '../../../api/model/exercise';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Modality } from '../../../api/model/modality';
import { Round } from '../../../api/model/round';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { ToastService } from '../../../core/notifications/toast.service';
import { timeMmSsValidator } from '../shared/time-validator';

/** Reactive form for an inline exercise row (create or edit). */
type ExerciseRowForm = FormGroup<{
  modality_id: import('@angular/forms').FormControl<number | null>;
  energysegment_id: import('@angular/forms').FormControl<number | null>;
  repetition: import('@angular/forms').FormControl<number>;
  distance: import('@angular/forms').FormControl<number>;
  t_start: import('@angular/forms').FormControl<string>;
  t_break: import('@angular/forms').FormControl<string>;
  notes: import('@angular/forms').FormControl<string>;
}>;

/** A freshly-added (not yet persisted) exercise row. */
interface NewExerciseRow {
  /** stable client-side key for tracking + form lookup */
  key: string;
}

/**
 * The exercise-row editor for a single round: the ordered exercise list with
 * inline add/edit/delete + drag-drop/keyboard reorder. Self-contained — it owns
 * the per-row reactive forms, the modality/energy-segment option lists and the
 * exercise CRUD + reorder calls scoped to its round.
 *
 * Wiring: the parent (event-training) passes the `round`, its `exercises`, the
 * `sportId`/`language` context for the option lists and the `canManage` flag. It
 * emits `(exercisesChanged)` with the round's fresh exercise list after any
 * inline mutation so the parent can recompute totals, and `(reloadRequested)`
 * after a delete (which needs a full event refetch). Extracted from
 * event-training.
 */
@Component({
  selector: 'app-round-exercises',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    Button,
    ConfirmDialog,
    InputNumber,
    InputText,
    Select,
    Tooltip,
    TranslocoPipe,
  ],
  templateUrl: './round-exercises.component.html',
  styleUrl: './round-exercises.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoundExercisesComponent {
  private readonly exercisesService = inject(ExercisesService);
  private readonly roundsService = inject(RoundsService);
  private readonly sportsService = inject(SportsService);
  private readonly energySegmentsService = inject(EnergySegmentsService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly round = input.required<Round>();
  readonly exercises = input.required<Exercise[]>();
  /** Sport whose modalities feed the option list (event sport, team fallback). */
  readonly sportId = input<number | null>(null);
  /** Language stamped on newly-created exercises. */
  readonly language = input<string>('fr');
  readonly canManage = input(false);

  /** The round's exercise list after an inline create/edit/reorder. */
  readonly exercisesChanged = output<Exercise[]>();
  /** Ask the parent to refetch the event after a mutation that changed it. */
  readonly reloadRequested = output<void>();

  /** Local working copy of the round's exercises (kept in sync with the input). */
  protected readonly localExercises = signal<Exercise[]>([]);

  // --- Inline exercise editing state ---
  /** Id of the existing exercise currently in inline-edit mode (null = none). */
  protected readonly editingExerciseId = signal<number | null>(null);
  /** Freshly-added rows (not yet persisted), keyed by client key. */
  protected readonly newRows = signal<NewExerciseRow[]>([]);
  /** Exercise option lists, loaded once the sport is known. */
  protected readonly modalities = signal<Modality[]>([]);
  protected readonly energySegments = signal<EnergySegment[]>([]);
  protected readonly loadingOptions = signal(false);
  /** Per-row save-in-flight flag, keyed by row key (ex-<id> or the new-row key). */
  protected readonly savingRows = signal<Set<string>>(new Set());
  /** Per-row server field errors, keyed by row key. */
  protected readonly rowFieldErrors = signal<Map<string, FieldErrors>>(new Map());
  /** Active reactive form groups, keyed by row key. */
  private readonly rowForms = new Map<string, ExerciseRowForm>();
  private newRowSeq = 0;

  protected readonly reordering = signal(false);

  protected readonly hasNewRows = computed(() => this.newRows().length > 0);

  constructor() {
    // Mirror the exercises input into a local working copy that the inline
    // mutations (create/edit/reorder) update optimistically. Re-syncs whenever
    // the parent feeds a fresh list (e.g. after a reload).
    effect(() => {
      const list = this.exercises();
      untracked(() => this.localExercises.set([...list]));
    });

    // Load modality + energy-segment option lists once the sport is known, so
    // inline edit/add rows have their selects ready. toObservable(sportId) →
    // switchMap cancels an in-flight fetch when the sport changes again;
    // distinctUntilChanged dedupes repeat emissions of the same sport.
    toObservable(this.sportId)
      .pipe(
        filter((sportId): sportId is number => sportId != null),
        distinctUntilChanged(),
        tap(() => this.loadingOptions.set(true)),
        switchMap((sportId) =>
          forkJoin({
            mods: this.sportsService.sportsModalitiesList({ sportPk: sportId }),
            segs: this.energySegmentsService.energySegmentsList(),
          }).pipe(
            tap(({ mods, segs }) => {
              this.modalities.set((mods.results ?? []).filter((m) => m.is_active));
              this.energySegments.set((segs.results ?? []).filter((s) => s.is_active));
            }),
            catchError(() => {
              this.modalities.set([]);
              this.energySegments.set([]);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadingOptions.set(false));
  }

  // --- Distance helpers -------------------------------------------------------

  protected exerciseDistance(ex: Exercise): number {
    const rep = ex.repetition ?? 1;
    const dist = ex.distance ?? 0;
    return rep * dist;
  }

  protected hasNonZeroTime(value: string | null | undefined): boolean {
    if (!value) return false;
    return /[1-9]/.test(value);
  }

  // --- Option lists -----------------------------------------------------------

  protected hasOptions(): boolean {
    return this.modalities().length > 0 && this.energySegments().length > 0;
  }

  /** Option label for an energy segment: "abv — description" when present, else "abv". */
  protected segmentLabel(seg: EnergySegment): string {
    return seg.description ? `${seg.abv} — ${seg.description}` : seg.abv;
  }

  // --- Row form helpers -------------------------------------------------------

  private buildRowForm(ex: Exercise | null, prefill?: Partial<Exercise>): ExerciseRowForm {
    const src = ex ?? prefill ?? {};
    return this.fb.nonNullable.group({
      modality_id: this.fb.nonNullable.control<number | null>(
        src.modality?.id ?? null,
        [Validators.required],
      ),
      energysegment_id: this.fb.nonNullable.control<number | null>(
        src.energysegment?.id ?? null,
        [Validators.required],
      ),
      repetition: this.fb.nonNullable.control<number>(src.repetition ?? 1, [
        Validators.required,
        Validators.min(1),
      ]),
      distance: this.fb.nonNullable.control<number>(src.distance ?? 50, [
        Validators.required,
        Validators.min(0),
      ]),
      t_start: this.fb.nonNullable.control<string>(src.t_start ?? '', [timeMmSsValidator]),
      t_break: this.fb.nonNullable.control<string>(src.t_break ?? '', [timeMmSsValidator]),
      notes: this.fb.nonNullable.control<string>(src.notes ?? ''),
    });
  }

  protected rowKeyForExercise(ex: Exercise): string {
    return `ex-${ex.id}`;
  }

  protected formFor(key: string): ExerciseRowForm | null {
    return this.rowForms.get(key) ?? null;
  }

  protected isEditingExercise(ex: Exercise): boolean {
    return this.editingExerciseId() === ex.id;
  }

  protected isSaving(key: string): boolean {
    return this.savingRows().has(key);
  }

  protected rowFieldError(key: string, name: string): string | null {
    return this.rowFieldErrors().get(key)?.[name]?.join(', ') ?? null;
  }

  // --- Inline add / edit ------------------------------------------------------

  /** Start editing an existing exercise inline. */
  protected startEditExercise(ex: Exercise): void {
    if (!this.canManage()) return;
    const key = this.rowKeyForExercise(ex);
    this.rowForms.set(key, this.buildRowForm(ex));
    this.clearRowError(key);
    this.editingExerciseId.set(ex.id);
  }

  /** Append a new inline row, pre-filled from the round's last exercise.
   *  Public so the parent's round-header "add exercise" button can trigger it
   *  via a template reference (the header lives in the parent). */
  startAddExercise(): void {
    if (!this.canManage()) return;
    const existing = this.localExercises();
    const last = existing.length > 0 ? existing[existing.length - 1] : null;
    const prefill: Partial<Exercise> | undefined = last
      ? {
          modality: last.modality,
          energysegment: last.energysegment,
          distance: last.distance,
          t_start: last.t_start,
          t_break: last.t_break,
          repetition: 1,
          notes: '',
        }
      : undefined;
    const key = `new-${this.newRowSeq++}`;
    this.rowForms.set(key, this.buildRowForm(null, prefill));
    this.clearRowError(key);
    this.newRows.update((rows) => [...rows, { key }]);
  }

  /** Cancel an existing-exercise edit: revert to display. */
  protected cancelEditExercise(ex: Exercise): void {
    const key = this.rowKeyForExercise(ex);
    this.rowForms.delete(key);
    this.clearRowError(key);
    this.editingExerciseId.set(null);
  }

  /** Cancel a freshly-added row: remove it entirely. */
  protected cancelNewRow(key: string): void {
    this.rowForms.delete(key);
    this.clearRowError(key);
    this.newRows.update((rows) => rows.filter((r) => r.key !== key));
  }

  /** Persist an existing-exercise edit via PATCH. */
  protected saveEditExercise(ex: Exercise): void {
    const key = this.rowKeyForExercise(ex);
    const form = this.rowForms.get(key);
    if (!form || form.invalid || this.isSaving(key) || !this.hasOptions()) return;
    this.setSaving(key, true);
    this.clearRowError(key);

    const value = form.getRawValue();
    // Pass the round this exercise belongs to so the backend can FORK-ON-EDIT
    // when the exercise is shared by several rounds (usage_count > 1): instead
    // of a 409 it clones the exercise with our change and swaps it into THIS
    // round, leaving the shared original untouched. The returned exercise may
    // therefore have a NEW id — we swap it in by the old id.
    const roundId = this.round().id;
    this.exercisesService
      .exercisesPartialUpdate({
        id: ex.id,
        patchedExerciseRequest: {
          modality_id: value.modality_id,
          energysegment_id: value.energysegment_id,
          repetition: value.repetition,
          distance: value.distance,
          t_start: value.t_start || null,
          t_break: value.t_break || null,
          notes: value.notes ?? '',
          round_id: roundId,
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.setSaving(key, false);
          this.rowForms.delete(key);
          this.editingExerciseId.set(null);
          this.replaceExercise(ex.id, updated);
          this.notifyExerciseSaved('events.exercise_form.updated');
        },
        error: (err: HttpErrorResponse) => {
          this.setSaving(key, false);
          this.applyRowError(key, err);
        },
      });
  }

  /** Persist a freshly-added row via POST (linked to the round via round_id). */
  protected saveNewRow(row: NewExerciseRow): void {
    const key = row.key;
    const form = this.rowForms.get(key);
    if (!form || form.invalid || this.isSaving(key) || !this.hasOptions()) return;
    this.setSaving(key, true);
    this.clearRowError(key);

    const value = form.getRawValue();
    const payload = {
      round_id: this.round().id,
      modality_id: value.modality_id,
      energysegment_id: value.energysegment_id,
      repetition: value.repetition,
      distance: value.distance,
      t_start: value.t_start || null,
      t_break: value.t_break || null,
      notes: value.notes ?? '',
      language: (this.language() ?? 'fr') as LanguageEnum,
    };
    this.exercisesService
      .exercisesCreate({ exerciseRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.setSaving(key, false);
          this.rowForms.delete(key);
          this.newRows.update((rows) => rows.filter((r) => r.key !== key));
          this.appendExercise(created);
          this.notifyExerciseSaved('events.exercise_form.created');
        },
        error: (err: HttpErrorResponse) => {
          this.setSaving(key, false);
          this.applyRowError(key, err);
        },
      });
  }

  private appendExercise(ex: Exercise): void {
    const next = [...this.localExercises(), ex];
    this.localExercises.set(next);
    this.exercisesChanged.emit(next);
  }

  /** Replace the exercise matched by `oldId` with `ex` (whose id may differ
   *  after a fork-on-edit). */
  private replaceExercise(oldId: number, ex: Exercise): void {
    const list = this.localExercises();
    const idx = list.findIndex((e) => e.id === oldId);
    if (idx < 0) return;
    const next = [...list];
    next[idx] = ex;
    this.localExercises.set(next);
    this.exercisesChanged.emit(next);
  }

  // --- Reorder ----------------------------------------------------------------

  protected onExerciseDrop(event: CdkDragDrop<Exercise[]>): void {
    if (this.reordering()) return;
    if (event.previousIndex === event.currentIndex) return;
    const reordered = [...this.localExercises()];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    this.persistExerciseReorder(reordered);
  }

  /** Keyboard-operable exercise reorder (the ↑/↓ buttons), mirroring the round
   *  reorder — so reordering doesn't depend on drag-drop alone (a11y). */
  protected moveExercise(ex: Exercise, direction: 'up' | 'down'): void {
    if (this.reordering()) return;
    const list = this.localExercises();
    const idx = list.findIndex((e) => e.id === ex.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;
    const reordered = [...list];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    this.persistExerciseReorder(reordered);
  }

  /** Optimistically apply a new exercise order + persist it; roll back on error.
   *  Shared by drag-drop and the ↑/↓ buttons. */
  private persistExerciseReorder(reordered: Exercise[]): void {
    const original = this.localExercises();
    const renumbered = reordered.map((ex, i) => ({ ...ex, order: i + 1 }));
    this.localExercises.set(renumbered);
    this.exercisesChanged.emit(renumbered);

    this.reordering.set(true);
    firstValueFrom(
      this.roundsService.roundsExercisesReorderCreate({
        id: this.round().id,
        reorderExercisesRequestRequest: { exercise_ids: renumbered.map((ex) => ex.id) },
      }),
    )
      .catch((err: HttpErrorResponse) => {
        this.localExercises.set(original);
        this.exercisesChanged.emit(original);
        this.notifyReorderError(err);
      })
      .finally(() => this.reordering.set(false));
  }

  private notifyReorderError(err: HttpErrorResponse): void {
    const body = err?.error as { code?: string; detail?: string } | null | undefined;
    const REORDER_CODES = new Set([
      'empty_list',
      'duplicate_id',
      'scope_mismatch',
      'incomplete_reorder',
      'not_authorized_event',
      'not_authorized_round',
    ]);
    const i18nKey =
      body?.code && REORDER_CODES.has(body.code)
        ? `events.detail.reorder_errors.${body.code}`
        : 'events.detail.reorder_errors.unknown';
    this.toast.error(i18nKey);
  }

  // --- Delete -----------------------------------------------------------------

  protected confirmDeleteExercise(ex: Exercise): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('events.detail.confirm_delete_exercise.title'),
      message: this.transloco.translate('events.detail.confirm_delete_exercise.message'),
      acceptLabel: this.transloco.translate('events.detail.confirm_delete_exercise.accept'),
      rejectLabel: this.transloco.translate('events.detail.confirm_delete_exercise.reject'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteExercise(ex),
    });
  }

  private deleteExercise(ex: Exercise): void {
    this.exercisesService
      .exercisesDestroy({ id: ex.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('events.detail.confirm_delete_exercise.deleted');
          this.reloadRequested.emit();
        },
        error: (err: HttpErrorResponse) => this.notifyMutationError(err),
      });
  }

  // --- Notifications + error mapping ------------------------------------------

  private notifyExerciseSaved(detailKey: string): void {
    this.toast.success(detailKey);
  }

  private setSaving(key: string, on: boolean): void {
    this.savingRows.update((set) => {
      const next = new Set(set);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  private clearRowError(key: string): void {
    this.rowFieldErrors.update((map) => {
      if (!map.has(key)) return map;
      const next = new Map(map);
      next.delete(key);
      return next;
    });
  }

  private applyRowError(key: string, err: HttpErrorResponse): void {
    const code = (err?.error as { code?: string } | null | undefined)?.code;
    if (code === 'not_authorized_round') {
      this.notifyGlobalError('events.exercise_form.errors.not_authorized_round');
      return;
    }
    const { fields, detail } = extractServerError(err);
    if (fields) {
      this.rowFieldErrors.update((map) => {
        const next = new Map(map);
        next.set(key, fields);
        return next;
      });
    } else {
      this.notifyGlobalError(detail ?? 'events.errors.unknown');
    }
  }

  private notifyGlobalError(detailKey: string): void {
    this.toast.error(detailKey);
  }

  private notifyMutationError(err: HttpErrorResponse): void {
    const detailKey = err?.status === 403 ? 'events.errors.forbidden' : 'events.errors.unknown';
    this.toast.error(detailKey);
  }
}
