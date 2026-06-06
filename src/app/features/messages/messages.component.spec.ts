import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamsService } from '../../api/api/teams.service';
import { LanguageEnum } from '../../api/model/language-enum';
import { Sport } from '../../api/model/sport';
import { Team } from '../../api/model/team';
import { MessagesComponent } from './messages.component';

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

function makeTeam(partial: Partial<Team>): Team {
  return {
    id: 0,
    name: 'T',
    sport,
    sport_id: 1,
    owner: { id: 17, username: 'me' },
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

interface ProtectedFields {
  teams(): Team[];
  loading(): boolean;
}

describe('MessagesComponent', () => {
  let fixture: ComponentFixture<MessagesComponent>;
  let component: MessagesComponent;
  let serviceMock: { teamsList: ReturnType<typeof vi.fn> };

  const access = (c: MessagesComponent) => c as unknown as ProtectedFields;

  async function setup(results: Team[] = []) {
    TestBed.resetTestingModule();
    serviceMock = {
      teamsList: vi.fn().mockReturnValue(of({ count: results.length, results })),
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
    expect(serviceMock.teamsList).toHaveBeenCalledWith(true);
    expect(access(component).loading()).toBe(false);
  });

  it('renders an empty state when the user has no teams', async () => {
    await setup([]);
    expect(access(component).teams()).toEqual([]);
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('messages.empty');
    expect(fixture.nativeElement.querySelector('app-empty-state')).toBeTruthy();
  });

  it('renders one card per team linking to the team detail', async () => {
    const teams = [makeTeam({ id: 4, name: 'Dolphins' }), makeTeam({ id: 5, name: 'Sharks' })];
    await setup(teams);
    expect(access(component).teams().length).toBe(2);
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('a[href^="/teams/"]'),
    ) as HTMLAnchorElement[];
    const hrefs = links.map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/teams/4');
    expect(hrefs).toContain('/teams/5');
    expect(fixture.nativeElement.querySelector('app-empty-state')).toBeFalsy();
  });
});
