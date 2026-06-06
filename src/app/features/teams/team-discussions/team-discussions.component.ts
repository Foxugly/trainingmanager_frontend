import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { TeamsService } from '../../../api/api/teams.service';
import { AudienceEnum } from '../../../api/model/audience-enum';
import { Team } from '../../../api/model/team';
import { Topic } from '../../../api/model/topic';
import { TopicCreationEnum } from '../../../api/model/topic-creation-enum';
import { TopicMessage } from '../../../api/model/topic-message';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { AttachmentListComponent } from '../../../shared/ui/attachment-list/attachment-list.component';

/** owner | manager | member — the viewer's role within this team. */
export type DiscussionRole = 'owner' | 'manager' | 'member';

/**
 * Team "Discussions" panel: a list of topics + a per-topic message thread.
 *
 * Visibility/permissions mirror the backend:
 *  - Coaches (owner|manager) see both team and coaches topics; athletes see
 *    only team topics (backend filters the list — no client gating needed).
 *  - Topic creation is gated by the team's `topic_creation` policy.
 *  - Athletes may only create audience=team topics; the audience select is
 *    therefore forced/hidden for them.
 *  - Posting a reply: coaches always; athletes iff the topic is audience=team
 *    AND allow_athlete_replies.
 *  - Deleting a topic / message: the author or any coach.
 */
