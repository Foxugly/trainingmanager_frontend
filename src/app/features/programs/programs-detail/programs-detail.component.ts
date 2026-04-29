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
import { Button } from 'primeng/button';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Program } from '../../../api/model/program';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { TeamRole, computeTeamRole } from '../../teams/teams-list/teams-list.component';
import {
  GenerateEventsDialogComponent,
  GenerateEventsResult,
} from '../generate-events-dialog/generate-events-dialog.component';

@Component({
  selector: 'app-programs-detail',
  imports: [
    CommonModule,
    RouterLink,
    Button,
    GenerateEventsDialogComponent,
    TranslocoPipe,
  ],
  templateUrl: './programs-detail.component.html',
  styleUrl: './programs-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramsDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly programsService = inject(ProgramsService);
  private readonly teamsService = inject(TeamsService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly programId = signal<number | null>(null);
  protected readonly program = signal<Program | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);

  protected readonly showGenerateDialog = signal(false);
  protected readonly lastGenerationResult = signal<GenerateEventsResult | null>(null);

  protected readonly currentUserRole = computed<TeamRole | null>(() => {
    const t = this.team();
    const userId = this.authService.currentUser()?.id;
    if (!t || userId == null) return null;
    return computeTeamRole(t, userId);
  });

  protected readonly canGenerate = computed(() => {
    const role = this.currentUserRole();
    return role === 'owner' || role === 'manager';
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }
    this.programId.set(id);
    this.loadProgram(id);
  }

  protected loadProgram(id: number): void {
    this.loading.set(true);
    this.programsService
      .programsRetrieve(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.program.set(p);
          this.loading.set(false);
          if (p.team?.id != null) {
            this.loadTeam(p.team.id);
          }
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  private loadTeam(teamId: number): void {
    this.teamsService
      .teamsRetrieve(teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => this.team.set(t),
      });
  }

  protected openGenerateDialog(): void {
    this.lastGenerationResult.set(null);
    this.showGenerateDialog.set(true);
  }

  protected onGenerated(result: GenerateEventsResult): void {
    this.lastGenerationResult.set(result);
    const id = this.programId();
    if (id != null) this.loadProgram(id);
  }
}
