import { CommonModule } from '@angular/common';
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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
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
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
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
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.programs.set(res?.results ?? []);
        this.loading.set(false);
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
        error: () => {
          // Without this, canCreate silently resolves false on failure and the
          // user loses the "new program" affordance with no explanation.
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('common.load_failed'),
          });
        },
      });
  }
}
