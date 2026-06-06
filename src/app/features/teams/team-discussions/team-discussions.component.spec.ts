import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamsService } from '../../../api/api/teams.service';
import { AudienceEnum } from '../../../api/model/audience-enum';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { Team } from '../../../api/model/team';
import { Topic } from '../../../api/model/topic';
import { TopicCreationEnum } from '../../../api/model/topic-creation-enum';
import { TopicMessage } from '../../../api/model/topic-message';
import { TeamDiscussionsComponent, DiscussionRole } from './team-discussions.component';

const me: CustomUserPublic = { id: 1, username: 'me', first_name: 'Me', last_name: 'User' };
const other: CustomUserPublic = { id: 2, username: 'other', first_name: 'O', last_name: 'Ther' };

function makeTeam(over: Partial<Team> = {}): Team {
  return {
    id: 7,
    name: 'Team',
    sport: { id: 1 } as never,
    sport_id: 1,
    owner: me,
    managers: [],
    topic_creation: TopicCreationEnum.Coaches,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Team;
}

function makeTopic(over: Partial<Topic> = {}): Topic {
  return {
    id: 10,
    title: 'Sujet',
    audience: AudienceEnum.Team,
    allow_athlete_replies: true,
    author: me,
    message_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Topic;
}

function makeMessage(over: Partial<TopicMessage> = {}): TopicMessage {
  return {
    id: 100,
    content: '<p>Hello</p>',
    author: me,
    created_at: '2026-01-02T00:00:00Z',
    ...over,
  } as TopicMessage;
}

interface ProtectedFields {
  topics(): Topic[];
  selectedTopic(): Topic | null;
  messages(): TopicMessage[];
  canCreateTopic(): boolean;
  canReply(): boolean;
  isCoach(): boolean;
  canDeleteTopic(t: Topic): boolean;
  canDeleteMessage(m: TopicMessage): boolean;
  isOwnMessage(m: TopicMessage): boolean;
  openTopic(t: Topic): void;
  backToList(): void;
  openNewTopic(): void;
  submitNewTopic(): void;
  sendReply(): void;
  confirmDeleteTopic(t: Topic): void;
  confirmDeleteMessage(m: TopicMessage): void;
  newTopicTitle: { set(v: string): void };
  newTopicAudience: { set(v: AudienceEnum): void };
  replyContent: { set(v: string): void };
}

describe('TeamDiscussionsComponent', () => {
  let fixture: ComponentFixture<TeamDiscussionsComponent>;
  let component: TeamDiscussionsComponent;
  let teamsMock: {
    teamsTopicsList: ReturnType<typeof vi.fn>;
    teamsTopicsCreate: ReturnType<typeof vi.fn>;
    teamsTopicsDestroy: ReturnType<typeof vi.fn>;
    teamsTopicsMessagesList: ReturnType<typeof vi.fn>;
    teamsTopicsMessagesCreate: ReturnType<typeof vi.fn>;
    teamsTopicsMessagesDestroy: ReturnType<typeof vi.fn>;
  };
  let confirmationService: ConfirmationService;

  const access = (c: TeamDiscussionsComponent) => c as unknown as ProtectedFields;

  async function setup(opts: {
    team?: Team;
    role?: DiscussionRole;
    topics?: Topic[];
    messages?: TopicMessage[];
    currentUserId?: number;
  } = {}) {
    TestBed.resetTestingModule();
    const topics = opts.topics ?? [makeTopic()];
    const messages = opts.messages ?? [makeMessage()];
    teamsMock = {
      teamsTopicsList: vi.fn().mockReturnValue(of({ count: topics.length, results: topics })),
      teamsTopicsCreate: vi.fn().mockReturnValue(of(makeTopic({ id: 11, title: 'New' }))),
      teamsTopicsDestroy: vi.fn().mockReturnValue(of(undefined)),
      teamsTopicsMessagesList: vi
        .fn()
        .mockReturnValue(of({ count: messages.length, results: messages })),
      teamsTopicsMessagesCreate: vi.fn().mockReturnValue(of(makeMessage({ id: 101 }))),
      teamsTopicsMessagesDestroy: vi.fn().mockReturnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [
        TeamDiscussionsComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        MessageService,
        ConfirmationService,
        { provide: TeamsService, useValue: teamsMock },
      ],
    })
      .overrideComponent(TeamDiscussionsComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(TeamDiscussionsComponent);
    component = fixture.componentInstance;
    confirmationService = fixture.debugElement.injector.get(ConfirmationService);
    fixture.componentRef.setInput('teamId', (opts.team ?? makeTeam()).id);
    fixture.componentRef.setInput('team', opts.team ?? makeTeam());
    fixture.componentRef.setInput('role', opts.role ?? 'owner');
    fixture.componentRef.setInput('currentUserId', opts.currentUserId ?? me.id);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads topics for the team on init', () => {
    expect(teamsMock.teamsTopicsList).toHaveBeenCalledWith(7);
    expect(access(component).topics().length).toBe(1);
  });

  // --- canCreateTopic per policy/role ---

  it('owner policy: only owner can create', async () => {
    await setup({ team: makeTeam({ topic_creation: TopicCreationEnum.Owner }), role: 'owner' });
    expect(access(component).canCreateTopic()).toBe(true);
    await setup({ team: makeTeam({ topic_creation: TopicCreationEnum.Owner }), role: 'manager' });
    expect(access(component).canCreateTopic()).toBe(false);
    await setup({ team: makeTeam({ topic_creation: TopicCreationEnum.Owner }), role: 'member' });
    expect(access(component).canCreateTopic()).toBe(false);
  });

  it('coaches policy: owner+manager can create, member cannot', async () => {
    await setup({ team: makeTeam({ topic_creation: TopicCreationEnum.Coaches }), role: 'manager' });
    expect(access(component).canCreateTopic()).toBe(true);
    await setup({ team: makeTeam({ topic_creation: TopicCreationEnum.Coaches }), role: 'member' });
    expect(access(component).canCreateTopic()).toBe(false);
  });

  it('members policy: everyone (incl. member) can create', async () => {
    await setup({ team: makeTeam({ topic_creation: TopicCreationEnum.Members }), role: 'member' });
    expect(access(component).canCreateTopic()).toBe(true);
  });

  // --- create topic ---

  it('coach create sends the chosen audience + allow_athlete_replies', async () => {
    await setup({ role: 'owner' });
    access(component).newTopicTitle.set('Sujet A');
    access(component).newTopicAudience.set(AudienceEnum.Coaches);
    access(component).submitNewTopic();
    expect(teamsMock.teamsTopicsCreate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ title: 'Sujet A', audience: AudienceEnum.Coaches }),
    );
  });

  it('athlete create is forced to audience=team regardless of state', async () => {
    await setup({ role: 'member' });
    access(component).newTopicTitle.set('Sujet B');
    access(component).newTopicAudience.set(AudienceEnum.Coaches); // should be ignored
    access(component).submitNewTopic();
    expect(teamsMock.teamsTopicsCreate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ audience: AudienceEnum.Team }),
    );
  });

  it('create prepends the created topic to the list', async () => {
    await setup({ role: 'owner' });
    access(component).newTopicTitle.set('X');
    access(component).submitNewTopic();
    expect(access(component).topics()[0].title).toBe('New');
  });

  it('blank title does not submit', () => {
    access(component).newTopicTitle.set('   ');
    access(component).submitNewTopic();
    expect(teamsMock.teamsTopicsCreate).not.toHaveBeenCalled();
  });

  // --- thread + reply gating ---

  it('opening a topic loads its messages with (teamId, topicId)', () => {
    const topic = makeTopic({ id: 22 });
    access(component).openTopic(topic);
    expect(teamsMock.teamsTopicsMessagesList).toHaveBeenCalledWith(7, 22);
    expect(access(component).messages().length).toBe(1);
  });

  it('coach can always reply', async () => {
    await setup({ role: 'manager' });
    access(component).openTopic(makeTopic({ audience: AudienceEnum.Team, allow_athlete_replies: false }));
    expect(access(component).canReply()).toBe(true);
  });

  it('athlete can reply only on team topic with replies allowed', async () => {
    await setup({ role: 'member' });
    access(component).openTopic(makeTopic({ audience: AudienceEnum.Team, allow_athlete_replies: true }));
    expect(access(component).canReply()).toBe(true);

    access(component).openTopic(makeTopic({ audience: AudienceEnum.Team, allow_athlete_replies: false }));
    expect(access(component).canReply()).toBe(false);
  });

  // --- send message ---

  it('sendReply posts the content and appends it to the thread', () => {
    access(component).openTopic(makeTopic({ id: 30 }));
    access(component).replyContent.set('Bonjour');
    access(component).sendReply();
    expect(teamsMock.teamsTopicsMessagesCreate).toHaveBeenCalledWith(
      7,
      30,
      expect.objectContaining({ content: 'Bonjour' }),
    );
    expect(access(component).messages().some((m) => m.id === 101)).toBe(true);
  });

  it('sendReply is a no-op when the viewer cannot reply', async () => {
    await setup({ role: 'member' });
    access(component).openTopic(makeTopic({ audience: AudienceEnum.Coaches }));
    access(component).replyContent.set('nope');
    access(component).sendReply();
    expect(teamsMock.teamsTopicsMessagesCreate).not.toHaveBeenCalled();
  });

  // --- delete gating ---

  it('author or coach can delete a topic; a non-author athlete cannot', async () => {
    await setup({ role: 'member', currentUserId: me.id });
    expect(access(component).canDeleteTopic(makeTopic({ author: me }))).toBe(true);
    expect(access(component).canDeleteTopic(makeTopic({ author: other }))).toBe(false);

    await setup({ role: 'manager', currentUserId: me.id });
    expect(access(component).canDeleteTopic(makeTopic({ author: other }))).toBe(true);
  });

  it('author or coach can delete a message; a non-author athlete cannot', async () => {
    await setup({ role: 'member', currentUserId: me.id });
    expect(access(component).canDeleteMessage(makeMessage({ author: me }))).toBe(true);
    expect(access(component).canDeleteMessage(makeMessage({ author: other }))).toBe(false);
  });

  it('confirmDeleteTopic → destroy removes it from the list', () => {
    vi.spyOn(confirmationService, 'confirm').mockImplementation((o) => {
      o.accept?.();
      return confirmationService;
    });
    const topic = access(component).topics()[0];
    access(component).confirmDeleteTopic(topic);
    expect(teamsMock.teamsTopicsDestroy).toHaveBeenCalledWith(topic.id, 7);
    expect(access(component).topics().some((t) => t.id === topic.id)).toBe(false);
  });

  it('confirmDeleteMessage → destroy removes it from the thread', () => {
    access(component).openTopic(makeTopic({ id: 40 }));
    const msg = access(component).messages()[0];
    vi.spyOn(confirmationService, 'confirm').mockImplementation((o) => {
      o.accept?.();
      return confirmationService;
    });
    access(component).confirmDeleteMessage(msg);
    expect(teamsMock.teamsTopicsMessagesDestroy).toHaveBeenCalledWith(msg.id, 7, 40);
    expect(access(component).messages().some((m) => m.id === msg.id)).toBe(false);
  });

  it('isOwnMessage distinguishes the current user', () => {
    expect(access(component).isOwnMessage(makeMessage({ author: me }))).toBe(true);
    expect(access(component).isOwnMessage(makeMessage({ author: other }))).toBe(false);
  });
});
