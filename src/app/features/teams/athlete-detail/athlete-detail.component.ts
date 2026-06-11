import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, of, switchMap, tap } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Skeleton } from 'primeng/skeleton';
import { MembersService } from '../../../api/api/members.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Member } from '../../../api/model/member';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { DetailHeaderComponent } from '../../../shared/ui/detail-header/detail-header.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PerformancePanelComponent } from '../../../shared/ui/performance-panel/performance-panel.component';
import { MemberNotesComponent } from '../member-notes/member-notes.component';
import { TeamStatsComponent } from '../team-stats/team-stats.component';

/**
 * Coach-facing per-athlete detail page (scoped to one team).
 *
 * Aggregates the athlete's attendance / volume / intensity (team-stats in
 * member-scoped mode), their performances, and the coach notes about them.
 * Hard-gated to managers/owners of the team: a non-manager viewer is
 * redirected back to the team detail. Reacts to route param changes so the
 * page can be reused for a different athlete without a full reload.
 */
@Component({
  selector: 'app-athlete-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    Skeleton,
    DetailHeaderComponent,
    EmptyStateComponent,
    TeamStatsComponent,
    PerformancePanelComponent,
    MemberNotesComponent,
  ],
  templateUrl: './athlete-detail.component.html',
  styleUrl: './athlete-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly membersService = inject(MembersService);
  private readonly teamsService = inject(TeamsService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly teamId = signal<number | null>(null);
  protected readonly memberId = signal<number | null>(null);

  protected readonly member = signal<Member | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);

  /** Manager/owner of THIS team — gates the whole page. */
  protected readonly canManage = computed<boolean>(() => {
    const t = this.team();
    const me = this.authService.currentUser();
    if (!t || !me) return false;
    if (t.owner?.id === me.id) return true;
    return t.managers?.some((m) => m.id === me.id) ?? false;
  });

  protected readonly athleteName = computed<string>(() => {
    const m = this.member();
    return m?.fullname?.trim() || m?.firstname || '';
  });

  protected readonly backLink = computed<(string | number)[]>(() => [
    '/teams',
    this.teamId() ?? '',
  ]);

  constructor() {
    // React to :teamId / :memberId param changes (reuse for another athlete).
    // A data stream (not a side-effecting load()): switchMap cancels the stale
    // in-flight fetches when the params change mid-flight, so overlapping
    // responses can never land out of order.
    //
    // Gating order matters: load the TEAM first, evaluate canManage, and ONLY
    // then fetch the member. A non-manager is redirected away without ever
    // hitting membersRetrieve — the member of someone else's team must not be
    // fetched just because the page was opened. (The previous forkJoin fired
    // both calls in parallel, leaking a member read for redirected viewers.)
    this.route.paramMap
      .pipe(
        tap((params) => {
          const teamId = Number(params.get('teamId'));
          const memberId = Number(params.get('memberId'));
          if (!Number.isFinite(teamId) || !Number.isFinite(memberId)) {
            this.notFound.set(true);
            return;
          }
          this.teamId.set(teamId);
          this.memberId.set(memberId);
          this.loading.set(true);
          this.notFound.set(false);
          this.member.set(null);
        }),
        switchMap((params) => {
          const teamId = Number(params.get('teamId'));
          const memberId = Number(params.get('memberId'));
          if (!Number.isFinite(teamId) || !Number.isFinite(memberId)) {
            return of(null);
          }
          return this.teamsService.teamsRetrieve({ id: teamId }).pipe(
            switchMap((t) => {
              this.team.set(t);
              // Coach-only page: redirect non-managers and skip the member read.
              if (!this.canManage()) {
                this.router.navigate(['/teams', t.id]);
                this.loading.set(false);
                return EMPTY;
              }
              return this.membersService.membersRetrieve({ id: memberId }).pipe(
                tap((m) => this.member.set(m)),
                catchError(() => {
                  this.notFound.set(true);
                  return of(null);
                }),
              );
            }),
            catchError(() => {
              this.router.navigate(['/teams']);
              this.loading.set(false);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result !== null) this.loading.set(false);
      });
  }
}
