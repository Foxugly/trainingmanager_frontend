import { CommonModule } from '@angular/common';
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
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Fieldset } from 'primeng/fieldset';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';
import { firstValueFrom } from 'rxjs';
import { EventsService } from '../../../api/api/events.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Event } from '../../../api/model/event';
import { Exercise } from '../../../api/model/exercise';
import { GenerateTrainingResponse } from '../../../api/model/generate-training-response';
import { Round } from '../../../api/model/round';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { AiErrorMappingService } from '../../ai/ai-error-mapping.service';
import { TeamRole, computeTeamRole } from '../../teams/teams-list/teams-list.component';
import { DetailHeaderComponent } from '../../../shared/ui/detail-header/detail-header.component';
import { RoundFormDialogComponent } from '../round-form-dialog/round-form-dialog.component';
import { ExerciseFormDialogComponent } from '../exercise-form-dialog/exercise-form-dialog.component';
import { AttendanceManagerComponent } from '../attendance-manager/attendance-manager.component';
import { RegenerateTrainingDialogComponent } from '../regenerate-training-dialog/regenerate-training-dialog.component';

@Component({
  selector: 'app-events-detail',
  imports: [
    CommonModule,
    RouterLink,
    Button,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    ConfirmDialog,
    Fieldset,
    Message,
    ProgressSpinner,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
    Tooltip,
    TranslocoPipe,
    DetailHeaderComponent,
    RoundFormDialogComponent,
    ExerciseFormDialogComponent,
    AttendanceManagerComponent,
    RegenerateTrainingDialogComponent,
  ],
  templateUrl: './events-detail.component.html',
  styleUrl: './events-detail.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsService = inject(EventsService);
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly roundsService = inject(RoundsService);
  private readonly exercisesService = inject(ExercisesService);
  private readonly authService = inject(AuthService);
  private readonly aiErrorMapping = inject(AiErrorMappingService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly eventId = signal<number | null>(null);
  protected readonly event = signal<Event | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  protected readonly regenerating = signal(false);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly lastResult = signal<GenerateTrainingResponse | null>(null);
  protected readonly rounds = signal<Round[]>([]);
  protected readonly exercisesByRound = signal<Map<number, Exercise[]>>(new Map());
  protected readonly loadingRounds = signal(false);
  protected readonly roundsLoadError = signal<{ kind: 'partial' | 'full'; count: number } | null>(
    null,
  );

  protected readonly activeTab = signal<string>('training');

  protected readonly showRoundDialog = signal(false);
  protected readonly roundDialogMode = signal<'create' | 'edit'>('create');
  protected readonly editingRound = signal<Round | null>(null);

  protected readonly showExerciseDialog = signal(false);
  protected readonly exerciseDialogMode = signal<'create' | 'edit'>('create');
  protected readonly editingExercise = signal<Exercise | null>(null);
  protected readonly targetRoundId = signal<number | null>(null);

  protected readonly reordering = signal(false);

  protected readonly showRegenerateDialog = signal(false);

  protected readonly currentUserRole = computed<TeamRole | null>(() => {
    const t = this.team();
    const userId = this.authService.currentUser()?.id;
    if (!t || userId == null) return null;
    return computeTeamRole(t, userId);
  });

  protected readonly canManage = computed(() => {
    const role = this.currentUserRole();
    return role === 'owner' || role === 'manager';
  });

  protected readonly canRegenerate = this.canManage;

  protected readonly eventTotalDistance = computed<number>(() => {
    let total = 0;
    for (const round of this.rounds()) {
      total += this.roundTotalDistance(round);
    }
    return total;
  });

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

  private patchingTotal = false;

  constructor() {
    effect(() => {
      const event = this.event();
      if (!event) return;
      if (this.loadingRounds()) return;
      if (this.roundsLoadError() !== null) return;
      if ((event.rounds?.length ?? 0) > 0 && this.rounds().length === 0) return;
      const computed = this.eventTotalDistance();
      const stored = event.total ?? 0;
      if (computed === stored) return;
      if (this.patchingTotal) return;
      this.patchingTotal = true;
      untracked(() => this.patchEventTotal(event.id, computed));
    });
  }

  private patchEventTotal(eventId: number, total: number): void {
    this.eventsService
      .eventsPartialUpdate(eventId, { total })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.event.update((e) => (e ? { ...e, total: updated.total ?? total } : e));
          this.patchingTotal = false;
        },
        error: () => {
          this.patchingTotal = false;
        },
      });
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }
    this.eventId.set(id);
    this.loadEvent(id);
  }

  private loadEvent(id: number): void {
    this.loading.set(true);
    this.eventsService
      .eventsRetrieve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => {
          this.event.set(e);
          this.loading.set(false);
          if (e.refer_program?.id != null) {
            this.loadProgramTeam(e.refer_program.id);
          }
          // Fire-and-forget: loadRoundsAndExercises has its own try/catch + finally
          // so errors are surfaced via roundsLoadError signal, not thrown.
          void this.loadRoundsAndExercises(e.rounds ?? []);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  private async loadRoundsAndExercises(roundIds: readonly number[]): Promise<void> {
    this.roundsLoadError.set(null);
    if (roundIds.length === 0) {
      this.rounds.set([]);
      this.exercisesByRound.set(new Map());
      return;
    }
    this.loadingRounds.set(true);
    try {
      const roundResults = await Promise.allSettled(
        roundIds.map((rid) => firstValueFrom(this.roundsService.roundsRetrieve(rid))),
      );
      const fetchedRounds: Round[] = [];
      let roundFailures = 0;
      for (const r of roundResults) {
        if (r.status === 'fulfilled') {
          fetchedRounds.push(r.value);
        } else {
          roundFailures++;
          console.warn('roundsRetrieve failed', r.reason);
        }
      }
      if (roundFailures > 0) {
        this.roundsLoadError.set({
          kind: fetchedRounds.length === 0 ? 'full' : 'partial',
          count: roundFailures,
        });
      }

      const sortedRounds = [...fetchedRounds].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      );
      this.rounds.set(sortedRounds);

      const exerciseFetches = sortedRounds.map(async (round) => {
        const ids = round.exercises ?? [];
        const settled = await Promise.allSettled(
          ids.map((eid) => firstValueFrom(this.exercisesService.exercisesRetrieve(eid))),
        );
        const fulfilled: Exercise[] = [];
        for (const s of settled) {
          if (s.status === 'fulfilled') {
            fulfilled.push(s.value);
          } else {
            console.warn('exercisesRetrieve failed', s.reason);
          }
        }
        const sorted = [...fulfilled].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return [round.id, sorted] as const;
      });
      const entries = await Promise.all(exerciseFetches);
      const map = new Map<number, Exercise[]>();
      for (const [rid, list] of entries) {
        map.set(rid, list);
      }
      this.exercisesByRound.set(map);
    } catch (err) {
      console.error('Unexpected error in loadRoundsAndExercises', err);
      this.roundsLoadError.set({ kind: 'full', count: roundIds.length });
    } finally {
      this.loadingRounds.set(false);
    }
  }

  private loadProgramTeam(programId: number): void {
    this.programsService
      .programsRetrieve(programId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          if (p.team?.id != null) {
            this.teamsService
              .teamsRetrieve(p.team.id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (t) => this.team.set(t),
              });
          }
        },
      });
  }

  protected confirmRegenerate(): void {
    if (!this.event()) return;
    this.showRegenerateDialog.set(true);
  }

  protected onRegenerateConfirmed(additionalPrompt: string): void {
    const event = this.event();
    if (!event) return;
    const hasRounds = (event.rounds?.length ?? 0) > 0;
    if (hasRounds) {
      this.deleteRoundsAndRegenerate(event, additionalPrompt);
    } else {
      this.regenerate(event, additionalPrompt);
    }
  }

  private async deleteRoundsAndRegenerate(event: Event, additionalPrompt: string): Promise<void> {
    this.regenerating.set(true);
    this.errorMessage.set(null);
    this.lastResult.set(null);
    try {
      const ids = event.rounds ?? [];
      for (const roundId of ids) {
        await firstValueFrom(this.roundsService.roundsDestroy(roundId));
      }
      await this.regenerateAsync(event.id, additionalPrompt);
    } catch (err) {
      this.applyError(err as HttpErrorResponse);
    } finally {
      this.regenerating.set(false);
      this.showRegenerateDialog.set(false);
    }
  }

  private regenerate(event: Event, additionalPrompt: string): void {
    this.regenerating.set(true);
    this.errorMessage.set(null);
    this.lastResult.set(null);
    this.eventsService
      .eventsGenerateTrainingCreate(event.id, { additional_prompt: additionalPrompt })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.lastResult.set(res);
          this.regenerating.set(false);
          this.showRegenerateDialog.set(false);
          this.notifyRegenerated();
          this.loadEvent(event.id);
        },
        error: (err: HttpErrorResponse) => {
          this.applyError(err);
          this.regenerating.set(false);
        },
      });
  }

  private async regenerateAsync(eventId: number, additionalPrompt: string): Promise<void> {
    const res = await firstValueFrom(
      this.eventsService.eventsGenerateTrainingCreate(eventId, {
        additional_prompt: additionalPrompt,
      }),
    );
    this.lastResult.set(res);
    this.notifyRegenerated();
    this.loadEvent(eventId);
  }

  private notifyRegenerated(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate('events.regenerate.success_title'),
    });
  }

  protected confirmDelete(): void {
    const event = this.event();
    if (!event) return;
    this.confirmationService.confirm({
      header: this.transloco.translate('events.actions.delete_confirm_title'),
      message: this.transloco.translate('events.actions.delete_confirm_message', {
        name: event.name,
      }),
      acceptLabel: this.transloco.translate('events.actions.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteEvent(event),
    });
  }

  private deleteEvent(event: Event): void {
    const programId = event.refer_program?.id ?? null;
    this.deleting.set(true);
    this.eventsService
      .eventsDestroy(event.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.actions.deleted'),
          });
          if (programId !== null) {
            this.router.navigate(['/programs', programId]);
          } else {
            this.router.navigate(['/events']);
          }
        },
        error: () => {
          this.deleting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('events.errors.unknown'),
          });
        },
      });
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
      this.reloadEvent();
    }
  }

  protected moveRound(r: Round, direction: 'up' | 'down'): void {
    if (this.reordering()) return;
    const list = this.rounds();
    const idx = list.findIndex((x) => x.id === r.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;

    const a = list[idx];
    const b = list[targetIdx];
    const aOrder = a.order ?? idx + 1;
    const bOrder = b.order ?? targetIdx + 1;

    this.reordering.set(true);
    Promise.all([
      firstValueFrom(this.roundsService.roundsPartialUpdate(a.id, { order: bOrder })),
      firstValueFrom(this.roundsService.roundsPartialUpdate(b.id, { order: aOrder })),
    ])
      .then(([updatedA, updatedB]) => {
        const next = list
          .map((x) => (x.id === updatedA.id ? updatedA : x.id === updatedB.id ? updatedB : x))
          .sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
        this.rounds.set(next);
      })
      .catch((err: HttpErrorResponse) => this.notifyMutationError(err))
      .finally(() => this.reordering.set(false));
  }

  protected onExerciseDrop(round: Round, event: CdkDragDrop<Exercise[]>): void {
    if (this.reordering()) return;
    if (event.previousIndex === event.currentIndex) return;

    const original = this.exercisesByRound().get(round.id) ?? [];
    const reordered = [...original];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    const renumbered = reordered.map((ex, i) => ({ ...ex, order: i + 1 }));

    const map = new Map(this.exercisesByRound());
    map.set(round.id, renumbered);
    this.exercisesByRound.set(map);

    const originalById = new Map(original.map((ex) => [ex.id, ex.order]));
    const changed = renumbered.filter((ex) => originalById.get(ex.id) !== ex.order);
    if (changed.length === 0) return;

    this.reordering.set(true);
    Promise.all(
      changed.map((ex) =>
        firstValueFrom(this.exercisesService.exercisesPartialUpdate(ex.id, { order: ex.order })),
      ),
    )
      .catch((err: HttpErrorResponse) => this.notifyMutationError(err))
      .finally(() => this.reordering.set(false));
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
      .roundsDestroy(r.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.detail.confirm_delete_round.deleted'),
          });
          this.reloadEvent();
        },
        error: (err: HttpErrorResponse) => this.notifyMutationError(err),
      });
  }

  protected openCreateExercise(roundId: number): void {
    this.editingExercise.set(null);
    this.targetRoundId.set(roundId);
    this.exerciseDialogMode.set('create');
    this.showExerciseDialog.set(true);
  }

  protected openEditExercise(ex: Exercise): void {
    this.editingExercise.set(ex);
    this.targetRoundId.set(null);
    this.exerciseDialogMode.set('edit');
    this.showExerciseDialog.set(true);
  }

  protected onExerciseDialogClosed(ex: Exercise | null): void {
    this.showExerciseDialog.set(false);
    this.editingExercise.set(null);
    this.targetRoundId.set(null);
    if (ex) {
      this.messageService.add({
        severity: 'success',
        summary: this.transloco.translate('common.success'),
        detail: this.transloco.translate(
          this.exerciseDialogMode() === 'create'
            ? 'events.exercise_form.created'
            : 'events.exercise_form.updated',
        ),
      });
      this.reloadEvent();
    }
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
      .exercisesDestroy(ex.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.detail.confirm_delete_exercise.deleted'),
          });
          this.reloadEvent();
        },
        error: (err: HttpErrorResponse) => this.notifyMutationError(err),
      });
  }

  private reloadEvent(): void {
    const id = this.eventId();
    if (id != null) this.loadEvent(id);
  }

  private notifyMutationError(err: HttpErrorResponse): void {
    const detailKey =
      err?.status === 403 ? 'events.errors.forbidden' : 'events.errors.unknown';
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate(detailKey),
    });
  }
}
