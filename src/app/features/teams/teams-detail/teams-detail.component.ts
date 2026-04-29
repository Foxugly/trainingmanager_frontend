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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TeamsService } from '../../../api/api/teams.service';
import { Team } from '../../../api/model/team';
import { TeamMembership } from '../../../api/model/team-membership';
import { AuthService } from '../../../core/auth/auth.service';
import { TeamRole, computeTeamRole } from '../teams-list/teams-list.component';

@Component({
  selector: 'app-teams-detail',
  imports: [CommonModule, RouterLink, TranslocoPipe],
  templateUrl: './teams-detail.component.html',
  styleUrl: './teams-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly teamsService = inject(TeamsService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly teamId = signal<number | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly memberships = signal<TeamMembership[]>([]);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);

  protected readonly currentUserRole = computed<TeamRole | null>(() => {
    const t = this.team();
    const userId = this.authService.currentUser()?.id;
    if (!t || userId == null) return null;
    return computeTeamRole(t, userId);
  });

  protected readonly roleClasses: Record<TeamRole, string> = {
    owner: 'text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-800',
    manager: 'text-xs font-semibold px-2 py-1 rounded bg-purple-100 text-purple-800',
    member: 'text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-800',
  };

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }
    this.teamId.set(id);
    this.loading.set(true);

    this.teamsService
      .teamsRetrieve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.team.set(t);
          this.loading.set(false);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });

    this.teamsService
      .teamsMembershipsList(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.memberships.set(list ?? []),
      });
  }
}
