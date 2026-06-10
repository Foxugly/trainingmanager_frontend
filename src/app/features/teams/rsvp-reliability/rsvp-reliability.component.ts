import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { TableModule } from 'primeng/table';
import { catchError, of, switchMap, tap } from 'rxjs';
import { TeamsService } from '../../../api/api/teams.service';
import { RsvpReliabilityEntry } from '../../../api/model/rsvp-reliability-entry';

/**
 * Manager-only "RSVP reliability" table: per athlete, how often a GOING RSVP
 * turned into an actual present attendance over the window. Worst reliability
 * first (the coach's chronic-no-show list). Driven by the team-stats date range.
 */
@Component({
  selector: 'app-rsvp-reliability',
  imports: [TableModule, TranslocoPipe],
  templateUrl: './rsvp-reliability.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RsvpReliabilityComponent {
  private readonly teamsService = inject(TeamsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();
  readonly from = input.required<string>();
  readonly to = input.required<string>();

  protected readonly entries = signal<RsvpReliabilityEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  constructor() {
    toObservable(computed(() => ({ id: this.teamId(), from: this.from(), to: this.to() })))
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        switchMap(({ id, from, to }) =>
          this.teamsService.teamsRsvpReliabilityRetrieve({ id, from, to }).pipe(
            catchError(() => {
              this.error.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.entries.set(res?.entries ?? []);
        this.loading.set(false);
      });
  }

  /** Reliability as a rounded percentage, or null. */
  protected pct(entry: RsvpReliabilityEntry): number | null {
    return entry.reliability === null || entry.reliability === undefined
      ? null
      : Math.round(entry.reliability * 100);
  }

  /** Tailwind text color by reliability band (green ≥80%, amber ≥50%, red below). */
  protected colorClass(entry: RsvpReliabilityEntry): string {
    const p = this.pct(entry);
    if (p === null) return 'text-gray-500';
    if (p >= 80) return 'text-emerald-600';
    if (p >= 50) return 'text-amber-600';
    return 'text-red-600';
  }
}
