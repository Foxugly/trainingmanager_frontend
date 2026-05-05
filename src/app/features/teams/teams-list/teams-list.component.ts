import { CommonModule } from '@angular/common';
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
  imports: [CommonModule, RouterLink, Button, TranslocoPipe],
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

  protected readonly roleClasses: Record<TeamRole, string> = {
    owner: 'text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-800',
    manager: 'text-xs font-semibold px-2 py-1 rounded bg-purple-100 text-purple-800',
    member: 'text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-800',
  };

  ngOnInit(): void {
    this.loading.set(true);
    this.teamsService
      .teamsList(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.teams.set(res.results ?? []);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
