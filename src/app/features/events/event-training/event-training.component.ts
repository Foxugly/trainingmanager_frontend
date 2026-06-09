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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Fieldset } from 'primeng/fieldset';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tooltip } from 'primeng/tooltip';
import { firstValueFrom } from 'rxjs';
import { EnergySegmentsService } from '../../../api/api/energy-segments.service';
import { EventsService } from '../../../api/api/events.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { SportsService } from '../../../api/api/sports.service';
import { EnergySegment } from '../../../api/model/energy-segment';
import { Event } from '../../../api/model/event';
import { Exercise } from '../../../api/model/exercise';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Modality } from '../../../api/model/modality';
import { Round } from '../../../api/model/round';
import { Team } from '../../../api/model/team';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { type FieldErrors, extractServerError } from '../../../shared/forms/notify-error';
import { RoundFormDialogComponent } from '../round-form-dialog/round-form-dialog.component';
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

/** A freshly-added (not yet persisted) exercise row pinned to a round. */
interface NewExerciseRow {
  /** stable client-side key for tracking + form lookup */
  key: string;
  roundId: number;
}

/** Aggregate state the parent needs from the training editor: the computed
 *  total distance (for the header + the event.total auto-patch) and whether the
 *  rounds are still loading (to gate that patch + the "hidden rounds" hint). */
export interface TrainingState {
  totalDistance: number;
  loading: boolean;
}

/**
 * The session's training editor: the ordered training blocks (rounds) and their
 * exercises, with inline add/edit/delete + drag-drop reorder and the round
 * create/edit dialog. Self-contained — it owns the rounds/exercises data, the
 * modality/energy-segment option lists and the per-row reactive forms.
 *
 * Wiring: the parent passes the `event` (the editor loads its rounds from
 * `event.rounds`), the resolved `team` and the `canManage`/`restrictedViewer`
 * flags. It emits `(stateChange)` (total distance + loading, for the header and
 * the event.total auto-patch the parent still owns) and `(reloadRequested)`
 * after any mutation that changes the event (so the parent refetches it and
 * feeds a fresh `event` back down). Extracted from events-detail.
 */
