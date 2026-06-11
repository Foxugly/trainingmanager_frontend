import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { UnreadTopic } from '../../../api/model/unread-topic';
import { MessagesService } from '../../messages/messages.service';
import { BellComponent } from '../bell/bell.component';

@Component({
  selector: 'app-message-bell',
  imports: [TranslocoPipe, BellComponent, Button, Message],
  templateUrl: './message-bell.component.html',
  styleUrl: './message-bell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageBellComponent {
  private readonly messages = inject(MessagesService);
  private readonly router = inject(Router);

  private readonly bell = viewChild<BellComponent>('bell');

  protected readonly unreadCount = this.messages.unreadCount;
  protected readonly topics = this.messages.topics;
  // Distinguish a backend failure from a genuinely empty list, so an error
  // doesn't masquerade as "no discussions" (esp. while the badge is > 0).
  protected readonly error = signal(false);
  protected readonly hasUnread = computed(() => this.unreadCount() > 0);

  /** Poll tick from the shell — only fires while authenticated and visible. */
  protected onPoll(): void {
    this.error.set(false);
    this.messages.refreshUnread().subscribe({ error: () => this.error.set(true) });
  }

  /** Retry the unread/topics fetch after a failure. */
  protected retry(): void {
    this.onPoll();
  }

  /** Auth dropped — clear cached unread state. */
  protected onReset(): void {
    this.messages.reset();
  }

  /** Open a topic's discussion via the team-detail discussions tab (deep-link). */
  protected onSelect(topic: UnreadTopic): void {
    this.bell()?.close();
    this.router.navigate(['/teams', topic.team_id], {
      queryParams: { tab: 'discussions', topic: topic.topic_id },
    });
  }

  protected viewAll(): void {
    this.bell()?.close();
    this.router.navigate(['/messages']);
  }
}
