import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Popover } from 'primeng/popover';
import { OverlayBadge } from 'primeng/overlaybadge';
import { filter } from 'rxjs';
import { UnreadTopic } from '../../../api/model/unread-topic';
import { AuthService } from '../../auth/auth.service';
import { MessagesService } from '../../messages/messages.service';

const POLL_INTERVAL_MS = 60_000;

@Component({
  selector: 'app-message-bell',
  imports: [TranslocoPipe, Popover, OverlayBadge],
  templateUrl: './message-bell.component.html',
  styleUrl: './message-bell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageBellComponent {
  private readonly messages = inject(MessagesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly popover = viewChild<Popover>('panel');

  protected readonly unreadCount = this.messages.unreadCount;
  protected readonly topics = this.messages.topics;
  protected readonly hasUnread = computed(() => this.unreadCount() > 0);
  protected readonly badgeValue = computed(() => {
    const n = this.unreadCount();
    return n > 99 ? '99+' : String(n);
  });

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Refresh on every successful navigation (when authenticated) — picks up
    // topics marked read after opening a discussion.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.pollIfAuthenticated());

    // Start/stop polling in lockstep with auth state.
    effect(() => {
      const authed = this.auth.currentUser() !== null;
      if (authed) {
        this.startPolling();
      } else {
        this.stopPolling();
        this.messages.reset();
      }
    });

    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  private startPolling(): void {
    // Immediate refresh at startup/login, then every 60s.
    this.pollIfAuthenticated();
    if (this.pollTimer !== null) return;
    this.pollTimer = setInterval(() => this.pollIfAuthenticated(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private pollIfAuthenticated(): void {
    if (this.auth.currentUser() === null) return;
    this.messages.refreshUnread().subscribe({ error: () => {} });
  }

  protected toggle(event: Event): void {
    this.popover()?.toggle(event);
  }

  /** Open a topic's discussion via the team-detail discussions tab (deep-link). */
  protected onSelect(topic: UnreadTopic): void {
    this.popover()?.hide();
    this.router.navigate(['/teams', topic.team_id], {
      queryParams: { tab: 'discussions', topic: topic.topic_id },
    });
  }

  protected viewAll(): void {
    this.popover()?.hide();
    this.router.navigate(['/messages']);
  }
}