@Component({
  selector: 'app-event-training',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    Button,
    ConfirmDialog,
    Fieldset,
    InputNumber,
    InputText,
    Select,
    Tooltip,
    TranslocoPipe,
    RoundFormDialogComponent,
  ],
  templateUrl: './event-training.component.html',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventTrainingComponent {
  private readonly eventsService = inject(EventsService);
  private readonly roundsService = inject(RoundsService);
  private readonly exercisesService = inject(ExercisesService);
  private readonly sportsService = inject(SportsService);
  private readonly energySegmentsService = inject(EnergySegmentsService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly event = input.required<Event>();
  readonly team = input<Team | null>(null);
  readonly canManage = input(false);
  /** A non-manager athlete with restricted visibility (drives the hidden hint). */
  readonly restrictedViewer = input(false);

  /** Total distance + loading, mirrored to the parent (header + total patch). */
  readonly stateChange = output<TrainingState>();
  /** Ask the parent to refetch the event after a mutation that changed it. */
  readonly reloadRequested = output<void>();

  protected readonly rounds = signal<Round[]>([]);
  protected readonly exercisesByRound = signal<Map<number, Exercise[]>>(new Map());

  protected readonly showRoundDialog = signal(false);
  protected readonly roundDialogMode = signal<'create' | 'edit'>('create');
  protected readonly editingRound = signal<Round | null>(null);

  // --- Inline exercise editing state ---
  /** Id of the existing exercise currently in inline-edit mode (null = none). */
  protected readonly editingExerciseId = signal<number | null>(null);
  /** Freshly-added rows (not yet persisted), one possible per round, keyed by client key. */
  protected readonly newRows = signal<NewExerciseRow[]>([]);
  /** Exercise option lists, loaded once the team's sport is known. */
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

  protected readonly totalDistance = computed<number>(() => {
    let total = 0;
    for (const round of this.rounds()) {
      total += this.roundTotalDistance(round);
    }
    return total;
  });

  /** True when the rounds detail is hidden from this athlete (mode after/never AND empty). */
  protected readonly roundsHidden = computed(() => {
    if (!this.restrictedViewer()) return false;
    const mode = this.event()?.vis_rounds ?? VisibilityMode.Always;
    if (mode === VisibilityMode.Always) return false;
    return this.rounds().length === 0;
  });

  protected readonly roundsHiddenVariant = computed<'never' | 'after'>(() =>
    this.event()?.vis_rounds === VisibilityMode.Never ? 'never' : 'after',
  );

  private optionsSportId: number | null = null;
  private loadedRoundIds: string | null = null;

  constructor() {
    // Rebuild rounds + exercises whenever the event's round id LIST changes.
    // The data is embedded in the event (rounds_detail) — no fetch — so this is
    // synchronous. Keying on the id list (not the whole event) means a
    // total-only patch, which mutates the event reference, doesn't rebuild.
    effect(() => {
      const ids = this.event().rounds ?? [];
      const key = ids.join(',');
      if (this.loadedRoundIds === key) return;
      this.loadedRoundIds = key;
      untracked(() => this.rebuildFromEvent());
    });

    // Load modality + energy-segment option lists once the session's sport is
    // known, so inline edit/add rows have their selects ready. Multi-sport:
    // scope to the event's own sport, falling back to the team default.
    effect(() => {
      const sportId = this.event().sport?.id ?? this.team()?.sport?.id ?? null;
      if (sportId == null) return;
      if (this.optionsSportId === sportId) return;
      this.optionsSportId = sportId;
      untracked(() => void this.loadOptions(sportId));
    });

    // Mirror total distance to the parent (it owns the header + event.total
    // auto-patch). Loading is always false now that rounds are embedded.
    effect(() => {
      this.stateChange.emit({ totalDistance: this.totalDistance(), loading: false });
    });
  }

  // --- Distance helpers -------------------------------------------------------

  protected exerciseDistance(ex: Exercise): number {
    const rep = ex.repetition ?? 1;
    const dist = ex.distance ?? 0;
    return rep * dist;
  }

  protected roundDistancePerIteration(round: Round): number {
    const exercises = this.exercisesByRound().get(round.id) ?? [];
    return exercises.reduce((sum, ex) => sum + this.exerciseDistance(ex), 0);
  }

  protected roundTotalDistance(round: Round): number {
    return (round.count ?? 1) * this.roundDistancePerIteration(round);
  }

  protected hasNonZeroTime(value: string | null | undefined): boolean {
    if (!value) return false;
    return /[1-9]/.test(value);
  }

  protected formatDistance(meters: number): string {
    if (meters >= 1000) {
      const km = meters / 1000;
      return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
    }
    return `${meters} m`;
  }

  // --- Rounds + exercises (built from the event's embedded rounds_detail) -----

  /** Build the rounds + per-round exercise map from the event's `rounds_detail`
   *  (embedded by the backend on retrieve). Synchronous — no fetch. After a
   *  mutation the child emits (reloadRequested); the parent refetches the event
   *  and feeds a fresh one back, which re-runs this. */
  private rebuildFromEvent(): void {
    const detail = this.event().rounds_detail ?? [];
    const sorted = [...detail].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.rounds.set(
      sorted.map(
        (rd) =>
          ({
            id: rd.id,
            order: rd.order,
            count: rd.count,
            t_start: rd.t_start,
            t_break: rd.t_break,
            sport: rd.sport,
            exercises: rd.exercises.map((e) => e.id),
          }) as unknown as Round,
      ),
    );
    const map = new Map<number, Exercise[]>();
    for (const rd of sorted) {
      map.set(rd.id, [...rd.exercises].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    }
    this.exercisesByRound.set(map);
  }

  // --- Round CRUD + reorder ---------------------------------------------------

  protected openCreateRound(): void {
    this.editingRound.set(null);
    this.roundDialogMode.set('create');
    this.showRoundDialog.set(true);
  }

  protected openEditRound(r: Round): void {
    this.editingRound.set(r);
    this.roundDialogMode.set('edit');
    this.showRoundDialog.set(true);
  }

  protected onRoundDialogClosed(round: Round | null): void {
    this.showRoundDialog.set(false);
    this.editingRound.set(null);
    if (round) {
      this.messageService.add({
        severity: 'success',
        summary: this.transloco.translate('common.success'),
        detail: this.transloco.translate(
          this.roundDialogMode() === 'create'
            ? 'events.round_form.created'
            : 'events.round_form.updated',
        ),
      });
      this.reloadRequested.emit();
    }
  }

  protected moveRound(r: Round, direction: 'up' | 'down'): void {
    if (this.reordering()) return;
    const eventId = this.event().id;

    const list = this.rounds();
    const idx = list.findIndex((x) => x.id === r.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;

    const reordered = [...list];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    const renumbered = reordered.map((round, i) => ({ ...round, order: i + 1 }));
    this.rounds.set(renumbered);

    this.reordering.set(true);
    firstValueFrom(
      this.eventsService.eventsRoundsReorderCreate({
        id: eventId,
        reorderRoundsRequest: { round_ids: renumbered.map((x) => x.id) },
      }),
    )
      .catch((err: HttpErrorResponse) => {
        this.rounds.set(list);
        this.notifyReorderError(err);
      })
      .finally(() => this.reordering.set(false));
  }

  protected onExerciseDrop(round: Round, event: CdkDragDrop<Exercise[]>): void {
    if (this.reordering()) return;
    if (event.previousIndex === event.currentIndex) return;
    const reordered = [...(this.exercisesByRound().get(round.id) ?? [])];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    this._persistExerciseReorder(round.id, reordered);
  }

  /** Keyboard-operable exercise reorder (the ↑/↓ buttons), mirroring moveRound —
   *  so reordering doesn't depend on drag-drop alone (a11y). */
  protected moveExercise(round: Round, ex: Exercise, direction: 'up' | 'down'): void {
    if (this.reordering()) return;
    const list = this.exercisesByRound().get(round.id) ?? [];
    const idx = list.findIndex((e) => e.id === ex.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;
    const reordered = [...list];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    this._persistExerciseReorder(round.id, reordered);
  }

  /** Optimistically apply a new exercise order for a round + persist it; roll
   *  back on error. Shared by drag-drop and the ↑/↓ buttons. */
  private _persistExerciseReorder(roundId: number, reordered: Exercise[]): void {
    const original = this.exercisesByRound().get(roundId) ?? [];
    const renumbered = reordered.map((ex, i) => ({ ...ex, order: i + 1 }));
    const map = new Map(this.exercisesByRound());
    map.set(roundId, renumbered);
    this.exercisesByRound.set(map);

    this.reordering.set(true);
    firstValueFrom(
      this.roundsService.roundsExercisesReorderCreate({
        id: roundId,
        reorderExercisesRequest: { exercise_ids: renumbered.map((ex) => ex.id) },
      }),
    )
      .catch((err: HttpErrorResponse) => {
        const rollback = new Map(this.exercisesByRound());
        rollback.set(roundId, original);
        this.exercisesByRound.set(rollback);
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
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(i18nKey),
    });
  }

  protected confirmDeleteRound(r: Round): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('events.detail.confirm_delete_round.title'),
      message: this.transloco.translate('events.detail.confirm_delete_round.message'),
      acceptLabel: this.transloco.translate('events.detail.confirm_delete_round.accept'),
      rejectLabel: this.transloco.translate('events.detail.confirm_delete_round.reject'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteRound(r),
    });
  }

  private deleteRound(r: Round): void {
    this.roundsService
      .roundsDestroy({ id: r.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.detail.confirm_delete_round.deleted'),
          });
          this.reloadRequested.emit();
        },
        error: (err: HttpErrorResponse) => this.notifyMutationError(err),
      });
  }

  // --- Inline exercise editing ------------------------------------------------

  private async loadOptions(sportId: number): Promise<void> {
    this.loadingOptions.set(true);
    try {
      const [modList, segList] = await Promise.all([
        firstValueFrom(this.sportsService.sportsModalitiesList({ sportPk: sportId })),
        firstValueFrom(this.energySegmentsService.energySegmentsList()),
      ]);
      this.modalities.set((modList.results ?? []).filter((m) => m.is_active));
      this.energySegments.set((segList.results ?? []).filter((s) => s.is_active));
    } catch {
      this.modalities.set([]);
      this.energySegments.set([]);
    } finally {
      this.loadingOptions.set(false);
    }
  }

  protected hasOptions(): boolean {
    return this.modalities().length > 0 && this.energySegments().length > 0;
  }

  /** Option label for an energy segment: "abv — description" when present, else "abv". */
  protected segmentLabel(seg: EnergySegment): string {
    return seg.description ? `${seg.abv} — ${seg.description}` : seg.abv;
  }

  private buildRowForm(ex: Exercise | null, prefill?: Partial<Exercise>): ExerciseRowForm {
    const src = ex ?? prefill ?? {};
    return this.fb.nonNullable.group({
      modality_id: this.fb.nonNullable.control<number | null>(
        src.modality_id ?? src.modality?.id ?? null,
        [Validators.required],
      ),
      energysegment_id: this.fb.nonNullable.control<number | null>(
        src.energysegment_id ?? src.energysegment?.id ?? null,
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

  protected newRowsFor(roundId: number): NewExerciseRow[] {
    return this.newRows().filter((r) => r.roundId === roundId);
  }

  /** Start editing an existing exercise inline. */
  protected startEditExercise(ex: Exercise): void {
    if (!this.canManage()) return;
    const key = this.rowKeyForExercise(ex);
    this.rowForms.set(key, this.buildRowForm(ex));
    this.clearRowError(key);
    this.editingExerciseId.set(ex.id);
  }

  /** Append a new inline row to a round, pre-filled from its last exercise. */
  protected startAddExercise(roundId: number): void {
    if (!this.canManage()) return;
    const existing = this.exercisesByRound().get(roundId) ?? [];
    const last = existing.length > 0 ? existing[existing.length - 1] : null;
    const prefill: Partial<Exercise> | undefined = last
      ? {
          modality_id: last.modality_id ?? last.modality?.id ?? null,
          energysegment_id: last.energysegment_id ?? last.energysegment?.id ?? null,
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
    this.newRows.update((rows) => [...rows, { key, roundId }]);
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
    const roundId = this.roundIdOfExercise(ex.id);
    this.exercisesService
      .exercisesPartialUpdate({
        id: ex.id,
        patchedExercise: {
          modality_id: value.modality_id,
          energysegment_id: value.energysegment_id,
          repetition: value.repetition,
          distance: value.distance,
          t_start: value.t_start || null,
          t_break: value.t_break || null,
          notes: value.notes ?? '',
          ...(roundId != null ? { round_id: roundId } : {}),
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.setSaving(key, false);
          this.rowForms.delete(key);
          this.editingExerciseId.set(null);
          this.replaceExerciseInRound(ex.id, updated);
          this.notifyExerciseSaved('events.exercise_form.updated');
        },
        error: (err: HttpErrorResponse) => {
          this.setSaving(key, false);
          this.applyRowError(key, err);
        },
      });
  }

  /** Persist a freshly-added row via POST (linked to its round via round_id). */
  protected saveNewRow(row: NewExerciseRow): void {
    const key = row.key;
    const form = this.rowForms.get(key);
    if (!form || form.invalid || this.isSaving(key) || !this.hasOptions()) return;
    this.setSaving(key, true);
    this.clearRowError(key);

    const value = form.getRawValue();
    const payload = {
      round_id: row.roundId,
      modality_id: value.modality_id,
      energysegment_id: value.energysegment_id,
      repetition: value.repetition,
      distance: value.distance,
      t_start: value.t_start || null,
      t_break: value.t_break || null,
      notes: value.notes ?? '',
      language: (this.team()?.language ?? 'fr') as LanguageEnum,
    };
    this.exercisesService
      .exercisesCreate({ exercise: payload as unknown as Exercise })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.setSaving(key, false);
          this.rowForms.delete(key);
          this.newRows.update((rows) => rows.filter((r) => r.key !== key));
          this.appendExerciseToRound(row.roundId, created);
          this.notifyExerciseSaved('events.exercise_form.created');
        },
        error: (err: HttpErrorResponse) => {
          this.setSaving(key, false);
          this.applyRowError(key, err);
        },
      });
  }

  private appendExerciseToRound(roundId: number, ex: Exercise): void {
    const map = new Map(this.exercisesByRound());
    const list = [...(map.get(roundId) ?? []), ex];
    map.set(roundId, list);
    this.exercisesByRound.set(map);
  }

  /** Round id that currently holds the given exercise, or null. */
  private roundIdOfExercise(exerciseId: number): number | null {
    for (const [rid, list] of this.exercisesByRound()) {
      if (list.some((e) => e.id === exerciseId)) return rid;
    }
    return null;
  }

  /** Replace the exercise matched by `oldId` with `ex` (whose id may differ
   *  after a fork-on-edit). */
  private replaceExerciseInRound(oldId: number, ex: Exercise): void {
    const map = new Map(this.exercisesByRound());
    for (const [rid, list] of map) {
      const idx = list.findIndex((e) => e.id === oldId);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = ex;
        map.set(rid, next);
        break;
      }
    }
    this.exercisesByRound.set(map);
  }

  private notifyExerciseSaved(detailKey: string): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate(detailKey),
    });
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
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(detailKey),
    });
  }

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
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.detail.confirm_delete_exercise.deleted'),
          });
          this.reloadRequested.emit();
        },
        error: (err: HttpErrorResponse) => this.notifyMutationError(err),
      });
  }

  private notifyMutationError(err: HttpErrorResponse): void {
    const detailKey = err?.status === 403 ? 'events.errors.forbidden' : 'events.errors.unknown';
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(detailKey),
    });
  }
}
