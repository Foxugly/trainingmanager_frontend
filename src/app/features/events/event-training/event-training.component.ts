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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Fieldset } from 'primeng/fieldset';
import { Tooltip } from 'primeng/tooltip';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/notifications/toast.service';
import { EventsService } from '../../../api/api/events.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { Event } from '../../../api/model/event';
import { Exercise } from '../../../api/model/exercise';
import { Round } from '../../../api/model/round';
import { Team } from '../../../api/model/team';
import { VisibilityMode } from '../../../api/model/visibility-mode';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { RoundExercisesComponent } from '../round-exercises/round-exercises.component';
import { RoundFormDialogComponent } from '../round-form-dialog/round-form-dialog.component';

/** Aggregate state the parent needs from the training editor: the computed
 *  total distance (for the header + the event.total auto-patch) and whether the
 *  rounds are still loading (to gate that patch + the "hidden rounds" hint). */
export interface TrainingState {
  totalDistance: number;
  loading: boolean;
}

/**
 * The session's training editor: the ordered training blocks (rounds) and their
 * totals, with the round create/edit dialog + round-level reorder/delete. The
 * per-round exercise-row editor is delegated to `app-round-exercises`, which
 * reports its round's exercise list back via `(exercisesChanged)` so this
 * component can recompute the total distance.
 *
 * Wiring: the parent passes the `event` (the editor loads its rounds from
 * `event.rounds_detail`), the resolved `team` and the `canManage`/`restrictedViewer`
 * flags. It emits `(stateChange)` (total distance + loading, for the header and
 * the event.total auto-patch the parent still owns) and `(reloadRequested)`
 * after any mutation that changes the event (so the parent refetches it and
 * feeds a fresh `event` back down). Extracted from events-detail.
 */
@Component({
  selector: 'app-event-training',
  imports: [
    Button,
    ConfirmDialog,
    Fieldset,
    Tooltip,
    TranslocoPipe,
    EmptyStateComponent,
    RoundExercisesComponent,
    RoundFormDialogComponent,
  ],
  templateUrl: './event-training.component.html',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventTrainingComponent {
  private readonly eventsService = inject(EventsService);
  private readonly roundsService = inject(RoundsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
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

  protected readonly reordering = signal(false);

  /** Sport whose modalities feed the exercise option lists (event sport, team
   *  default fallback). Passed down to each round-exercises child. */
  protected readonly sportId = computed<number | null>(
    () => this.event().sport?.id ?? this.team()?.sport?.id ?? null,
  );

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

  protected exercisesForRound(roundId: number): Exercise[] {
    return this.exercisesByRound().get(roundId) ?? [];
  }

  /** A round-exercises child reported its fresh exercise list (after an inline
   *  create/edit/reorder) — swap it into the per-round map so the totals
   *  recompute (and the stateChange effect re-emits). */
  protected onRoundExercisesChanged(roundId: number, exercises: Exercise[]): void {
    const map = new Map(this.exercisesByRound());
    map.set(roundId, exercises);
    this.exercisesByRound.set(map);
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
        // codegen: built from the embedded EventRoundDetail, projecting only the
        // fields the editor consumes. The full Round interface also requires
        // language/usage_count/created_at/updated_at, which the detail payload
        // doesn't carry, so the partial object can't satisfy `as Round` directly.
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
      this.toast.success(
        this.roundDialogMode() === 'create'
          ? 'events.round_form.created'
          : 'events.round_form.updated',
      );
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
        reorderRoundsRequestRequest: { round_ids: renumbered.map((x) => x.id) },
      }),
    )
      .catch((err: HttpErrorResponse) => {
        this.rounds.set(list);
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
          this.toast.success('events.detail.confirm_delete_round.deleted');
          this.reloadRequested.emit();
        },
        error: (err: HttpErrorResponse) => this.notifyMutationError(err),
      });
  }

  private notifyMutationError(err: HttpErrorResponse): void {
    const detailKey = err?.status === 403 ? 'events.errors.forbidden' : 'events.errors.unknown';
    this.toast.error(detailKey);
  }
}
