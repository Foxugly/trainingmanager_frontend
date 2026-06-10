import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { RosterHistoryEntry } from '../../../api/model/roster-history-entry';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

/**
 * Manager-only roster-history timeline: every membership period (active + past)
 * of the team, from GET /teams/{id}/roster-history/. A member who left and
 * rejoined shows as several rows. Read-only.
 */
@Component({
  selector: 'app-team-roster-history',
  imports: [DatePipe, TableModule, Tag, TranslocoPipe, EmptyStateComponent],
  templateUrl: './team-roster-history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamRosterHistoryComponent {
  private readonly teamsService = inject(TeamsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();

  protected readonly entries = signal<RosterHistoryEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  constructor() {
    // Reload when the team changes; switchMap cancels a stale in-flight fetch.
    toObservable(this.teamId)
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        switchMap((id) =>
          this.teamsService.teamsRosterHistoryRetrieve({ id }).pipe(
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
}
