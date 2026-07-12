import { UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tooltip } from 'primeng/tooltip';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { TeamsService } from '../../../api/api/teams.service';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';

export type TeamRole = 'owner' | 'manager' | 'member';

export function computeTeamRole(team: Team, userId: number): TeamRole {
  if (team.owner?.id === userId) return 'owner';
  if (team.managers?.some((m) => m.id === userId)) return 'manager';
  return 'member';
}

export interface TeamWithRole extends Team {
  role: TeamRole;
}

@Component({
  selector: 'app-teams-list',
  imports: [UpperCasePipe, RouterLink, Button, Skeleton, Tooltip, EmptyStateComponent, TranslocoPipe],
  templateUrl: './teams-list.component.html',
  styleUrl: './teams-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsListComponent implements OnInit {
  private readonly teamsService = inject(TeamsService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly teams = signal<Team[]>([]);
  protected readonly loading = signal(false);
  // Distinguish a backend failure from a genuinely empty list, so an error
  // doesn't masquerade as "no teams".
  protected readonly error = signal(false);

  protected readonly teamsWithRole = computed<TeamWithRole[]>(() => {
    const userId = this.authService.currentUser()?.id;
    if (userId == null) return [];
    return this.teams().map((t) => ({ ...t, role: computeTeamRole(t, userId) }));
  });

  protected readonly quota = computed(() => this.authService.currentUser()?.team_quota ?? null);
  protected readonly canCreate = computed(() => this.quota()?.can_create === true);
  protected readonly quotaIsLegacy = computed(() => {
    const q = this.quota();
    return q !== null && q.used > q.max;
  });

  // Token-based BEM (styles in the SCSS) so role chips dark-adapt.
  protected readonly roleClasses: Record<TeamRole, string> = {
    owner: 'teams-list__role teams-list__role--owner',
    manager: 'teams-list__role teams-list__role--manager',
    member: 'teams-list__role teams-list__role--member',
  };

  // Emerald icon pill (same soft treatment for every role); styles in the SCSS.
  protected readonly roleIconPillClass: Record<TeamRole, string> = {
    owner: 'teams-list__pill',
    manager: 'teams-list__pill',
    member: 'teams-list__pill',
  };

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.teamsService
      .teamsList({ isActive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.teams.set(res.results ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
