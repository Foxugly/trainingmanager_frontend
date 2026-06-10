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
import { RotiDriftEntry } from '../../../api/model/roti-drift-entry';
import { loadOn } from '../../../shared/data/load-on';

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

  private readonly state = loadOn(
    () => ({ id: this.teamId(), from: this.from(), to: this.to() }),
    ({ id, from, to }) => this.teamsService.teamsRotiDriftRetrieve({ id, from, to }),
    this.destroyRef,
  );

  protected readonly entries = computed<RotiDriftEntry[]>(() => this.state.data()?.entries ?? []);
  protected readonly squadAverage = computed(() => this.state.data()?.squad_average ?? null);
  protected readonly loading = this.state.loading;
  protected readonly error = this.state.error;

  /** Whether any athlete is flagged (drives whether the panel renders at all). */
  protected readonly hasData = computed(() => this.entries().length > 0);

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
