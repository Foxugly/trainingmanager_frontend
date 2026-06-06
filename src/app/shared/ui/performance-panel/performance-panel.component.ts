import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { PerformancesService } from '../../../api/api/performances.service';
import { PatchedPerformance } from '../../../api/model/patched-performance';
import { Performance } from '../../../api/model/performance';
import { UnitEnum } from '../../../api/model/unit-enum';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

interface ChartConfig {
  data: unknown;
  options: unknown;
}

/** A label-group of performances + its precomputed PB + chart. */
interface PerformanceGroup {
  label: string;
  unit: UnitEnum;
  isLowerBetter: boolean;
  /** Entries sorted ascending by recorded_on. */
  entries: Performance[];
  pbLabel: string;
  chart: ChartConfig;
}

interface UnitOption {
  value: UnitEnum;
  label: string;
}

const SECONDS_IN_MINUTE = 60;

/**
 * Reusable per-athlete performance panel.
 *
 * Two modes:
 *  - **Fetch mode** (default): give `teamId` + `memberId`; the panel loads the
 *    scoped performances itself and, when `canEdit`, offers add/edit/delete.
 *  - **Supplied mode**: pass a `performances` array (e.g. the dashboard's
 *    self-scoped list); the panel renders those read-only, no fetch, no ids.
 *
 * In both modes performances are grouped by `label`; each group shows a
 * personal-best badge (min when `is_lower_better`, else max), a compact line
 * chart of value-over-time, and a list of entries.
 */
