import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { TeamStatsComponent } from './team-stats.component';

/**
 * Chrome-less, printable wrapper around {@link TeamStatsComponent}. Mounted at
 * the top level (no layout shell) under `teams/:id/stats/print`. Reads the team
 * id from the route + `member` / `from` / `to` from the query string and renders
 * the panel in print mode (read-only, controls hidden). The user prints manually
 * via the toolbar button — there is no auto-print.
 */
@Component({
  selector: 'app-team-stats-print',
  imports: [RouterLink, Button, TranslocoPipe, TeamStatsComponent],
  templateUrl: './team-stats-print.component.html',
  styleUrl: './team-stats-print.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamStatsPrintComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  protected readonly teamId = signal<number | null>(null);
  protected readonly memberId = signal<number | null>(null);
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  protected readonly invalid = signal(false);

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.invalid.set(true);
      return;
    }
    this.teamId.set(id);

    const q = this.route.snapshot.queryParamMap;
    const member = q.get('member');
    if (member !== null && member !== '') {
      const m = Number(member);
      if (Number.isFinite(m)) this.memberId.set(m);
    }
    this.from.set(q.get('from'));
    this.to.set(q.get('to'));
  }

  protected print(): void {
    window.print();
  }
}
