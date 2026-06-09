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
import { Me } from '../../../api/model/me';
import { Sport } from '../../../api/model/sport';
import { TrainingTypeEnum } from '../../../api/model/training-type-enum';
import { Team } from '../../../api/model/team';
import { TeamQuotaStatus } from '../../../api/model/team-quota-status';
import { AuthService } from '../../../core/auth/auth.service';
import { TeamsListComponent, TeamRole, computeTeamRole } from './teams-list.component';

const ownerUser = { id: 17, username: 'testfrontend' } as CustomUserPublic;
const otherUser = { id: 20, username: 'coach2' } as CustomUserPublic;
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
    sports: [{ id: 1, name: 'Sport', slug: 'sport', is_default: true, order: 0, training_type: null }],
    sport_id: 1,
    owner: ownerUser,
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
    ...partial,
  };
}

const teamOwner = makeTeam({ id: 4, name: 'Team owner', owner: ownerUser });
const teamManager = makeTeam({
  id: 5,
  name: 'Team manager',
  owner: otherUser,
  managers: [ownerUser],
});
const teamMember = makeTeam({ id: 6, name: 'Team member', owner: otherUser, managers: [] });

interface ProtectedFields {
  teams(): Team[];
  loading(): boolean;
  teamsWithRole(): Array<Team & { role: TeamRole }>;
  quota(): TeamQuotaStatus | null;
  canCreate(): boolean;
  quotaIsLegacy(): boolean;
}

function makeMe(quota: TeamQuotaStatus): Me {
  return {
    id: 17,
    username: 'testfrontend',
    email: 'test@example.com',
    first_name: '',
    last_name: '',
    language: LanguageEnum.Fr,
    last_login: null,
    date_joined: '2026-01-01T00:00:00Z',
    is_staff: false,
    member_id: null,
    team_quota: quota,
    calendar_token: 'tok-test',
  };
}

describe('computeTeamRole()', () => {
  it('detects owner', () => {
    expect(computeTeamRole(teamOwner, 17)).toBe('owner');
  });
  it('detects manager', () => {
    expect(computeTeamRole(teamManager, 17)).toBe('manager');
  });
  it('falls back to member', () => {
    expect(computeTeamRole(teamMember, 17)).toBe('member');
  });
});

describe('TeamsListComponent', () => {
  let fixture: ComponentFixture<TeamsListComponent>;
  let component: TeamsListComponent;
  let serviceMock: { teamsList: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<Me | CustomUserPublic | null>>;

  const access = (c: TeamsListComponent) => c as unknown as ProtectedFields;

  async function setup(
    results: Team[] = [teamOwner, teamManager, teamMember],
    user: Me | CustomUserPublic | null = ownerUser,
  ) {
    TestBed.resetTestingModule();
    serviceMock = {
      teamsList: vi.fn().mockReturnValue(of({ count: results.length, results })),
    };
    userSig = signal<Me | CustomUserPublic | null>(user);

    await TestBed.configureTestingModule({
      imports: [
        TeamsListComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: TeamsService, useValue: serviceMock },
        {
          provide: AuthService,
          useValue: { currentUser: userSig.asReadonly() },
        },
      ],
    })
      .overrideComponent(TeamsListComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TeamsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads teams on init filtered by is_active=true', () => {
    expect(serviceMock.teamsList).toHaveBeenCalledTimes(1);
    expect(serviceMock.teamsList).toHaveBeenCalledWith({ isActive: true });
    expect(access(component).teams().length).toBe(3);
  });

  it('shows empty state when no teams', async () => {
    await setup([]);
    expect(access(component).teamsWithRole()).toEqual([]);
  });

  it('computes role per team based on currentUser id', () => {
    const list = access(component).teamsWithRole();
    expect(list.find((t) => t.id === 4)?.role).toBe('owner');
    expect(list.find((t) => t.id === 5)?.role).toBe('manager');
    expect(list.find((t) => t.id === 6)?.role).toBe('member');
  });

  it('quota=null when current user is not a Me (CustomUserPublic mock)', () => {
    expect(access(component).quota()).toBeNull();
    expect(access(component).canCreate()).toBe(false);
  });

  it('canCreate=true when team_quota.can_create is true', async () => {
    await setup([], makeMe({ used: 1, max: 3, can_create: true }));
    expect(access(component).quota()).toEqual({ used: 1, max: 3, can_create: true });
    expect(access(component).canCreate()).toBe(true);
    expect(access(component).quotaIsLegacy()).toBe(false);
  });

  it('canCreate=false when quota is reached', async () => {
    await setup([], makeMe({ used: 3, max: 3, can_create: false }));
    expect(access(component).canCreate()).toBe(false);
    expect(access(component).quotaIsLegacy()).toBe(false);
  });

  it('quotaIsLegacy=true when used > max (legacy user, quota dropped to 0)', async () => {
    await setup([], makeMe({ used: 3, max: 0, can_create: false }));
    expect(access(component).quotaIsLegacy()).toBe(true);
    expect(access(component).canCreate()).toBe(false);
  });
});
