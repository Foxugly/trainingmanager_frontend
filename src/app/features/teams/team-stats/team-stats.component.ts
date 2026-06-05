import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { DatePicker } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TeamsService } from '../../../api/api/teams.service';
import { StatsAttendanceByMember } from '../../../api/model/stats-attendance-by-member';
import { StatsVolumeByMember } from '../../../api/model/stats-volume-by-member';
import { TeamStats } from '../../../api/model/team-stats';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

interface ChartConfig {
  data: unknown;
  options: unknown;
}

/** Distinct, readable (light-mode) palette for intensity segments / generic series. */
const SEGMENT_PALETTE = [
  '#60a5fa', // blue
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f87171', // red
  '#a78bfa', // violet
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#a3e635', // lime
];

@Component({
  selector: 'app-team-stats',
  imports: [
    CommonModule,
    FormsModule,
    TranslocoPipe,
    Button,
    UIChart,
    DatePicker,
    TableModule,
    EmptyStateComponent,
  ],
  templateUrl: './team-stats.component.html',
  styleUrl: './team-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamStatsComponent {
  private readonly teamsService = inject(TeamsService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();
  /** When set, scopes the payload to that athlete; null = team aggregate. */
  readonly memberId = input<number | null>(null);

  /** Emitted (aggregate mode only) when an athlete row is clicked, for drill-down. */
  readonly selectMember = output<number>();

  /** Range as a two-element [from, to] tuple of Date objects (PrimeNG range mode). */
  protected readonly range = signal<Date[]>(TeamStatsComponent.defaultRange());

  protected readonly stats = signal<TeamStats | null>(null);
  protected readonly loading = signal(false);

  protected readonly isAggregate = computed(() => this.memberId() === null);

  constructor() {
    // Refetch whenever team, member, or range changes.
    effect(() => {
      const id = this.teamId();
      const member = this.memberId();
      const [from, to] = this.range();
      if (!from || !to) return;
      this.fetch(id, this.fmt(from), this.fmt(to), member ?? undefined);
    });
  }

  private static defaultRange(): Date[] {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 12 * 7); // last 12 weeks
    return [from, to];
  }

  /** YYYY-MM-DD in local time (avoids the UTC shift of toISOString). */
  private fmt(d: Date): string {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private fetch(id: number, from: string, to: string, member?: number): void {
    this.loading.set(true);
    this.teamsService
      .teamsStatsRetrieve(id, from, member, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.stats.set(s);
          this.loading.set(false);
        },
        error: () => {
          this.stats.set(null);
          this.loading.set(false);
        },
      });
  }

  protected setPreset(weeks: number | 'all'): void {
    const to = new Date();
    const from = new Date();
    if (weeks === 'all') {
      // ~2 years back (backend clamps the span to a 2-year max).
      from.setFullYear(from.getFullYear() - 2);
    } else {
      from.setDate(from.getDate() - weeks * 7);
    }
    this.range.set([from, to]);
  }

  protected onRangeChange(value: Date[] | null): void {
    if (!value) return;
    // Only refetch once both bounds are picked.
    if (value[0] && value[1]) {
      this.range.set([value[0], value[1]]);
    }
  }

  protected onMemberRowClick(memberId: number): void {
    if (this.isAggregate()) {
      this.selectMember.emit(memberId);
    }
  }

  // ---- Emptiness -----------------------------------------------------------

  protected readonly isEmpty = computed(() => {
    const s = this.stats();
    if (!s) return true;
    const noAttendance = (s.attendance.by_session?.length ?? 0) === 0;
    const noVolume = (s.volume.by_week?.length ?? 0) === 0 && (s.volume.total_distance ?? 0) === 0;
    const noIntensity = (s.intensity.by_segment?.length ?? 0) === 0;
    return noAttendance && noVolume && noIntensity;
  });

  // ---- KPIs ----------------------------------------------------------------

  /** Team rate in aggregate; the (single) member's rate in member mode. */
  protected readonly attendanceRatePct = computed<number | null>(() => {
    const s = this.stats();
    if (!s) return null;
    if (this.isAggregate()) {
      return s.attendance.team_rate === null ? null : Math.round(s.attendance.team_rate * 100);
    }
    const mine = s.attendance.by_member?.[0];
    if (!mine || mine.rate === null || mine.rate === undefined) return null;
    return Math.round(mine.rate * 100);
  });

  protected readonly totalDistanceLabel = computed<string>(() => {
    const s = this.stats();
    if (!s) return '—';
    return this.formatDistance(s.volume.total_distance ?? 0);
  });

  /** Distances are stored as metres; render km once we cross 1 km. */
  protected formatDistance(metres: number): string {
    if (metres >= 1000) {
      const km = metres / 1000;
      return `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
    }
    return `${metres} m`;
  }

  // ---- Chart configs (precomputed) -----------------------------------------

  private gridOptions(yTitle: string): Record<string, unknown> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#475569' }, grid: { color: '#e2e8f0' } },
        y: {
          beginAtZero: true,
          title: { display: true, text: yTitle, color: '#475569' },
          ticks: { color: '#475569' },
          grid: { color: '#e2e8f0' },
        },
      },
    };
  }

  protected readonly attendanceChart = computed<ChartConfig | null>(() => {
    const s = this.stats();
    if (!s || (s.attendance.by_session?.length ?? 0) === 0) return null;
    const sessions = s.attendance.by_session;
    const labels = sessions.map((x) => x.date ?? x.name);
    const values = sessions.map((x) => (x.rate === null ? 0 : Math.round(x.rate * 100)));
    return {
      data: {
        labels,
        datasets: [
          {
            label: this.transloco.translate('stats.attendance_rate'),
            data: values,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            tension: 0.3,
            fill: true,
            pointRadius: 3,
          },
        ],
      },
      options: {
        ...this.gridOptions(this.transloco.translate('stats.axis_rate')),
        scales: {
          x: { ticks: { color: '#475569' }, grid: { color: '#e2e8f0' } },
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: this.transloco.translate('stats.axis_rate'),
              color: '#475569',
            },
            ticks: { color: '#475569' },
            grid: { color: '#e2e8f0' },
          },
        },
      },
    };
  });

  protected readonly volumeChart = computed<ChartConfig | null>(() => {
    const s = this.stats();
    if (!s || (s.volume.by_week?.length ?? 0) === 0) return null;
    const weeks = s.volume.by_week;
    return {
      data: {
        labels: weeks.map((w) => w.week_start),
        datasets: [
          {
            label: this.transloco.translate('stats.distance'),
            data: weeks.map((w) => w.distance),
            backgroundColor: '#34d399',
            borderRadius: 4,
          },
        ],
      },
      options: this.gridOptions(this.transloco.translate('stats.axis_distance')),
    };
  });

  protected readonly intensityChart = computed<ChartConfig | null>(() => {
    const s = this.stats();
    if (!s || (s.intensity.by_segment?.length ?? 0) === 0) return null;
    const segs = s.intensity.by_segment;
    return {
      data: {
        labels: segs.map((seg) => seg.label || seg.abv),
        datasets: [
          {
            data: segs.map((seg) => seg.distance),
            backgroundColor: segs.map((_, i) => SEGMENT_PALETTE[i % SEGMENT_PALETTE.length]),
            borderWidth: 1,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#475569' } },
        },
      },
    };
  });

  // ---- Tables --------------------------------------------------------------

  protected readonly attendanceByMember = computed<StatsAttendanceByMember[]>(
    () => this.stats()?.attendance.by_member ?? [],
  );

  protected readonly volumeByMember = computed<StatsVolumeByMember[]>(
    () => this.stats()?.volume.by_member ?? [],
  );

  protected ratePct(rate: number | null): string {
    if (rate === null || rate === undefined) return '—';
    return `${Math.round(rate * 100)}%`;
  }
}
