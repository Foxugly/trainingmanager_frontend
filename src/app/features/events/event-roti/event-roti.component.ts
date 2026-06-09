import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { EventsService } from '../../../api/api/events.service';
import { RotiSummary } from '../../../api/model/roti-summary';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

/**
 * The session ROTI (difficulty rating) tab: athletes rate 1–5, managers see the
 * aggregate (average, count, distribution bars). Self-contained — it owns the
 * summary fetch + submit; only mounted by the parent when the team enables ROTI.
 * Extracted from events-detail.
 */
@Component({
  selector: 'app-event-roti',
  imports: [DecimalPipe, Button, Tooltip, EmptyStateComponent, TranslocoPipe],
  templateUrl: './event-roti.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRotiComponent {
  private readonly eventsService = inject(EventsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly eventId = input.required<number>();
  /** Athlete = a team member who is neither owner nor manager. */
  readonly isAthlete = input(false);
  readonly canManage = input(false);

  protected readonly rotiSummary = signal<RotiSummary | null>(null);
  protected readonly rotiSubmitting = signal(false);
  protected readonly rotiScores: readonly number[] = [1, 2, 3, 4, 5];

  protected readonly rotiDistribution = computed<{ score: number; count: number }[]>(() => {
    const dist = this.rotiSummary()?.distribution ?? {};
    return this.rotiScores.map((score) => ({
      score,
      count: Number(dist[String(score)] ?? 0),
    }));
  });

  protected readonly rotiMaxCount = computed<number>(() => {
    const counts = this.rotiDistribution().map((d) => d.count);
    return counts.length ? Math.max(1, ...counts) : 1;
  });

  private loadedForEventId: number | null = null;

  constructor() {
    effect(() => {
      const eventId = this.eventId();
      if (this.loadedForEventId === eventId) return;
      this.loadedForEventId = eventId;
      this.load(eventId);
    });
  }

  private load(eventId: number): void {
    this.eventsService
      .eventsRotiRetrieve({ eventPk: eventId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // The endpoint is typed as an array by the schema; the payload is a
        // single summary object. Accept either shape defensively.
        next: (res) => this.rotiSummary.set(this.normalize(res)),
        error: () => this.rotiSummary.set(null),
      });
  }

  private normalize(res: RotiSummary | RotiSummary[] | null): RotiSummary | null {
    if (Array.isArray(res)) return res.length > 0 ? res[0] : null;
    return res ?? null;
  }

  protected submitRoti(score: number): void {
    const eventId = this.eventId();
    if (this.rotiSubmitting()) return;
    this.rotiSubmitting.set(true);
    this.eventsService
      .eventsRotiUpdate({ eventPk: eventId, rotiUpsertRequest: { score } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rotiSummary.set(this.normalize(res));
          this.rotiSubmitting.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('events.roti.saved'),
          });
        },
        error: () => {
          this.rotiSubmitting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('events.errors.unknown'),
          });
        },
      });
  }
}
