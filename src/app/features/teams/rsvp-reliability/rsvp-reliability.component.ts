import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TableModule } from 'primeng/table';
import { TeamsService } from '../../../api/api/teams.service';
import { RsvpReliabilityEntry } from '../../../api/model/rsvp-reliability-entry';
import { loadOn } from '../../../shared/data/load-on';

/**
 * Manager-only "RSVP reliability" table: per athlete, how often a GOING RSVP
 * turned into an actual present attendance over the window. Worst reliability
 * first (the coach's chronic-no-show list). Driven by the team-stats date range.
 */
@Component({
  selector: 'app-rsvp-reliability',
  imports: [TableModule, TranslocoPipe],
  templateUrl: './rsvp-reliability.component.html',
  styleUrl: './rsvp-reliability.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RsvpReliabilityComponent {
  private readonly teamsService = inject(TeamsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();
  readonly from = input.required<string>();
  readonly to = input.required<string>();

  private readonly state = loadOn(
    () => ({ id: this.teamId(), from: this.from(), to: this.to() }),
    ({ id, from, to }) => this.teamsService.teamsRsvpReliabilityRetrieve({ id, from, to }),
    this.destroyRef,
  );

  protected readonly entries = computed<RsvpReliabilityEntry[]>(
    () => this.state.data()?.entries ?? [],
  );
  protected readonly loading = this.state.loading;
  protected readonly error = this.state.error;

  /** Reliability as a rounded percentage, or null. */
  protected pct(entry: RsvpReliabilityEntry): number | null {
    return entry.reliability === null || entry.reliability === undefined
      ? null
      : Math.round(entry.reliability * 100);
  }

  /** Token-based BEM modifier by reliability band (green ≥80%, amber ≥50%, red below). */
  protected colorClass(entry: RsvpReliabilityEntry): string {
    const p = this.pct(entry);
    if (p === null) return 'rsvp__rate--na';
    if (p >= 80) return 'rsvp__rate--good';
    if (p >= 50) return 'rsvp__rate--mid';
    return 'rsvp__rate--bad';
  }
}
