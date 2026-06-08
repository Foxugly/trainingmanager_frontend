import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Me } from '../../../api/model/me';
import { UnreadTopic } from '../../../api/model/unread-topic';
import { AuthService } from '../../auth/auth.service';
import { MessagesService } from '../../messages/messages.service';
import { MessageBellComponent } from './message-bell.component';

const user = { id: 1, is_staff: false } as unknown as Me;

function topic(id: number, count: number): UnreadTopic {
  return {
    topic_id: id,
    team_id: 7,
    team_name: 'Squad',
    title: `t${id}`,
    unread_count: count,
    updated_at: '2026-06-06T00:00:00Z',
  };
}

interface Protected {
  hasUnread(): boolean;
  badgeValue(): string;
  onSelect(t: UnreadTopic): void;
  viewAll(): void;
}

describe('MessageBellComponent', () => {
  let fixture: ComponentFixture<MessageBellComponent>;
  let unread: ReturnType<typeof signal<number>>;
  let topics: ReturnType<typeof signal<UnreadTopic[]>>;
  let msgService: Record<string, ReturnType<typeof vi.fn> | unknown>;
  const access = (c: MessageBellComponent) => c as unknown as Protected;

  async function setup(opts: { unread?: number; topics?: UnreadTopic[]; user?: Me | null } = {}) {
    TestBed.resetTestingModule();
    unread = signal(opts.unread ?? 0);
    topics = signal<UnreadTopic[]>(opts.topics ?? [topic(1, 2), topic(2, 3)]);
    msgService = {
      unreadCount: unread.asReadonly(),
      topics: topics.asReadonly(),
      refreshUnread: vi.fn().mockReturnValue(of({ count: opts.unread ?? 0, topics: topics() })),
      loadUnread: vi.fn().mockReturnValue(of({ count: opts.unread ?? 0, topics: topics() })),
      reset: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        MessageBellComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal(opts.user ?? user).asReadonly() } },
        { provide: MessagesService, useValue: msgService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MessageBellComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a message trigger button', async () => {
    await setup({ unread: 0 });
    expect(fixture.nativeElement.querySelector('.msg-trigger')).toBeTruthy();
  });

  it('shows the overlay badge when there are unread messages', async () => {
    await setup({ unread: 5 });
    expect(access(fixture.componentInstance).hasUnread()).toBe(true);
    expect(fixture.nativeElement.querySelector('p-overlaybadge, p-overlayBadge')).toBeTruthy();
  });

  it('hides the badge when unread count is zero', async () => {
    await setup({ unread: 0 });
    expect(access(fixture.componentInstance).hasUnread()).toBe(false);
    expect(fixture.nativeElement.querySelector('p-overlaybadge, p-overlayBadge')).toBeFalsy();
  });

  it('caps the badge value at 99+', async () => {
    await setup({ unread: 150 });
    expect(access(fixture.componentInstance).badgeValue()).toBe('99+');
  });

  it('onSelect navigates to the topic discussion deep-link', async () => {
    await setup({ unread: 2 });
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(fixture.componentInstance).onSelect(topic(1, 2));
    expect(nav).toHaveBeenCalledWith(['/teams', 7], {
      queryParams: { tab: 'discussions', topic: 1 },
    });
  });

  it('viewAll navigates to /messages', async () => {
    await setup({ unread: 2 });
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    access(fixture.componentInstance).viewAll();
    expect(nav).toHaveBeenCalledWith(['/messages']);
  });

  it('refreshes unread once at startup when authenticated', async () => {
    await setup({ unread: 0 });
    expect((msgService['refreshUnread'] as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});
