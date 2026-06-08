import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Me } from '../../../api/model/me';
import { Notification } from '../../../api/model/notification';
import { AuthService } from '../../auth/auth.service';
import { NotificationService } from '../../notifications/notification.service';
import { NotificationBellComponent } from './notification-bell.component';

const user = { id: 1, is_staff: false } as unknown as Me;

function notif(id: number, isRead: boolean): Notification {
  return {
    id, type: 'message_new_topic', title: `n${id}`, body: 'b',
    url: '/teams/1', is_read: isRead, created_at: '2026-06-06T00:00:00Z',
  } as Notification;
}

interface Protected {
  hasUnread(): boolean;
  badgeValue(): string;
  shortTime(iso: string): string;
  onSelect(n: Notification): void;
  markAllRead(): void;
}

describe('NotificationBellComponent', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let unread: ReturnType<typeof signal<number>>;
  let items: ReturnType<typeof signal<Notification[]>>;
  let notifService: Record<string, ReturnType<typeof vi.fn> | unknown>;
  const access = (c: NotificationBellComponent) => c as unknown as Protected;

  async function setup(opts: { unread?: number; user?: Me | null } = {}) {
    TestBed.resetTestingModule();
    unread = signal(opts.unread ?? 0);
    items = signal<Notification[]>([notif(1, false), notif(2, true)]);
    notifService = {
      unreadCount: unread.asReadonly(),
      items: items.asReadonly(),
      refreshUnread: vi.fn().mockReturnValue(of({ count: opts.unread ?? 0 })),
      loadRecent: vi.fn().mockReturnValue(of({ results: items() })),
      markRead: vi.fn().mockReturnValue(of(notif(1, true))),
      markAllRead: vi.fn().mockReturnValue(of({ updated: 1 })),
      reset: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        NotificationBellComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal(opts.user ?? user).asReadonly() } },
        { provide: NotificationService, useValue: notifService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a bell trigger button', async () => {
    await setup({ unread: 0 });
    expect(fixture.nativeElement.querySelector('.bell-trigger')).toBeTruthy();
  });

  it('shows the overlay badge when there are unread notifications', async () => {
    await setup({ unread: 5 });
    expect(access(fixture.componentInstance).hasUnread()).toBe(true);
    expect(fixture.nativeElement.querySelector('p-overlaybadge, p-overlayBadge')).toBeTruthy();
  });

  it('hides the badge when unread count is zero', async () => {
    await setup({ unread: 0 });
    expect(access(fixture.componentInstance).hasUnread()).toBe(false);
    expect(fixture.nativeElement.querySelector('p-overlaybadge, p-overlayBadge')).toBeFalsy();
  });

  it('onSelect marks unread notification read then navigates', async () => {
    await setup({ unread: 2 });
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    access(fixture.componentInstance).onSelect(notif(1, false));
    expect((notifService['markRead'] as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(1);
    expect(nav).toHaveBeenCalledWith('/teams/1');
  });

  it('onSelect on a read notification navigates without marking read', async () => {
    await setup({ unread: 1 });
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    access(fixture.componentInstance).onSelect(notif(2, true));
    expect((notifService['markRead'] as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/teams/1');
  });

  it('markAllRead delegates to the service', async () => {
    await setup({ unread: 3 });
    access(fixture.componentInstance).markAllRead();
    expect((notifService['markAllRead'] as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('refreshes unread once at startup when authenticated', async () => {
    await setup({ unread: 0 });
    expect((notifService['refreshUnread'] as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('shortTime returns a localized relative label (i18n, not hardcoded English)', async () => {
    await setup();
    const c = access(fixture.componentInstance);
    // Test env runs in the default language (fr): output must match Intl, not 'now'/'5m'.
    const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto', style: 'short' });
    expect(c.shortTime(new Date().toISOString())).toBe(rtf.format(0, 'second'));
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(c.shortTime(fiveMinAgo)).toBe(rtf.format(-5, 'minute'));
    expect(c.shortTime('not-a-date')).toBe('');
  });
});
