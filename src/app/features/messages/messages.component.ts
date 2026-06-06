import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { TeamsService } from '../../api/api/teams.service';
import { Team } from '../../api/model/team';

@Component({
  selector: 'app-messages',
  imports: [RouterLink, Button, Skeleton, EmptyStateComponent, TranslocoPipe],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesComponent implements OnInit {
  private readonly teamsService = inject(TeamsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly teams = signal<Team[]>([]);
  protected readonly loading = signal(false);

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
