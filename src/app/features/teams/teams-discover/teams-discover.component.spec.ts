import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { TeamsDiscoverComponent } from './teams-discover.component';

const me = { id: 17, username: 'me' } as CustomUserPublic;
const otherOwner = { id: 99, username: 'other' } as CustomUserPublic;

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

function makeTeam(overrides: Partial<Team>): Team {
  return {
    id: 0,
    name: '',
    sport,
    sports: [{ id: 1, name: 'Sport', slug: 'sport', is_default: true, order: 0 }],
    sport_id: 1,
    owner: otherOwner,
    managers: [],
    language: LanguageEnum.Fr,
    is_active: true,
    is_public: true,
    attendance_statuses: [],
    level: null,
    default_pool: '',
    places: [],
    default_place: null,
    equipment: [],
    logo_url: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

interface ProtectedFields {
  loading(): boolean;
  query(): string;
  discoverable(): Team[];
  filtered(): Team[];
}

describe('TeamsDiscoverComponent', () => {
  let fixture: ComponentFixture<TeamsDiscoverComponent>;
  let component: TeamsDiscoverComponent;
  let teamsMock: { teamsList: ReturnType<typeof vi.fn> };

  const access = (c: TeamsDiscoverComponent) => c as unknown as ProtectedFields;

  async function setup(teams: Team[]) {
    TestBed.resetTestingModule();
    teamsMock = {
      teamsList: vi.fn().mockReturnValue(of({ count: teams.length, results: teams })),
    };
    const userSig = signal<CustomUserPublic | null>(me);

    await TestBed.configureTestingModule({
      imports: [
        TeamsDiscoverComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: TeamsService, useValue: teamsMock },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
      ],
    })
      .overrideComponent(TeamsDiscoverComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(TeamsDiscoverComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup([
      makeTeam({ id: 1, name: 'Other Public', is_public: true, owner: otherOwner }),
      makeTeam({ id: 2, name: 'My Owned Team', is_public: true, owner: me }),
      makeTeam({ id: 3, name: 'I Manage', is_public: true, managers: [me], owner: otherOwner }),
      makeTeam({ id: 4, name: 'Other Public 2', is_public: true, owner: otherOwner }),
      makeTeam({ id: 5, name: 'Other Inactive', is_public: true, is_active: false, owner: otherOwner }),
    ]);
  });

  it('lists only public, active teams the user is not owner/manager of', () => {
    const ids = access(component).discoverable().map((t) => t.id);
    expect(ids).toEqual([1, 4]);
  });

  it('filtered() narrows by case-insensitive name or sport', async () => {
    (access(component) as unknown as { query: { set(v: string): void } }).query.set('public 2');
    expect(access(component).filtered().map((t) => t.id)).toEqual([4]);

    (access(component) as unknown as { query: { set(v: string): void } }).query.set('NATATION');
    expect(access(component).filtered().map((t) => t.id)).toEqual([1, 4]);
  });
});
