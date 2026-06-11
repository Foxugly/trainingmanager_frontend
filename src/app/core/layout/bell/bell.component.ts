import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { Popover } from 'primeng/popover';
import { OverlayBadge } from 'primeng/overlaybadge';
import { filter } from 'rxjs';
import { AuthService } from '../../auth/auth.service';

const POLL_INTERVAL_MS = 60_000;
/** Minimum gap before a navigation can re-trigger a poll (the interval +
 *  visibilitychange catch-up keep the data fresh between navigations). */
const NAV_POLL_THROTTLE_MS = 15_000;

/**
 * Presentational "bell" shell shared by the notification and message bells:
 * trigger button + overlay badge + popover chrome, and the whole poll
 * lifecycle (immediate fetch at login, every 60s, on navigation, paused while
 * the tab is hidden with a catch-up on return). The popover body is projected
 * by each wrapper, which also owns the data and the item actions.
 *
 * Contract:
 *  - `(poll)` fires when the wrapper should (re)fetch — only while authenticated
 *    and the tab is visible.
 *  - `(reset)` fires when auth drops (clear cached data).
 *  - `(opened)` fires when the popover opens (e.g. to lazy-load a recent list).
 *  - `close()` lets a wrapper dismiss the popover after an item action.
 */
@Component({
  selector: 'app-bell',
  imports: [Popover, OverlayBadge],
  templateUrl: './bell.component.html',
  styleUrl: './bell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** FontAwesome/PrimeIcons class for the trigger, e.g. `pi-bell`. */
  readonly icon = input.required<string>();
  /** Accessible label for the trigger button. */
  readonly label = input.required<string>();
  /** Unread count driving the badge (0 hides it). */
  readonly count = input<number>(0);
  /** styleClass forwarded to the PrimeNG popover. */
  readonly panelClass = input<string>('');

  readonly poll = output<void>();
  readonly reset = output<void>();
  readonly opened = output<void>();

  private readonly panel = viewChild<Popover>('panel');

  protected readonly hasUnread = computed(() => this.count() > 0);
  protected readonly badge = computed(() => {
    const n = this.count();
    return n > 99 ? '99+' : String(n);
  });

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Timestamp (ms) of the last poll emit; used to throttle the nav trigger. */
  private lastPollTs = 0;

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      // Throttle ONLY the navigation trigger: with 2 bells × (desktop+mobile)
      // mounted, every internal navigation would otherwise fan out several
      // unread requests. The 60s interval + visibilitychange catch-up still
      // keep the counts fresh.
      .subscribe(() => {
        if (Date.now() - this.lastPollTs < NAV_POLL_THROTTLE_MS) return;
        this.firePollIfActive();
      });

    effect(() => {
      const user = this.auth.currentUser();
      // Track only currentUser(); run the side effects (polling timers + the
      // reset output emit) untracked so emitting an output can't re-enter
      // change detection or register spurious dependencies.
      untracked(() => {
        if (user !== null) {
          this.startPolling();
        } else {
          this.stopPolling();
          this.reset.emit();
        }
      });
    });

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.destroyRef.onDestroy(() => {
      this.stopPolling();
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    });
  }

  /** Dismiss the popover (used by wrappers after an item action). */
  close(): void {
    this.panel()?.hide();
  }

  protected onShow(): void {
    this.opened.emit();
  }

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) this.firePollIfActive();
  };

  private startPolling(): void {
    this.firePollIfActive();
    if (this.pollTimer !== null) return;
    this.pollTimer = setInterval(() => this.firePollIfActive(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private firePollIfActive(): void {
    if (this.auth.currentUser() === null) return;
    if (document.hidden) return;
    this.lastPollTs = Date.now();
    this.poll.emit();
  }
}
