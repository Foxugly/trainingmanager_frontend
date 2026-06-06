import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { NotificationsService } from '../../api/api/notifications.service';
import { Notification } from '../../api/model/notification';

/**
 * Thin facade over the generated NotificationsService that holds the
 * topmenu-bell view state (unread count + recent items) as signals.
 *
 * Polling/lifecycle is owned by NotificationBellComponent — this service
 * only exposes the data + mutating methods.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = inject(NotificationsService);

  private readonly _unreadCount = signal(0);
  private readonly _items = signal<Notification[]>([]);

  readonly unreadCount = this._unreadCount.asReadonly();
  readonly items = this._items.asReadonly();

  /** Refresh the unread badge count (cheap; safe to poll). */
  refreshUnread(): Observable<{ count?: number }> {
    return this.api
      .notificationsUnreadCountRetrieve()
      .pipe(tap((res) => this._unreadCount.set(res.count ?? 0)));
  }

  /** Load the first page of recent notifications for the overlay panel. */
  loadRecent(): Observable<{ results?: Notification[] }> {
    return this.api
      .notificationsList(undefined, undefined, 1)
      .pipe(tap((res) => this._items.set(res.results ?? [])));
  }

  /** Mark one notification as read, updating local state optimistically. */
  markRead(id: number): Observable<Notification> {
    return this.api.notificationsReadCreate(id).pipe(
      tap(() => {
        let changed = false;
        this._items.update((items) =>
          items.map((n) => {
            if (n.id === id && !n.is_read) {
              changed = true;
              return { ...n, is_read: true };
            }
            return n;
          }),
        );
        if (changed) {
          this._unreadCount.update((c) => Math.max(0, c - 1));
        }
      }),
    );
  }

  /** Mark every notification as read. */
  markAllRead(): Observable<{ updated?: number }> {
    return this.api.notificationsReadAllCreate().pipe(
      tap(() => {
        this._items.update((items) => items.map((n) => ({ ...n, is_read: true })));
        this._unreadCount.set(0);
      }),
    );
  }

  /** Clear local state on logout. */
  reset(): void {
    this._unreadCount.set(0);
    this._items.set([]);
  }
}
