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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, distinctUntilChanged, filter, switchMap, tap } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TeamsService } from '../../../api/api/teams.service';
import { ReviewBlockResponse } from '../../../api/model/review-block-response';
import { StatsAttendanceByMember } from '../../../api/model/stats-attendance-by-member';
import { StatsVolumeByMember } from '../../../api/model/stats-volume-by-member';
import { TeamStats } from '../../../api/model/team-stats';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { RsvpReliabilityComponent } from '../rsvp-reliability/rsvp-reliability.component';
import { RotiDriftComponent } from '../roti-drift/roti-drift.component';
import { buildStatsCsv } from './stats-csv';
import { isoDate } from '../../../shared/date/calendar';
import { LocalizedDatePipe } from '../../../shared/datetime/localized-date.pipe';

interface ChartConfig {
  data: unknown;
  options: unknown;
}

/** Resolved fetch trigger: team/member scope + the formatted YYYY-MM-DD range. */
interface FetchParams {
  id: number;
  from: string;
  to: string;
  member: number | undefined;
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
    LocalizedDatePipe,
    FormsModule,
    TranslocoPipe,
    Button,
    UIChart,
    DatePicker,
    Dialog,
    TableModule,
    EmptyStateComponent,
    RsvpReliabilityComponent,
    RotiDriftComponent,
  ],
  templateUrl: './team-stats.component.html',
  styleUrl: './team-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamStatsComponent {
  private readonly teamsService = inject(TeamsService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  /** Guards the one-shot seeding of the range from initialFrom/initialTo. */
  private rangeSeeded = false;

  readonly teamId = input.required<number>();
  /** When set, scopes the payload to that athlete; null = team aggregate. */
  readonly memberId = input<number | null>(null);

  /** Shows the CSV / PDF export buttons in the header (hidden in print mode). */
  readonly showExport = input(true);
  /** Enables the manager-only "AI review" button (team aggregate only). */
  readonly canReview = input(false);
  /** Print mode: hides the interactive date-range + export controls for a clean printable sheet. */
  readonly print = input(false);
  /** Optional ISO (YYYY-MM-DD) seeds for the date range, e.g. from print-route query params. */
  readonly initialFrom = input<string | null>(null);
  readonly initialTo = input<string | null>(null);

  /** Emitted (aggregate mode only) when an athlete row is clicked, for drill-down. */
  readonly selectMember = output<number>();

  /** Range as a two-element [from, to] tuple of Date objects (PrimeNG range mode). */
  protected readonly range = signal<Date[]>(TeamStatsComponent.defaultRange());

  /** When false, the interactive date-range picker + preset buttons are hidden. */
  protected readonly showControls = computed(() => !this.print());
  /** Export buttons visible only when explicitly enabled and not printing. */
  protected readonly exportVisible = computed(() => this.showExport() && !this.print());

  protected readonly stats = signal<TeamStats | null>(null);
  protected readonly loading = signal(false);

  protected readonly isAggregate = computed(() => this.memberId() === null);

  /** The AI "review block" button shows for managers, on the team aggregate,
   * outside print mode. */
  protected readonly reviewVisible = computed(
    () => this.canReview() && this.isAggregate() && !this.print(),
  );
  /** Formatted current range bounds, for child panels (e.g. RSVP reliability). */
  protected readonly rangeFrom = computed(() => {
    const [f] = this.range();
    return f ? isoDate(f) : '';
  });
  protected readonly rangeTo = computed(() => {
    const [, t] = this.range();
    return t ? isoDate(t) : '';
  });

  protected readonly reviewDialogVisible = signal(false);
  protected readonly reviewLoading = signal(false);
  protected readonly reviewError = signal(false);
  protected readonly review = signal<ReviewBlockResponse | null>(null);

  /**
   * The fetch trigger as a [id, from, to, member] tuple, or null while the
   * range bounds haven't both resolved. Recomputes on teamId/memberId/range.
   */
  private readonly fetchParams = computed<FetchParams | null>(() => {
    const id = this.teamId();
    const member = this.memberId();
    const [from, to] = this.range();
    if (!from || !to) return null;
    return { id, from: isoDate(from), to: isoDate(to), member: member ?? undefined };
  });

  constructor() {
    // Seed the range from initialFrom/initialTo (print route query params) once
    // both inputs have resolved. Runs before the fetch effect reads range().
    effect(() => {
      if (this.rangeSeeded) return;
      const fromIso = this.initialFrom();
      const toIso = this.initialTo();
      if (!fromIso && !toIso) return;
      const [defFrom, defTo] = TeamStatsComponent.defaultRange();
      const from = TeamStatsComponent.parseIso(fromIso) ?? defFrom;
      const to = TeamStatsComponent.parseIso(toIso) ?? defTo;
      this.rangeSeeded = true;
      this.range.set([from, to]);
    });

    // Refetch whenever team, member, or range changes. A data stream (not a
    // side-effecting effect): distinctUntilChanged dedups the [id, from, to,
    // member] tuple and switchMap cancels a stale request if any of them change
    // mid-flight, so overlapping responses can never land out of order.
    toObservable(this.fetchParams)
      .pipe(
        filter((p): p is FetchParams => p !== null),
        distinctUntilChanged(
          (a, b) => a.id === b.id && a.from === b.from && a.to === b.to && a.member === b.member,
        ),
        tap(() => this.loading.set(true)),
        switchMap((p) =>
          this.teamsService
            .teamsStatsRetrieve({ id: p.id, from: p.from, member: p.member, to: p.to })
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      });
  }

  /** Parse a YYYY-MM-DD string into a local-time Date, or null if invalid.
   * Rejects out-of-range parts (the Date constructor silently rolls over,
   * e.g. month 13 or day 32), so a crafted print-route query param can't
   * resolve to a surprise date. */
  private static parseIso(iso: string | null): Date | null {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(y, m - 1, d);
    // Reject rollover (e.g. 2026-02-31 → 3 Mar): the constructed parts must
    // match the requested ones exactly.
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      return null;
    }
    return date;
  }

  private static defaultRange(): Date[] {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 12 * 7); // last 12 weeks
    return [from, to];
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

  // ---- AI review -----------------------------------------------------------

  /** Run the team-level AI critique over the current range. Opens the dialog
   * immediately (showing a spinner) so the click feels responsive. */
  protected runReview(): void {
    const p = this.fetchParams();
    if (!p || this.reviewLoading()) return;
    this.reviewDialogVisible.set(true);
    this.reviewLoading.set(true);
    this.reviewError.set(false);
    this.review.set(null);
    this.teamsService
      .teamsReviewBlockCreate({ id: p.id, from: p.from, to: p.to })
      .pipe(
        catchError(() => {
          this.reviewError.set(true);
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res) this.review.set(res);
        this.reviewLoading.set(false);
      });
  }

  /** Tailwind severity → text color for a finding badge. */
  protected severityClass(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'text-red-600';
      case 'warning':
        return 'text-amber-600';
      default:
        return 'text-gray-500';
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

  /** Current consecutive-present streak (per-athlete scope only). */
  protected readonly attendanceStreak = computed<number | null>(() => {
    const s = this.stats();
    if (!s || this.isAggregate()) return null;
    return s.attendance.by_member?.[0]?.streak ?? null;
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

  /** Per-athlete ROTI (1-5) trend over the window. Empty on the team aggregate. */
  protected readonly rotiChart = computed<ChartConfig | null>(() => {
    const s = this.stats();
    if (!s || (s.roti?.series?.length ?? 0) === 0) return null;
    const series = s.roti.series;
    return {
      data: {
        labels: series.map((x) => x.date ?? x.name),
        datasets: [
          {
            label: this.transloco.translate('stats.roti'),
            data: series.map((x) => x.score),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            tension: 0.3,
            fill: true,
            pointRadius: 3,
          },
        ],
      },
      options: {
        ...this.gridOptions(this.transloco.translate('stats.axis_roti')),
        scales: {
          x: { ticks: { color: '#475569' }, grid: { color: '#e2e8f0' } },
          y: {
            beginAtZero: true,
            min: 0,
            max: 5,
            title: {
              display: true,
              text: this.transloco.translate('stats.axis_roti'),
              color: '#475569',
            },
            ticks: { color: '#475569', stepSize: 1 },
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
        // Legend is rendered as a separate HTML list below the chart so the
        // segment names never overflow / overlap the canvas at any width.
        plugins: { legend: { display: false } },
      },
    };
  });

  /** Segment legend rendered as an HTML list (color swatch + label + distance). */
  protected readonly intensityLegend = computed<
    { label: string; color: string; distance: string }[]
  >(() => {
    const s = this.stats();
    const segs = s?.intensity.by_segment ?? [];
    return segs.map((seg, i) => ({
      label: seg.label || seg.abv,
      color: SEGMENT_PALETTE[i % SEGMENT_PALETTE.length],
      distance: this.formatDistance(seg.distance),
    }));
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

  // ---- Export --------------------------------------------------------------

  /** Current range as [fromIso, toIso] (YYYY-MM-DD), preferring the loaded period. */
  private currentPeriod(): [string, string] {
    const s = this.stats();
    if (s?.period?.from && s.period.to) return [s.period.from, s.period.to];
    const [from, to] = this.range();
    return [isoDate(from), isoDate(to)];
  }

  /** Slug for filenames: team/member name from the payload, fallback to ids. */
  private scopeSlug(): string {
    const s = this.stats();
    const raw = s?.member?.name ?? `team-${this.teamId()}`;
    return (
      raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'stats'
    );
  }

  /** Build a CSV from the loaded stats and trigger a client-side download. */
  protected exportCsv(): void {
    const s = this.stats();
    if (!s) return;
    const csv = buildStatsCsv(s);
    const [from, to] = this.currentPeriod();
    const filename = `stats-${this.scopeSlug()}-${from}_${to}.csv`;
    // Prepend a UTF-8 BOM so Excel reads accents correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Open the printable PDF view in a new tab, preserving the current scope + range. */
  protected exportPdf(): void {
    const [from, to] = this.currentPeriod();
    const params = new URLSearchParams({ from, to });
    const member = this.memberId();
    if (member !== null) params.set('member', String(member));
    const url = `${window.location.origin}/teams/${this.teamId()}/stats/print?${params.toString()}`;
    window.open(url, '_blank', 'noopener');
  }
}
