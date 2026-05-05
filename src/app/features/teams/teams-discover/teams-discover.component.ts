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
import { InputText } from 'primeng/inputtext';
import { Skeleton } from 'primeng/skeleton';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { TeamsService } from '../../../api/api/teams.service';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-teams-discover',
  imports: [
    CommonModule,
    RouterLink,
    InputText,
    Skeleton,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  templateUrl: './teams-discover.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsDiscoverComponent implements OnInit {
  private readonly teamsService = inject(TeamsService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly teams = signal<Team[]>([]);
  protected readonly loading = signal(false);
  protected readonly query = signal('');

  protected readonly discoverable = computed<Team[]>(() => {
    const me = this.authService.currentUser();
    const all = this.teams();
    if (!me) return all.filter((t) => t.is_public);
    return all.filter(
      (t) =>
        t.is_public === true &&
        t.is_active !== false &&
        t.owner?.id !== me.id &&
        !(t.managers?.some((m) => m.id === me.id) ?? false),
    );
  });

  protected readonly filtered = computed<Team[]>(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.discoverable();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || (t.sport?.name ?? '').toLowerCase().includes(q),
    );
  });

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
