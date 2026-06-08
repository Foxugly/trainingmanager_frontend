import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { DiscussionsService } from '../../api/api/discussions.service';
import { UnreadSummary } from '../../api/model/unread-summary';
import { UnreadTopic } from '../../api/model/unread-topic';

/**
 * Thin facade over the generated DiscussionsService that holds the
 * topmenu message-bell view state (unread discussion count + topics) as
 * signals.
 *
 * Polling/lifecycle is owned by MessageBellComponent — this service only
 * exposes the data + refresh methods. Mirrors NotificationService.
 */
@Injectable({ providedIn: 'root' })
export class MessagesService {
  private readonly api = inject(DiscussionsService);

  private readonly _unreadCount = signal(0);
  private readonly _topics = signal<UnreadTopic[]>([]);

  readonly unreadCount = this._unreadCount.asReadonly();
  readonly topics = this._topics.asReadonly();

  /** Fetch the caller's unread discussion summary (count + topics). */
  loadUnread(): Observable<UnreadSummary> {
    return this.api.discussionsUnread().pipe(
      tap((res) => {
        this._unreadCount.set(res.count ?? 0);
        this._topics.set(res.topics ?? []);
      }),
    );
  }

  /** Alias for parity with NotificationService.refreshUnread (cheap; safe to poll). */
  refreshUnread(): Observable<UnreadSummary> {
    return this.loadUnread();
  }

  /** Clear local state on logout. */
  reset(): void {
    this._unreadCount.set(0);
    this._topics.set([]);
  }
}
