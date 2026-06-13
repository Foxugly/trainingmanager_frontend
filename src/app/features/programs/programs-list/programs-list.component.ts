import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Program } from '../../../api/model/program';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { computeTeamRole } from '../../teams/teams-list/teams-list.component';
import { LocalizedDatePipe } from '../../../shared/datetime/localized-date.pipe';

@Component({
  selector: 'app-programs-list',
  imports: [
    LocalizedDatePipe,
    FormsModule,
    RouterLink,
    Button,
    Skeleton,
    ToggleSwitch,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  templateUrl: './programs-list.component.html',
  styleUrl: './programs-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramsListComponent implements OnInit {
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamFilter = input<number | null>(null);
  /**
   * Embedded usage (inside teams-detail) passes the user's manage-ability for
   * the filtered team so we can skip the standalone-route teamsList() fetch.
   * Only consulted when `teamFilter()` is non-null; null on the standalone
   * `/programs` route, where managerTeamIds (fetched) drives the affordances.
   */
  readonly canCreateOverride = input<boolean | null>(null);

  protected readonly programs = signal<Program[]>([]);
  protected readonly loading = signal(false);
  protected readonly showArchived = signal(false);
  protected readonly managerTeamIds = signal<Set<number>>(new Set());

  protected readonly canCreate = computed(() => {
    // Embedded: the parent already knows the role for the filtered team, so we
    // never fetch all teams here — trust the override.
    if (this.teamFilter() !== null) return this.canCreateOverride() === true;
    return this.managerTeamIds().size > 0;
  });

  protected readonly canShowArchivedToggle = computed(() => {
    if (this.authService.currentUser()?.is_staff) return true;
    // Embedded: a manager of the filtered team may show archived programs.
    if (this.teamFilter() !== null) return this.canCreateOverride() === true;
    return this.managerTeamIds().size > 0;
  });

  /** Today as a local YYYY-MM-DD string — computed once (not in the template). */
  private readonly today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  /** A program is "current" when it's running today: date_start <= today <= date_end
   * (both bounds required; ISO strings are sliced to the date part for comparison). */
  protected isCurrent(p: Program): boolean {
    if (!p.date_start || !p.date_end || p.is_active === false) return false;
    return p.date_start.slice(0, 10) <= this.today && this.today <= p.date_end.slice(0, 10);
  }

  /** Card classes: archived (greyed) / current (emerald ring highlight) / default. */
  protected cardClass(p: Program): string {
    const base =
      'group block rounded-xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md';
    if (p.is_active === false) return `${base} border-gray-300 bg-gray-50 opacity-75`;
    if (this.isCurrent(p)) {
      return `${base} border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300 hover:border-emerald-400`;
    }
    return `${base} border-gray-200 bg-white hover:border-emerald-300`;
  }

  /** Static "new program" link; the team pre-selection rides in newQueryParams. */
  protected readonly newRouterLink = ['/programs', 'new'];

  protected readonly newQueryParams = computed(() => {
    const t = this.teamFilter();
    return t ? { team: t } : {};
  });

  constructor() {
    // Data stream (not a side-effecting effect): switchMap cancels the in-flight
    // request when the team/archived filter changes mid-flight, so overlapping
    // responses can't land out of order. See team-discussions (the convention).
    toObservable(
      computed(() => ({ team: this.teamFilter() ?? undefined, archived: this.showArchived() })),
    )
      .pipe(
        distinctUntilChanged((a, b) => a.team === b.team && a.archived === b.archived),
        tap(() => this.loading.set(true)),
        switchMap(({ team, archived }) =>
          this.programsService
            .programsList({
              includeInactive: archived || undefined,
              ordering: '-date_start',
              team,
            })
            .pipe(
              catchError(() => {
                // Surface the failure instead of silently showing an empty list.
                this.toast.error();
                return of(null);
              }),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.programs.set(res?.results ?? []);
        this.loading.set(false);
      });
  }

  ngOnInit(): void {
    // Standalone /programs route only: the embedded (teamFilter set) case gets
    // its affordances from canCreateOverride, so the all-teams fetch is skipped.
    if (this.teamFilter() === null) {
      this.loadManagerTeamIds();
    }
  }

  private loadManagerTeamIds(): void {
    const userId = this.authService.currentUser()?.id;
    if (userId == null) return;
    this.teamsService
      .teamsList({ isActive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const ids = new Set<number>();
          for (const t of res.results ?? []) {
            const role = computeTeamRole(t as Team, userId);
            if (role === 'owner' || role === 'manager') ids.add(t.id);
          }
          this.managerTeamIds.set(ids);
        },
        error: () => {
          // Without this, canCreate silently resolves false on failure and the
          // user loses the "new program" affordance with no explanation.
          this.toast.error();
        },
      });
  }
}
