import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../../api/api/notifications.service';
import { Notification } from '../../api/model/notification';
import { NotificationService } from './notification.service';

function notif(id: number, isRead: boolean): Notification {
  return {
    id,
    type: 'message_new_topic',
    title: `n${id}`,
    body: 'b',
    url: '/teams/1',
    is_read: isRead,
    created_at: '2026-06-06T00:00:00Z',
  } as Notification;
}

describe('NotificationService', () => {
  let api: {
    notificationsUnreadCountRetrieve: ReturnType<typeof vi.fn>;
    notificationsList: ReturnType<typeof vi.fn>;
    notificationsReadCreate: ReturnType<typeof vi.fn>;
    notificationsReadAllCreate: ReturnType<typeof vi.fn>;
  };
  let service: NotificationService;

  beforeEach(() => {
    api = {
      notificationsUnreadCountRetrieve: vi.fn().mockReturnValue(of({ count: 3 })),
      notificationsList: vi.fn().mockReturnValue(of({ results: [notif(1, false), notif(2, true)] })),
      notificationsReadCreate: vi.fn().mockReturnValue(of(notif(1, true))),
      notificationsReadAllCreate: vi.fn().mockReturnValue(of({ updated: 1 })),
    };
    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        { provide: NotificationsService, useValue: api },
      ],
    });
    service = TestBed.inject(NotificationService);
  });

  it('refreshUnread sets the unread count signal', () => {
    service.refreshUnread().subscribe();
    expect(service.unreadCount()).toBe(3);
  });

  it('loadRecent populates the items signal', () => {
    service.loadRecent().subscribe();
    expect(service.items().length).toBe(2);
    expect(api.notificationsList).toHaveBeenCalledWith(undefined, undefined, 1);
  });

  it('markRead flips the item to read and decrements the count', () => {
    service.refreshUnread().subscribe();
    service.loadRecent().subscribe();
    expect(service.unreadCount()).toBe(3);

    service.markRead(1).subscribe();
    expect(api.notificationsReadCreate).toHaveBeenCalledWith(1);
    expect(service.items().find((n) => n.id === 1)?.is_read).toBe(true);
    expect(service.unreadCount()).toBe(2);
  });

  it('markRead on an already-read item does not decrement the count', () => {
    service.refreshUnread().subscribe();
    service.loadRecent().subscribe();
    service.markRead(2).subscribe();
    expect(service.unreadCount()).toBe(3);
  });

  it('markAllRead zeroes the count and marks every item read', () => {
    service.refreshUnread().subscribe();
    service.loadRecent().subscribe();
    service.markAllRead().subscribe();
    expect(service.unreadCount()).toBe(0);
    expect(service.items().every((n) => n.is_read)).toBe(true);
  });

  it('reset clears state', () => {
    service.refreshUnread().subscribe();
    service.loadRecent().subscribe();
    service.reset();
    expect(service.unreadCount()).toBe(0);
    expect(service.items()).toEqual([]);
  });
});
