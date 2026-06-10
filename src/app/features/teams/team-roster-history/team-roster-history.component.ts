import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Tag } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { TeamsService } from '../../../api/api/teams.service';
import { RosterHistoryEntry } from '../../../api/model/roster-history-entry';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { loadOn } from '../../../shared/data/load-on';

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

  // Reload when the team changes; switchMap cancels a stale in-flight fetch.
  private readonly state = loadOn(
    () => this.teamId(),
    (id) => this.teamsService.teamsRosterHistoryRetrieve({ id }),
    this.destroyRef,
  );

  protected readonly entries = computed<RosterHistoryEntry[]>(
    () => this.state.data()?.entries ?? [],
  );
  protected readonly loading = this.state.loading;
  protected readonly error = this.state.error;
}
