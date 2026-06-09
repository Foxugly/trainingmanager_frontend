import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { computeTeamRole } from '../../teams/teams-list/teams-list.component';

@Component({
  selector: 'app-programs-list',
  imports: [
    CommonModule,
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
  private readonly destroyRef = inject(DestroyRef);

  readonly teamFilter = input<number | null>(null);

  protected readonly programs = signal<Program[]>([]);
  protected readonly loading = signal(false);
  protected readonly showArchived = signal(false);
  protected readonly managerTeamIds = signal<Set<number>>(new Set());

  protected readonly canCreate = computed(() => this.managerTeamIds().size > 0);

  protected readonly canShowArchivedToggle = computed(() => {
    if (this.authService.currentUser()?.is_staff) return true;
    return this.managerTeamIds().size > 0;
  });

  /** Static "new program" link; the team pre-selection rides in newQueryParams. */
  protected readonly newRouterLink = ['/programs', 'new'];

  protected readonly newQueryParams = computed(() => {
    const t = this.teamFilter();
    return t ? { team: t } : {};
  });

  constructor() {
    effect(() => {
      const team = this.teamFilter();
      const archived = this.showArchived();
      // untracked: the load() data path must not register extra effect deps
      // (the filters above are the only intended triggers).
      untracked(() => this.load(team ?? undefined, archived));
    });
  }

  ngOnInit(): void {
    this.loadManagerTeamIds();
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
      });
  }

  private load(team: number | undefined, includeArchived: boolean): void {
    this.loading.set(true);
    this.programsService
      .programsList({
        includeInactive: includeArchived || undefined,
        ordering: '-date_start',
        team,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.programs.set(res.results ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.programs.set([]);
          this.loading.set(false);
        },
      });
  }
}
