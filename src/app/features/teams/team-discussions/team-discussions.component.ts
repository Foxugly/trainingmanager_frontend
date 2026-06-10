import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Popover } from 'primeng/popover';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { TeamsService } from '../../../api/api/teams.service';
import { AudienceEnum } from '../../../api/model/audience-enum';
import { PatchedTopicMessageRequest } from '../../../api/model/patched-topic-message-request';
import { Team } from '../../../api/model/team';
import { Topic } from '../../../api/model/topic';
import { TopicCreationEnum } from '../../../api/model/topic-creation-enum';
import { TopicMessage } from '../../../api/model/topic-message';
import { MessagesService } from '../../../core/messages/messages.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { RichEditorComponent } from '../../../shared/ui/rich-editor/rich-editor.component';
import { AttachmentListComponent } from '../../../shared/ui/attachment-list/attachment-list.component';
import { LocalizedDatePipe } from '../../../shared/datetime/localized-date.pipe';
import { EMOJIS } from './emojis';

/** owner | manager | member — the viewer's role within this team. */
export type DiscussionRole = 'owner' | 'manager' | 'member';

/** The thread message shape — `edited_at` now lives on the generated TopicMessage. */
type ThreadMessage = TopicMessage;

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
    LocalizedDatePipe,
    FormsModule,
    Button,
    Checkbox,
    ConfirmDialog,
    Dialog,
    InputText,
    Popover,
    Select,
    Tag,
    TranslocoPipe,
    EmptyStateComponent,
    RichEditorComponent,
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
  private readonly toast = inject(ToastService);
  private readonly messagesService = inject(MessagesService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  /** Topic ids already marked read this session (avoid spamming the endpoint). */
  private readonly markedReadTopicIds = new Set<number>();

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
  protected readonly messages = signal<ThreadMessage[]>([]);
  protected readonly loadingMessages = signal(false);

  /** Curated emoji set for the in-house picker (no external library). */
  protected readonly emojis = EMOJIS;

  // New-topic dialog
  protected readonly showNewTopic = signal(false);
  protected readonly creatingTopic = signal(false);
  protected readonly newTopicTitle = signal('');
  protected readonly newTopicAudience = signal<AudienceEnum>(AudienceEnum.Team);
  protected readonly newTopicAllowReplies = signal(true);

  // Reply box (rich HTML via app-rich-editor)
  protected readonly replyContent = signal('');
  protected readonly sendingReply = signal(false);

  // Inline edit (one message at a time)
  protected readonly editingMessageId = signal<number | null>(null);
  protected readonly editContent = signal('');
  protected readonly savingEdit = signal(false);

  /**
   * Which editor the emoji popover currently targets: the reply composer or the
   * inline edit box. Drives where a picked emoji is appended.
   */
  protected readonly emojiTarget = signal<'reply' | 'edit'>('reply');

  protected readonly isCoach = computed(() => this.role() === 'owner' || this.role() === 'manager');

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
      {
        label: this.transloco.translate('teams.discussions.audience_team'),
        value: AudienceEnum.Team,
      },
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
    // Reactively (re)load the topic list whenever the teamId input changes.
    // switchMap cancels an in-flight request if the team switches mid-load — a
    // data stream, not a side-effecting effect().
    toObservable(this.teamId)
      .pipe(
        tap(() => this.loadingTopics.set(true)),
        switchMap((teamId) =>
          this.teamsService.teamsTopicsList({ teamPk: teamId }).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.loadingTopics.set(false);
        if (res === null) return;
        const results = res.results ?? [];
        this.topics.set(results);
        const target = this.initialTopicId();
        if (target != null && this.selectedTopic() === null) {
          const found = results.find((t) => t.id === target);
          if (found) this.openTopic(found);
        }
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

  protected get editContentModel(): string {
    return this.editContent();
  }
  protected set editContentModel(v: string) {
    this.editContent.set(v);
  }

  /** True when the rich-editor HTML has no visible text/content. */
  private isBlankHtml(html: string): boolean {
    return (
      html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim().length === 0
    );
  }

  protected replyIsBlank(): boolean {
    return this.isBlankHtml(this.replyContent());
  }

  protected editIsBlank(): boolean {
    return this.isBlankHtml(this.editContent());
  }

  protected canDeleteTopic(topic: Topic): boolean {
    return this.isCoach() || topic.author?.id === this.currentUserId();
  }

  protected canDeleteMessage(msg: TopicMessage): boolean {
    return this.isCoach() || msg.author?.id === this.currentUserId();
  }

  /** Editing is author-only (a coach may delete others' posts but not rewrite them). */
  protected canEditMessage(msg: TopicMessage): boolean {
    return msg.author?.id === this.currentUserId();
  }

  protected isEdited(msg: ThreadMessage): boolean {
    return msg.edited_at != null;
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

  protected authorName(
    user: { first_name: string; last_name: string; username: string } | undefined,
  ): string {
    if (!user) return '';
    const full = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
    return full || user.username || '';
  }

  protected openTopic(topic: Topic): void {
    this.selectedTopic.set(topic);
    this.replyContent.set('');
    this.editingMessageId.set(null);
    this.editContent.set('');
    this.loadMessages(topic);
    this.markTopicRead(topic);
  }

  /**
   * Mark the topic read up to now (once per open), then refresh the topmenu
   * unread badge so it drops. Best-effort: failures are silent.
   */
  private markTopicRead(topic: Topic): void {
    if (this.markedReadTopicIds.has(topic.id)) return;
    this.markedReadTopicIds.add(topic.id);
    this.teamsService
      .teamsTopicsRead({ id: topic.id, teamPk: this.teamId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.messagesService.refreshUnread().subscribe({ error: () => {} }),
        error: () => {
          // Allow a retry on a later open if the call failed.
          this.markedReadTopicIds.delete(topic.id);
        },
      });
  }

  protected backToList(): void {
    this.selectedTopic.set(null);
    this.messages.set([]);
    this.editingMessageId.set(null);
    this.editContent.set('');
  }

  private loadMessages(topic: Topic): void {
    this.loadingMessages.set(true);
    this.teamsService
      .teamsTopicsMessagesList({ teamPk: this.teamId(), topicPk: topic.id })
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
    const allowReplies = audience === AudienceEnum.Team ? this.newTopicAllowReplies() : false;

    this.creatingTopic.set(true);
    const payload = {
      title,
      audience,
      allow_athlete_replies: allowReplies,
    };

    this.teamsService
      .teamsTopicsCreate({ teamPk: this.teamId(), topicRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.topics.update((list) => [created, ...list]);
          this.creatingTopic.set(false);
          this.showNewTopic.set(false);
          this.toast.success('teams.discussions.topic_created');
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
    if (!topic || this.isBlankHtml(content) || !this.canReply()) return;

    this.sendingReply.set(true);
    const payload = { content };
    this.teamsService
      .teamsTopicsMessagesCreate({
        teamPk: this.teamId(),
        topicPk: topic.id,
        topicMessageRequest: payload,
      })
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
            // Coalesce a missing updated_at to 0 so a null/undefined value
            // can't produce NaN and scramble the ordering.
            const ts = (t: { updated_at?: string | null }) =>
              t.updated_at ? new Date(t.updated_at).getTime() : 0;
            return [...updated].sort((a, b) => ts(b) - ts(a));
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

  // --- Edit message ---

  protected startEdit(msg: ThreadMessage): void {
    if (!this.canEditMessage(msg)) return;
    this.editingMessageId.set(msg.id);
    this.editContent.set(msg.content ?? '');
  }

  protected cancelEdit(): void {
    if (this.savingEdit()) return;
    this.editingMessageId.set(null);
    this.editContent.set('');
  }

  protected saveEdit(msg: ThreadMessage): void {
    const content = this.editContent().trim();
    if (this.editingMessageId() !== msg.id || this.isBlankHtml(content)) return;

    const topic = this.selectedTopic();
    if (!topic) return;

    this.savingEdit.set(true);
    // Edit the actual topic message via the nested endpoint (author-only); the
    // response carries `edited_at` back.
    const payload: PatchedTopicMessageRequest = { content };
    this.teamsService
      .teamsTopicsMessagesPartialUpdate({
        id: msg.id,
        teamPk: this.teamId(),
        topicPk: topic.id,
        patchedTopicMessageRequest: payload,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.messages.update((list) =>
            list.map((m) =>
              m.id === msg.id
                ? { ...m, content: updated.content, edited_at: updated.edited_at }
                : m,
            ),
          );
          this.savingEdit.set(false);
          this.editingMessageId.set(null);
          this.editContent.set('');
          this.toast.success('teams.discussions.message_updated');
        },
        error: () => {
          this.savingEdit.set(false);
          this.notifyError();
        },
      });
  }

  // --- Emoji picker ---

  protected openEmojiPicker(target: 'reply' | 'edit', event: Event, popover: Popover): void {
    this.emojiTarget.set(target);
    popover.toggle(event);
  }

  /** Append the picked emoji to the active editor (cursor insertion is unreliable
   *  through the Quill CVA, so appending is the robust choice). */
  protected insertEmoji(emoji: string, popover: Popover): void {
    if (this.emojiTarget() === 'edit') {
      this.editContent.update((html) => this.appendEmoji(html, emoji));
    } else {
      this.replyContent.update((html) => this.appendEmoji(html, emoji));
    }
    popover.hide();
  }

  private appendEmoji(html: string, emoji: string): string {
    const base = html ?? '';
    if (this.isBlankHtml(base)) return `<p>${emoji}</p>`;
    // Parse with the browser's HTML parser and append the emoji as a text node
    // inside the last block element (so it lands within the final paragraph,
    // not after it), serializing back. Robust where the old regex was fragile
    // with nested/attributed tags, and safe — the emoji is added as text, so
    // serialization escapes it.
    const template = document.createElement('template');
    template.innerHTML = base;
    const target = template.content.lastElementChild ?? template.content;
    target.append(document.createTextNode(emoji));
    return template.innerHTML;
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
      .teamsTopicsDestroy({ id: topic.id, teamPk: this.teamId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.topics.update((list) => list.filter((t) => t.id !== topic.id));
          if (this.selectedTopic()?.id === topic.id) this.backToList();
          this.toast.success('teams.discussions.topic_deleted');
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
      .teamsTopicsMessagesDestroy({ id: msg.id, teamPk: this.teamId(), topicPk: topic.id })
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
          this.toast.success('teams.discussions.message_deleted');
        },
        error: () => this.notifyError(),
      });
  }

  private notifyError(): void {
    this.toast.error('teams.errors.unknown');
  }
}
