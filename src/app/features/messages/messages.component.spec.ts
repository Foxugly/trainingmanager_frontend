import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamsService } from '../../api/api/teams.service';
import { AudienceEnum } from '../../api/model/audience-enum';
import { LanguageEnum } from '../../api/model/language-enum';
import { Sport } from '../../api/model/sport';
import { TrainingTypeEnum } from '../../api/model/training-type-enum';
import { Team } from '../../api/model/team';
import { Topic } from '../../api/model/topic';
import { MessagesComponent, TopicRow } from './messages.component';

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
  default_training_type: TrainingTypeEnum.Structured,
};

function makeTeam(partial: Partial<Team>): Team {
  return {
    id: 0,
    name: 'T',
    sport,
    sport_id: 1,
    owner: { id: 17, first_name: 'M', last_name: 'E' },
    managers: [],
    language: LanguageEnum.Fr,
    is_active: true,
    is_public: true,
    attendance_statuses: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...partial,
  } as Team;
}

function makeTopic(partial: Partial<Topic>): Topic {
  return {
    id: 1,
    title: 'Topic',
    audience: AudienceEnum.Team,
    allow_athlete_replies: true,
    author: { id: 17, first_name: 'M', last_name: 'E' },
    message_count: 0,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...partial,
  } as Topic;
}

interface ProtectedFields {
  rows(): TopicRow[];
  loading(): boolean;
}

describe('MessagesComponent', () => {
  let fixture: ComponentFixture<MessagesComponent>;
  let component: MessagesComponent;
  let serviceMock: {
    teamsList: ReturnType<typeof vi.fn>;
    teamsTopicsList: ReturnType<typeof vi.fn>;
  };

  const access = (c: MessagesComponent) => c as unknown as ProtectedFields;

  async function setup(
    opts: {
      teams?: Team[];
      topicsByTeam?: Record<number, Topic[]>;
      failTeamId?: number;
    } = {},
  ) {
    TestBed.resetTestingModule();
    const teams = opts.teams ?? [];
    const topicsByTeam = opts.topicsByTeam ?? {};
    serviceMock = {
      teamsList: vi.fn().mockReturnValue(of({ count: teams.length, results: teams })),
      teamsTopicsList: vi.fn().mockImplementation((params: { teamPk: number }) => {
        const teamId = params.teamPk;
        if (opts.failTeamId === teamId) return throwError(() => new Error('boom'));
        const results = topicsByTeam[teamId] ?? [];
        return of({ count: results.length, results });
      }),
    };

    await TestBed.configureTestingModule({
      imports: [
        MessagesComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: TeamsService, useValue: serviceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MessagesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads teams on init filtered by is_active=true', () => {
    expect(serviceMock.teamsList).toHaveBeenCalledTimes(1);
    expect(serviceMock.teamsList).toHaveBeenCalledWith({ isActive: true });
    expect(access(component).loading()).toBe(false);
  });

  it('renders an empty state when the user has no teams', async () => {
    await setup({ teams: [] });
    expect(access(component).rows()).toEqual([]);
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('messages.empty');
    expect(fixture.nativeElement.querySelector('app-empty-state')).toBeTruthy();
    // No per-team topic fetch when there are no teams.
    expect(serviceMock.teamsTopicsList).not.toHaveBeenCalled();
  });

  it('aggregates topics across teams sorted by most recent activity', async () => {
    const teams = [makeTeam({ id: 4, name: 'Dolphins' }), makeTeam({ id: 5, name: 'Sharks' })];
    await setup({
      teams,
      topicsByTeam: {
        4: [makeTopic({ id: 40, title: 'Old', updated_at: '2026-01-01T00:00:00Z' })],
        5: [makeTopic({ id: 50, title: 'New', updated_at: '2026-05-01T00:00:00Z' })],
      },
    });
    expect(serviceMock.teamsTopicsList).toHaveBeenCalledWith({ teamPk: 4 });
    expect(serviceMock.teamsTopicsList).toHaveBeenCalledWith({ teamPk: 5 });
    const rows = access(component).rows();
    expect(rows.length).toBe(2);
    // Most recent first.
    expect(rows[0].topic.id).toBe(50);
    expect(rows[0].teamName).toBe('Sharks');
    expect(rows[1].topic.id).toBe(40);
  });

  it('a failing team does not blank the whole list', async () => {
    const teams = [makeTeam({ id: 4, name: 'Dolphins' }), makeTeam({ id: 5, name: 'Sharks' })];
    await setup({
      teams,
      topicsByTeam: { 5: [makeTopic({ id: 50, title: 'OK' })] },
      failTeamId: 4,
    });
    const rows = access(component).rows();
    expect(rows.length).toBe(1);
    expect(rows[0].topic.id).toBe(50);
  });

  it('clicking a topic navigates to the team discussions tab with the topic preselected', async () => {
    const teams = [makeTeam({ id: 4, name: 'Dolphins' })];
    await setup({ teams, topicsByTeam: { 4: [makeTopic({ id: 40 })] } });
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const row = access(component).rows()[0];
    (component as unknown as { openTopic(r: TopicRow): void }).openTopic(row);
    expect(navSpy).toHaveBeenCalledWith(['/teams', 4], {
      queryParams: { tab: 'discussions', topic: 40 },
    });
  });
});
