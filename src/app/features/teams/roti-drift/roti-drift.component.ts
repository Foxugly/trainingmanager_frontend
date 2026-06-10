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
import { Tag } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { catchError, of, switchMap, tap } from 'rxjs';
import { TeamsService } from '../../../api/api/teams.service';
import { RotiDriftEntry } from '../../../api/model/roti-drift-entry';

/**
 * Manager-only "ROTI drift" panel: each athlete's mean perceived-effort vs the
 * squad mean over the window. high = rates sessions notably harder (possible
 * overreaching); low = notably easier (possible under-challenge). Driven by the
 * team-stats date range.
 */
@Component({
  selector: 'app-roti-drift',
  imports: [TableModule, Tag, TranslocoPipe],
  templateUrl: './roti-drift.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RotiDriftComponent {
  private readonly teamsService = inject(TeamsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();
  readonly from = input.required<string>();
  readonly to = input.required<string>();

  protected readonly entries = signal<RotiDriftEntry[]>([]);
  protected readonly squadAverage = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  /** Whether any athlete is flagged (drives whether the panel renders at all). */
  protected readonly hasData = computed(() => this.entries().length > 0);

  constructor() {
    toObservable(computed(() => ({ id: this.teamId(), from: this.from(), to: this.to() })))
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        switchMap(({ id, from, to }) =>
          this.teamsService.teamsRotiDriftRetrieve({ id, from, to }).pipe(
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
        this.squadAverage.set(res?.squad_average ?? null);
        this.loading.set(false);
      });
  }

  protected severity(flag: string): 'warn' | 'info' | 'secondary' {
    if (flag === 'high') return 'warn';
    if (flag === 'low') return 'info';
    return 'secondary';
  }

  /** Signed delta string, e.g. "+1.2" / "-0.8". */
  protected deltaLabel(delta: number): string {
    return delta > 0 ? `+${delta}` : `${delta}`;
  }
}
