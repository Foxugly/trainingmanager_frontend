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
import { Notification } from '../../../api/model/notification';
import { AuthService } from '../../auth/auth.service';
import { NotificationService } from '../../notifications/notification.service';

const POLL_INTERVAL_MS = 60_000;

@Component({
  selector: 'app-notification-bell',
  imports: [TranslocoPipe, Popover, OverlayBadge],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent {
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly popover = viewChild<Popover>('panel');

  protected readonly unreadCount = this.notifications.unreadCount;
  protected readonly items = this.notifications.items;
  protected readonly loading = signal(false);
  protected readonly hasUnread = computed(() => this.unreadCount() > 0);
  protected readonly badgeValue = computed(() => {
    const n = this.unreadCount();
    return n > 99 ? '99+' : String(n);
  });

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Refresh on every successful navigation (when authenticated).
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
        this.notifications.reset();
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
    this.notifications.refreshUnread().subscribe({ error: () => {} });
  }

  protected toggle(event: Event): void {
    this.popover()?.toggle(event);
    this.loadRecent();
  }

  private loadRecent(): void {
    this.loading.set(true);
    this.notifications.loadRecent().subscribe({
      next: () => this.loading.set(false),
      error: () => this.loading.set(false),
    });
  }

  protected onSelect(notif: Notification): void {
    const go = () => {
      this.popover()?.hide();
      if (notif.url) {
        this.router.navigateByUrl(notif.url);
      }
    };
    if (notif.is_read) {
      go();
      return;
    }
    this.notifications.markRead(notif.id).subscribe({ next: go, error: go });
  }

  protected markAllRead(): void {
    this.notifications.markAllRead().subscribe({ error: () => {} });
  }

  /** Compact relative-ish time label for a notification timestamp. */
  protected shortTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diffSec = Math.round((Date.now() - then) / 1000);
    if (diffSec < 60) return 'now';
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d`;
    return new Date(then).toLocaleDateString();
  }
}