@Component({
  selector: 'app-team-discussions',
  imports: [
    DatePipe,
    FormsModule,
    Button,
    ConfirmDialog,
    Dialog,
    InputText,
    Select,
    Tag,
    Textarea,
    TranslocoPipe,
    EmptyStateComponent,
    AttachmentListComponent,
  ],
  templateUrl: './team-discussions.component.html',
  styleUrl: './team-discussions.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamDiscussionsComponent {
  private readonly teamsService = inject(TeamsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamId = input.required<number>();
  readonly team = input.required<Team>();
  readonly role = input.required<DiscussionRole>();
  /** Current authenticated user id (for own-message styling + delete gating). */
  readonly currentUserId = input.required<number>();
  /** Optional deep-link: topic id to open on first load. */
  readonly initialTopicId = input<number | null>(null);

  protected readonly AudienceEnum = AudienceEnum;

  protected readonly topics = signal<Topic[]>([]);
  protected readonly loadingTopics = signal(false);

  protected readonly selectedTopic = signal<Topic | null>(null);
  protected readonly messages = signal<TopicMessage[]>([]);
  protected readonly loadingMessages = signal(false);

  // New-topic dialog
  protected readonly showNewTopic = signal(false);
  protected readonly creatingTopic = signal(false);
  protected readonly newTopicTitle = signal('');
  protected readonly newTopicAudience = signal<AudienceEnum>(AudienceEnum.Team);
  protected readonly newTopicAllowReplies = signal(true);

  // Reply box
  protected readonly replyContent = signal('');
  protected readonly sendingReply = signal(false);

  protected readonly isCoach = computed(
    () => this.role() === 'owner' || this.role() === 'manager',
  );

  /** Whether the viewer may create a topic, per the team's policy + role. */
  protected readonly canCreateTopic = computed<boolean>(() => {
    const policy = this.team().topic_creation ?? TopicCreationEnum.Coaches;
    const role = this.role();
    switch (policy) {
      case TopicCreationEnum.Owner:
        return role === 'owner';
      case TopicCreationEnum.Coaches:
        return role === 'owner' || role === 'manager';
      case TopicCreationEnum.Members:
        return role === 'owner' || role === 'manager' || role === 'member';
      default:
        return false;
    }
  });

  /** Audience options for the new-topic dialog (coaches only — athletes are forced to team). */
  protected readonly audienceOptions = computed(() => {
    this.transloco.getActiveLang();
    return [
      { label: this.transloco.translate('teams.discussions.audience_team'), value: AudienceEnum.Team },
      {
        label: this.transloco.translate('teams.discussions.audience_coaches'),
        value: AudienceEnum.Coaches,
      },
    ];
  });

  /** Whether the viewer may post a reply in the currently open topic. */
  protected readonly canReply = computed<boolean>(() => {
    const topic = this.selectedTopic();
    if (!topic) return false;
    if (this.isCoach()) return true;
    // Athlete: only on team-audience topics that allow athlete replies.
    return topic.audience === AudienceEnum.Team && topic.allow_athlete_replies === true;
  });

  constructor() {
    // Load the topic list once the teamId input is available.
    effect(() => {
      const id = this.teamId();
      this.loadTopics(id);
    });
  }

  // --- ngModel bridges (two-way binding over signals) ---
  protected get newTopicTitleModel(): string {
    return this.newTopicTitle();
  }
  protected set newTopicTitleModel(v: string) {
    this.newTopicTitle.set(v);
  }

  protected get newTopicAudienceModel(): AudienceEnum {
    return this.newTopicAudience();
  }
  protected set newTopicAudienceModel(v: AudienceEnum) {
    this.newTopicAudience.set(v);
  }

  protected get newTopicAllowRepliesModel(): boolean {
    return this.newTopicAllowReplies();
  }
  protected set newTopicAllowRepliesModel(v: boolean) {
    this.newTopicAllowReplies.set(v);
  }

  protected get replyContentModel(): string {
    return this.replyContent();
  }
  protected set replyContentModel(v: string) {
    this.replyContent.set(v);
  }

  protected canDeleteTopic(topic: Topic): boolean {
    return this.isCoach() || topic.author?.id === this.currentUserId();
  }

  protected canDeleteMessage(msg: TopicMessage): boolean {
    return this.isCoach() || msg.author?.id === this.currentUserId();
  }

  /**
   * Whether the viewer may attach files to a message: the message author or any
   * coach (owner/manager). Mirrors the backend's message-write authorization.
   */
  protected canAttachToMessage(msg: TopicMessage): boolean {
    return this.isCoach() || msg.author?.id === this.currentUserId();
  }

  protected isOwnMessage(msg: TopicMessage): boolean {
    return msg.author?.id === this.currentUserId();
  }

  protected authorName(user: { first_name: string; last_name: string; username: string } | undefined): string {
    if (!user) return '';
    const full = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
    return full || user.username || '';
  }

  private loadTopics(teamId: number): void {
    this.loadingTopics.set(true);
    this.teamsService
      .teamsTopicsList(teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.topics.set(res.results ?? []);
          this.loadingTopics.set(false);
          const target = this.initialTopicId();
          if (target != null && this.selectedTopic() === null) {
            const found = (res.results ?? []).find((t) => t.id === target);
            if (found) this.openTopic(found);
          }
        },
        error: () => this.loadingTopics.set(false),
      });
  }

  protected openTopic(topic: Topic): void {
    this.selectedTopic.set(topic);
    this.replyContent.set('');
    this.loadMessages(topic);
  }

  protected backToList(): void {
    this.selectedTopic.set(null);
    this.messages.set([]);
  }

  private loadMessages(topic: Topic): void {
    this.loadingMessages.set(true);
    this.teamsService
      .teamsTopicsMessagesList(this.teamId(), topic.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.messages.set(res.results ?? []);
          this.loadingMessages.set(false);
        },
        error: () => this.loadingMessages.set(false),
      });
  }

  // --- New topic ---

  protected openNewTopic(): void {
    this.newTopicTitle.set('');
    // Athletes can only create team-audience topics.
    this.newTopicAudience.set(AudienceEnum.Team);
    this.newTopicAllowReplies.set(true);
    this.showNewTopic.set(true);
  }

  protected closeNewTopic(): void {
    if (this.creatingTopic()) return;
    this.showNewTopic.set(false);
  }

  protected submitNewTopic(): void {
    const title = this.newTopicTitle().trim();
    if (!title) return;
    // Force team-audience for non-coaches regardless of any stale state.
    const audience = this.isCoach() ? this.newTopicAudience() : AudienceEnum.Team;
    const allowReplies =
      audience === AudienceEnum.Team ? this.newTopicAllowReplies() : false;

    this.creatingTopic.set(true);
    const payload = {
      title,
      audience,
      allow_athlete_replies: allowReplies,
    } as unknown as Topic;

    this.teamsService
      .teamsTopicsCreate(this.teamId(), payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.topics.update((list) => [created, ...list]);
          this.creatingTopic.set(false);
          this.showNewTopic.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.discussions.topic_created'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.creatingTopic.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail:
              (err?.error as { detail?: string } | null)?.detail ??
              this.transloco.translate('teams.errors.unknown'),
          });
        },
      });
  }

  // --- Reply ---

  protected sendReply(): void {
    const topic = this.selectedTopic();
    const content = this.replyContent().trim();
    if (!topic || !content || !this.canReply()) return;

    this.sendingReply.set(true);
    const payload = { content } as unknown as TopicMessage;
    this.teamsService
      .teamsTopicsMessagesCreate(this.teamId(), topic.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.messages.update((list) => [...list, created]);
          this.replyContent.set('');
          this.sendingReply.set(false);
          // Bump the topic's last-activity + message_count locally and re-sort.
          this.topics.update((list) => {
            const updated = list.map((t) =>
              t.id === topic.id
                ? {
                    ...t,
                    updated_at: created.created_at ?? new Date().toISOString(),
                    message_count: (t.message_count ?? 0) + 1,
                  }
                : t,
            );
            return [...updated].sort(
              (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
            );
          });
        },
        error: (err: HttpErrorResponse) => {
          this.sendingReply.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail:
              (err?.error as { detail?: string } | null)?.detail ??
              this.transloco.translate('teams.errors.unknown'),
          });
        },
      });
  }

  // --- Delete ---

  protected confirmDeleteTopic(topic: Topic): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('common.confirm'),
      message: this.transloco.translate('teams.discussions.delete_topic_confirm'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteTopic(topic),
    });
  }

  private deleteTopic(topic: Topic): void {
    this.teamsService
      .teamsTopicsDestroy(topic.id, this.teamId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.topics.update((list) => list.filter((t) => t.id !== topic.id));
          if (this.selectedTopic()?.id === topic.id) this.backToList();
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.discussions.topic_deleted'),
          });
        },
        error: () => this.notifyError(),
      });
  }

  protected confirmDeleteMessage(msg: TopicMessage): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('common.confirm'),
      message: this.transloco.translate('teams.discussions.delete_message_confirm'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteMessage(msg),
    });
  }

  private deleteMessage(msg: TopicMessage): void {
    const topic = this.selectedTopic();
    if (!topic) return;
    this.teamsService
      .teamsTopicsMessagesDestroy(msg.id, this.teamId(), topic.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messages.update((list) => list.filter((m) => m.id !== msg.id));
          this.topics.update((list) =>
            list.map((t) =>
              t.id === topic.id
                ? { ...t, message_count: Math.max(0, (t.message_count ?? 1) - 1) }
                : t,
            ),
          );
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('teams.discussions.message_deleted'),
          });
        },
        error: () => this.notifyError(),
      });
  }

  private notifyError(): void {
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: this.transloco.translate('teams.errors.unknown'),
    });
  }
}
