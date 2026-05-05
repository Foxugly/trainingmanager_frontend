import { CommonModule } from '@angular/common';
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Message } from 'primeng/message';
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

@Component({
  selector: 'app-events-detail',
  imports: [
    CommonModule,
    RouterLink,
    Button,
    ConfirmDialog,
    Message,
    TranslocoPipe,
    DetailHeaderComponent,
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
          this.loadRoundsAndExercises(e.rounds ?? []);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  private async loadRoundsAndExercises(roundIds: readonly number[]): Promise<void> {
    if (roundIds.length === 0) {
      this.rounds.set([]);
      this.exercisesByRound.set(new Map());
      return;
    }
    this.loadingRounds.set(true);
    try {
      const fetchedRounds = await Promise.all(
        roundIds.map((rid) => firstValueFrom(this.roundsService.roundsRetrieve(rid))),
      );
      const sortedRounds = [...fetchedRounds].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      );
      this.rounds.set(sortedRounds);

      const exerciseFetches = sortedRounds.map(async (round) => {
        const ids = round.exercises ?? [];
        const fetched = await Promise.all(
          ids.map((eid) => firstValueFrom(this.exercisesService.exercisesRetrieve(eid))),
        );
        const sorted = [...fetched].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return [round.id, sorted] as const;
      });
      const entries = await Promise.all(exerciseFetches);
      const map = new Map<number, Exercise[]>();
      for (const [rid, list] of entries) {
        map.set(rid, list);
      }
      this.exercisesByRound.set(map);
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
    const event = this.event();
    if (!event) return;
    const hasRounds = (event.rounds?.length ?? 0) > 0;
    if (hasRounds) {
      this.confirmationService.confirm({
        header: this.transloco.translate('events.regenerate.has_rounds_title'),
        message: this.transloco.translate('events.regenerate.has_rounds_message'),
        acceptLabel: this.transloco.translate('events.regenerate.delete_and_regen'),
        rejectLabel: this.transloco.translate('common.cancel'),
        accept: () => {
          this.deleteRoundsAndRegenerate(event);
        },
      });
    } else {
      this.confirmationService.confirm({
        header: this.transloco.translate('events.regenerate.confirm_title'),
        message: this.transloco.translate('events.regenerate.confirm_message'),
        accept: () => {
          this.regenerate(event);
        },
      });
    }
  }

  private async deleteRoundsAndRegenerate(event: Event): Promise<void> {
    this.regenerating.set(true);
    this.errorMessage.set(null);
    this.lastResult.set(null);
    try {
      const ids = event.rounds ?? [];
      for (const roundId of ids) {
        await firstValueFrom(this.roundsService.roundsDestroy(roundId));
      }
      await this.regenerateAsync(event.id);
    } catch (err) {
      this.applyError(err as HttpErrorResponse);
    } finally {
      this.regenerating.set(false);
    }
  }

  private regenerate(event: Event): void {
    this.regenerating.set(true);
    this.errorMessage.set(null);
    this.lastResult.set(null);
    this.eventsService
      .eventsGenerateTrainingCreate(event.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.lastResult.set(res);
          this.regenerating.set(false);
          this.notifyRegenerated();
          this.loadEvent(event.id);
        },
        error: (err: HttpErrorResponse) => {
          this.applyError(err);
          this.regenerating.set(false);
        },
      });
  }

  private async regenerateAsync(eventId: number): Promise<void> {
    const res = await firstValueFrom(this.eventsService.eventsGenerateTrainingCreate(eventId));
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
}
