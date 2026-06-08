import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscussionsService } from '../../api/api/discussions.service';
import { UnreadSummary } from '../../api/model/unread-summary';
import { UnreadTopic } from '../../api/model/unread-topic';
import { MessagesService } from './messages.service';

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

describe('MessagesService', () => {
  let api: { discussionsUnread: ReturnType<typeof vi.fn> };
  let service: MessagesService;

  const summary: UnreadSummary = { count: 5, topics: [topic(1, 2), topic(2, 3)] };

  beforeEach(() => {
    api = { discussionsUnread: vi.fn().mockReturnValue(of(summary)) };
    TestBed.configureTestingModule({
      providers: [MessagesService, { provide: DiscussionsService, useValue: api }],
    });
    service = TestBed.inject(MessagesService);
  });

  it('loadUnread sets count + topics signals', () => {
    service.loadUnread().subscribe();
    expect(api.discussionsUnread).toHaveBeenCalled();
    expect(service.unreadCount()).toBe(5);
    expect(service.topics().length).toBe(2);
  });

  it('refreshUnread is an alias for loadUnread', () => {
    service.refreshUnread().subscribe();
    expect(api.discussionsUnread).toHaveBeenCalled();
    expect(service.unreadCount()).toBe(5);
  });

  it('tolerates a missing count/topics in the response', () => {
    api.discussionsUnread.mockReturnValue(of({} as UnreadSummary));
    service.loadUnread().subscribe();
    expect(service.unreadCount()).toBe(0);
    expect(service.topics()).toEqual([]);
  });

  it('reset clears state', () => {
    service.loadUnread().subscribe();
    service.reset();
    expect(service.unreadCount()).toBe(0);
    expect(service.topics()).toEqual([]);
  });
});
