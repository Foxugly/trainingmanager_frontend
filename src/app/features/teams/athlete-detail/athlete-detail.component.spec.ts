import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembersService } from '../../../api/api/members.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Member } from '../../../api/model/member';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { AuthService } from '../../../core/auth/auth.service';
import { AthleteDetailComponent } from './athlete-detail.component';

const ownerUser = { id: 17, username: 'coach' } as CustomUserPublic;
const otherUser = { id: 99, username: 'someone' } as CustomUserPublic;

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const team: Team = {
  id: 4,
  name: 'RBP WP Senior',
  sport,
  sport_id: 1,
  sports: [{ id: 1, name: 'Sport', slug: 'sport', is_default: true, order: 0 }],
  owner: ownerUser,
  managers: [],
  language: LanguageEnum.Fr,
  is_active: true,
  is_public: true,
  attendance_statuses: [],
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const member: Member = {
  id: 23,
  firstname: 'Renaud',
  lastname: 'Vilain',
  fullname: 'Renaud Vilain',
  teams: [4],
  user: { id: 17, username: 'coach' } as CustomUserPublic,
  created_at: '2026-04-10T00:00:00Z',
  updated_at: '2026-04-10T00:00:00Z',
};

interface ProtectedFields {
  teamId(): number | null;
  memberId(): number | null;
  member(): Member | null;
  team(): Team | null;
  loading(): boolean;
  notFound(): boolean;
  canManage(): boolean;
  athleteName(): string;
}

describe('AthleteDetailComponent', () => {
  let fixture: ComponentFixture<AthleteDetailComponent>;
  let component: AthleteDetailComponent;
  let teamsMock: { teamsRetrieve: ReturnType<typeof vi.fn> };
  let membersMock: { membersRetrieve: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let router: Router;

  const access = (c: AthleteDetailComponent) => c as unknown as ProtectedFields;

  async function setup(
    currentUser: CustomUserPublic = ownerUser,
    overrides: {
      retrieveTeam?: Team | null;
      retrieveMember?: Member | null;
      params?: { teamId: string; memberId: string };
    } = {},
  ) {
    TestBed.resetTestingModule();
    const teamResult = overrides.retrieveTeam === undefined ? team : overrides.retrieveTeam;
    const memberResult = overrides.retrieveMember === undefined ? member : overrides.retrieveMember;
    const params = overrides.params ?? { teamId: '4', memberId: '23' };

    teamsMock = {
      teamsRetrieve: vi
        .fn()
        .mockReturnValue(teamResult ? of(teamResult) : throwError(() => new Error('404'))),
    };
    membersMock = {
      membersRetrieve: vi
        .fn()
        .mockReturnValue(memberResult ? of(memberResult) : throwError(() => new Error('404'))),
    };
    userSig = signal<CustomUserPublic | null>(currentUser);

    await TestBed.configureTestingModule({
      imports: [
        AthleteDetailComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: TeamsService, useValue: teamsMock },
        { provide: MembersService, useValue: membersMock },
        {
          provide: AuthService,
          useValue: { currentUser: userSig.asReadonly(), refreshMe: vi.fn() },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap(params)) },
        },
      ],
    })
      .overrideComponent(AthleteDetailComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(AthleteDetailComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('reads teamId/memberId from the route and loads the team + member', () => {
    expect(access(component).teamId()).toBe(4);
    expect(access(component).memberId()).toBe(23);
    expect(teamsMock.teamsRetrieve).toHaveBeenCalledWith({ id: 4 });
    expect(membersMock.membersRetrieve).toHaveBeenCalledWith({ id: 23 });
    expect(access(component).athleteName()).toBe('Renaud Vilain');
  });

  it('grants access (canManage) to a manager/owner of the team', () => {
    expect(access(component).canManage()).toBe(true);
    expect(access(component).notFound()).toBe(false);
  });

  it('redirects a non-manager viewer back to the team detail', async () => {
    await setup(otherUser);
    expect(access(component).canManage()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/teams', 4]);
  });

  it('flags not-found when the member retrieve 404s', async () => {
    await setup(ownerUser, { retrieveMember: null });
    expect(access(component).notFound()).toBe(true);
  });
});