@Component({
  selector: 'app-performance-panel',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    Button,
    UIChart,
    ConfirmDialog,
    Dialog,
    DatePicker,
    InputNumber,
    InputText,
    Select,
    Tag,
    Textarea,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  templateUrl: './performance-panel.component.html',
  styleUrl: './performance-panel.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerformancePanelComponent {
  private readonly fb = inject(FormBuilder);
  private readonly performancesService = inject(PerformancesService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  /** Optional in supplied mode; required (effectively) in fetch mode. */
  readonly teamId = input<number | null>(null);
  readonly memberId = input<number | null>(null);
  /** Coach = true (CRUD); athlete = false (read-only). */
  readonly canEdit = input<boolean>(false);
  /**
   * When provided, the panel renders these entries instead of fetching.
   * (Dashboard self-view passes its own records here; add is unavailable.)
   */
  readonly performances = input<Performance[] | null>(null);

  protected readonly items = signal<Performance[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  /** True when the panel manages its own data source (no supplied list). */
  protected readonly isFetchMode = computed(() => this.performances() === null);
  /** Add/edit allowed only with edit rights AND a writable (fetch) scope. */
  protected readonly canMutate = computed(() => this.canEdit() && this.isFetchMode());

  protected readonly dialogOpen = signal(false);
  /** Id of the performance being edited, or null when adding a new one. */
  protected readonly editingId = signal<number | null>(null);

  protected readonly unitOptions = computed<UnitOption[]>(() => [
    { value: UnitEnum.S, label: this.transloco.translate('performance.units.s') },
    { value: UnitEnum.M, label: this.transloco.translate('performance.units.m') },
    { value: UnitEnum.Reps, label: this.transloco.translate('performance.units.reps') },
    { value: UnitEnum.Kg, label: this.transloco.translate('performance.units.kg') },
    { value: UnitEnum.Pts, label: this.transloco.translate('performance.units.pts') },
  ]);

  protected readonly form = this.fb.nonNullable.group({
    label: ['', [Validators.required, Validators.maxLength(120)]],
    value: this.fb.nonNullable.control<number | null>(null, [Validators.required]),
    unit: this.fb.nonNullable.control<UnitEnum>(UnitEnum.S, [Validators.required]),
    recorded_on: this.fb.nonNullable.control<Date | null>(null, [Validators.required]),
    notes: [''],
  });

  /** Source records: supplied list when present, else the fetched list. */
  private readonly records = computed<Performance[]>(() => this.performances() ?? this.items());

  protected readonly isEmpty = computed(() => !this.loading() && this.records().length === 0);

  /** Distinct labels already used — drives the datalist suggestions. */
  protected readonly knownLabels = computed<string[]>(() => {
    const seen = new Set<string>();
    for (const p of this.records()) {
      if (p.label) seen.add(p.label);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  });

  protected readonly groups = computed<PerformanceGroup[]>(() => {
    const byLabel = new Map<string, Performance[]>();
    for (const p of this.records()) {
      const arr = byLabel.get(p.label);
      if (arr) {
        arr.push(p);
      } else {
        byLabel.set(p.label, [p]);
      }
    }

    const out: PerformanceGroup[] = [];
    for (const [label, list] of byLabel) {
      const entries = [...list].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));
      const unit = entries[0].unit ?? UnitEnum.Pts;
      const isLowerBetter = entries[0].is_lower_better;
      out.push({
        label,
        unit,
        isLowerBetter,
        entries,
        pbLabel: this.formatValue(this.personalBest(entries, isLowerBetter), unit),
        chart: this.buildChart(label, entries, unit),
      });
    }
    // Stable order: most recent activity first.
    return out.sort((a, b) => {
      const la = a.entries[a.entries.length - 1]?.recorded_on ?? '';
      const lb = b.entries[b.entries.length - 1]?.recorded_on ?? '';
      return lb.localeCompare(la);
    });
  });

  constructor() {
    // Fetch whenever the scope changes — but only in fetch mode.
    effect(() => {
      if (!this.isFetchMode()) return;
      const team = this.teamId();
      const member = this.memberId();
      this.load(team, member);
    });
  }

  private load(team: number | null, member: number | null): void {
    this.loading.set(true);
    this.performancesService
      .performancesList(
        undefined,
        member ?? undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        team ?? undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.items.set(res.results ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.items.set([]);
          this.loading.set(false);
        },
      });
  }

  // ---- Personal best + formatting ------------------------------------------

  /** The best numeric value in a group (min if lower-is-better, else max). */
  private personalBest(entries: Performance[], isLowerBetter: boolean): number {
    const values = entries.map((e) => Number(e.value)).filter((n) => !Number.isNaN(n));
    if (values.length === 0) return 0;
    return isLowerBetter ? Math.min(...values) : Math.max(...values);
  }

  /** Human value with its unit. Seconds render as m:ss.dd once ≥ 60s. */
  protected formatValue(value: number, unit: UnitEnum): string {
    switch (unit) {
      case UnitEnum.S:
        return this.formatSeconds(value);
      case UnitEnum.M:
        return `${this.trimNumber(value)} m`;
      case UnitEnum.Reps:
        return `${this.trimNumber(value)} reps`;
      case UnitEnum.Kg:
        return `${this.trimNumber(value)} kg`;
      case UnitEnum.Pts:
        return `${this.trimNumber(value)} pts`;
      default:
        return `${this.trimNumber(value)}`;
    }
  }

  private formatSeconds(value: number): string {
    if (value >= SECONDS_IN_MINUTE) {
      const minutes = Math.floor(value / SECONDS_IN_MINUTE);
      const seconds = value - minutes * SECONDS_IN_MINUTE;
      return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
    }
    return `${value.toFixed(2)} s`;
  }

  /** Drop trailing zeros for integer-ish values (2800.0 -> "2800"). */
  private trimNumber(value: number): string {
    return Number.isInteger(value) ? `${value}` : `${value}`;
  }

  protected formatEntryValue(entry: Performance): string {
    return this.formatValue(Number(entry.value), entry.unit ?? UnitEnum.Pts);
  }

  // ---- Chart ---------------------------------------------------------------

  private buildChart(label: string, entries: Performance[], _unit: UnitEnum): ChartConfig {
    return {
      data: {
        labels: entries.map((e) => e.recorded_on),
        datasets: [
          {
            label,
            data: entries.map((e) => Number(e.value)),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.18)',
            tension: 0.3,
            fill: true,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#475569' }, grid: { color: '#e2e8f0' } },
          y: { ticks: { color: '#475569' }, grid: { color: '#e2e8f0' } },
        },
      },
    };
  }

  // ---- Add / edit dialog ---------------------------------------------------

  protected openAdd(): void {
    this.editingId.set(null);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.form.reset({
      label: '',
      value: null,
      unit: UnitEnum.S,
      recorded_on: today,
      notes: '',
    });
    this.dialogOpen.set(true);
  }

  protected startEdit(entry: Performance): void {
    this.editingId.set(entry.id);
    this.form.reset({
      label: entry.label,
      value: Number(entry.value),
      unit: entry.unit ?? UnitEnum.S,
      recorded_on: entry.recorded_on ? new Date(`${entry.recorded_on}T00:00:00`) : new Date(),
      notes: entry.notes ?? '',
    });
    this.dialogOpen.set(true);
  }

  protected onDialogVisibleChange(value: boolean): void {
    this.dialogOpen.set(value);
    if (!value) {
      this.editingId.set(null);
    }
  }

  protected canSubmit(): boolean {
    return this.form.valid && !this.saving();
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    const raw = this.form.getRawValue();
    if (raw.value === null || !raw.recorded_on) return;

    this.saving.set(true);
    const editingId = this.editingId();

    if (editingId !== null) {
      const payload: PatchedPerformance = {
        label: raw.label,
        value: String(raw.value),
        unit: raw.unit,
        recorded_on: this.toIsoDate(raw.recorded_on),
        notes: raw.notes,
      };
      this.performancesService
        .performancesPartialUpdate(editingId, payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (updated) => {
            this.items.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
            this.afterSave('performance.toasts.updated');
          },
          error: (err: HttpErrorResponse) => this.onError(err),
        });
      return;
    }

    const team = this.teamId();
    const member = this.memberId();
    if (team === null || member === null) {
      this.saving.set(false);
      return;
    }
    const performance: Performance = {
      team,
      member,
      label: raw.label,
      value: String(raw.value),
      unit: raw.unit,
      recorded_on: this.toIsoDate(raw.recorded_on),
      notes: raw.notes,
    } as Performance;
    this.performancesService
      .performancesCreate(performance)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.items.update((list) => [created, ...list]);
          this.afterSave('performance.toasts.added');
        },
        error: (err: HttpErrorResponse) => this.onError(err),
      });
  }

  private afterSave(detailKey: string): void {
    this.saving.set(false);
    this.dialogOpen.set(false);
    this.editingId.set(null);
    this.messageService.add({
      severity: 'success',
      summary: this.transloco.translate('common.success'),
      detail: this.transloco.translate(detailKey),
    });
  }

  private onError(_err: HttpErrorResponse): void {
    this.saving.set(false);
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('performance.toasts.error'),
    });
  }

  protected confirmDelete(entry: Performance): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('performance.delete_confirm'),
      header: this.transloco.translate('common.delete'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteEntry(entry),
    });
  }

  private deleteEntry(entry: Performance): void {
    this.performancesService
      .performancesDestroy(entry.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.items.update((list) => list.filter((p) => p.id !== entry.id));
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('performance.toasts.deleted'),
          });
        },
        error: (err: HttpErrorResponse) => this.onError(err),
      });
  }

  /** YYYY-MM-DD in local time (avoids the UTC shift of toISOString). */
  private toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
