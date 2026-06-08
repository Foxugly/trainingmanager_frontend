import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { UnreadTopic } from '../../../api/model/unread-topic';
import { MessagesService } from '../../messages/messages.service';
import { BellComponent } from '../bell/bell.component';

@Component({
  selector: 'app-message-bell',
  imports: [TranslocoPipe, BellComponent],
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
  protected readonly hasUnread = computed(() => this.unreadCount() > 0);

  /** Poll tick from the shell — only fires while authenticated and visible. */
  protected onPoll(): void {
    this.messages.refreshUnread().subscribe({ error: () => {} });
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
