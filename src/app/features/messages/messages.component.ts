import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { TeamsService } from '../../api/api/teams.service';
import { AudienceEnum } from '../../api/model/audience-enum';
import { Team } from '../../api/model/team';
import { Topic } from '../../api/model/topic';

/** A topic enriched with the team it belongs to, for the aggregated list. */
export interface TopicRow {
  readonly topic: Topic;
  readonly teamId: number;
  readonly teamName: string;
  /** Epoch ms of last activity, used for sorting (precomputed — no Date() in template). */
  readonly activityTs: number;
}

@Component({
  selector: 'app-messages',
  imports: [DatePipe, RouterLink, Button, Skeleton, Tag, EmptyStateComponent, TranslocoPipe],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesComponent implements OnInit {
  private readonly teamsService = inject(TeamsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly AudienceEnum = AudienceEnum;

  protected readonly rows = signal<TopicRow[]>([]);
  protected readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.teamsService
      .teamsList(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.loadTopics(res.results ?? []),
        error: () => this.loading.set(false),
      });
  }

  /** Fan out one teamsTopicsList per team, merge + sort by most recent activity. */
  private loadTopics(teams: Team[]): void {
    if (teams.length === 0) {
      this.rows.set([]);
      this.loading.set(false);
      return;
    }

    const calls = teams.map((team) =>
      this.teamsService.teamsTopicsList(team.id).pipe(
        map((res) => (res.results ?? []).map((topic) => this.toRow(topic, team))),
        // A single team failing must not blank the whole list.
        catchError(() => of([] as TopicRow[])),
      ),
    );

    forkJoin(calls)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (perTeam) => {
          const merged = perTeam.flat().sort((a, b) => b.activityTs - a.activityTs);
          this.rows.set(merged);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private toRow(topic: Topic, team: Team): TopicRow {
    const ts = new Date(topic.updated_at ?? topic.created_at).getTime();
    return {
      topic,
      teamId: team.id,
      teamName: team.name,
      activityTs: Number.isNaN(ts) ? 0 : ts,
    };
  }

  /** Open the topic's discussion via the team-detail discussions tab (deep-link). */
  protected openTopic(row: TopicRow): void {
    this.router.navigate(['/teams', row.teamId], {
      queryParams: { tab: 'discussions', topic: row.topic.id },
    });
  }
}
