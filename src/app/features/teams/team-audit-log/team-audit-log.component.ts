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
import { of } from 'rxjs';
import { catchError, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { AuditLogService } from '../../../api/api/audit-log.service';
import { ActionEnum } from '../../../api/model/action-enum';
import { AuditLogEntry } from '../../../api/model/audit-log-entry';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

/** An audit entry pre-decorated with display-ready fields (no Date()/format in template). */
interface AuditRow {
  readonly id: number;
  readonly when: string;
  readonly who: string;
  readonly action: string;
  readonly target: string;
  readonly tagClass: string;
}

/**
 * The team's coach-only "Journal" (audit log) tab: a paginated, newest-first
 * table of audited team actions (member removals, shares, config changes, …).
 * Self-contained — it owns the list, its load and the "load more" pagination.
 * Extracted from teams-detail.
 *
 * Wiring: takes [teamId] and loads its own data. The parent renders this only
 * when the Journal tab is active, so the load is naturally lazy (the component
 * is created on first tab open and loads page 1 on init).
 */
@Component({
  selector: 'app-team-audit-log',
  imports: [TranslocoPipe, Button, EmptyStateComponent],
  templateUrl: './team-audit-log.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamAuditLogComponent {
  private readonly auditLogService = inject(AuditLogService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();

  protected readonly auditRows = signal<AuditRow[]>([]);
  protected readonly loadingAudit = signal(false);
  protected readonly auditLoaded = signal(false);
  // Distinguish a backend failure from a genuinely empty journal, so an error
  // doesn't masquerade as "no audit entries".
  protected readonly error = signal(false);
  private readonly auditNextPage = signal<number | null>(null);
  protected readonly auditHasMore = computed(() => this.auditNextPage() !== null);

  constructor() {
    // Load page 1 whenever the team changes (cancels any in-flight request on
    // team switch). switchMap dedups via distinctUntilChanged on the id.
    toObservable(this.teamId)
      .pipe(
        distinctUntilChanged(),
        tap(() => {
          this.auditRows.set([]);
          this.auditNextPage.set(null);
          this.auditLoaded.set(false);
          this.error.set(false);
          this.loadingAudit.set(true);
        }),
        // auditLogList(ordering, page, pageSize, search, team) — newest-first by default.
        switchMap((id) =>
          this.auditLogService
            .auditLogList({ page: 1, team: id })
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res) {
          this.auditRows.set((res.results ?? []).map((e) => this.toAuditRow(e)));
          this.auditNextPage.set(res.next ? 2 : null);
        } else {
          this.error.set(true);
        }
        this.loadingAudit.set(false);
        this.auditLoaded.set(true);
      });
  }

  /** Retry the initial page-1 load after a failure. */
  protected reload(): void {
    this.loadAuditLog(1);
  }

  protected loadMoreAudit(): void {
    const next = this.auditNextPage();
    if (next !== null) this.loadAuditLog(next);
  }

  private loadAuditLog(page: number): void {
    const id = this.teamId();
    if (this.loadingAudit()) return;
    this.loadingAudit.set(true);
    if (page === 1) this.error.set(false);
    // auditLogList(ordering, page, pageSize, search, team) — newest-first by default.
    this.auditLogService
      .auditLogList({ page, team: id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const rows = (res.results ?? []).map((e) => this.toAuditRow(e));
          this.auditRows.update((prev) => (page === 1 ? rows : [...prev, ...rows]));
          this.auditNextPage.set(res.next ? page + 1 : null);
          this.loadingAudit.set(false);
          this.auditLoaded.set(true);
        },
        error: () => {
          if (page === 1) this.error.set(true);
          this.loadingAudit.set(false);
          this.auditLoaded.set(true);
        },
      });
  }

  private toAuditRow(e: AuditLogEntry): AuditRow {
    return {
      id: e.id,
      when: this.formatAuditDate(e.created_at),
      who: e.actor_label?.trim() || this.transloco.translate('audit.system'),
      action: e.action_display,
      target: e.target_repr,
      tagClass: this.auditTagClass(e.action),
    };
  }

  private formatAuditDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(this.transloco.getActiveLang(), {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Colored pill per action category: destructive=danger, share=info, config=neutral. */
  private auditTagClass(action: ActionEnum): string {
    const base = 'inline-block text-xs font-medium px-2 py-0.5 rounded';
    switch (action) {
      case 'member_anonymized':
      case 'member_removed':
      case 'account_deleted':
      case 'attachment_deleted':
        return `${base} bg-rose-100 text-rose-800`;
      case 'session_shared':
      case 'session_unshared':
        return `${base} bg-sky-100 text-sky-800`;
      default:
        return `${base} bg-gray-100 text-gray-700`;
    }
  }
}
