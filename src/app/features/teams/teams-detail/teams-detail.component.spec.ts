import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { TeamMembership } from '../../../api/model/team-membership';
import { AuthService } from '../../../core/auth/auth.service';
import { TeamRole } from '../teams-list/teams-list.component';
import { TeamsDetailComponent } from './teams-detail.component';

const ownerUser = { id: 17, username: 'testfrontend' } as CustomUserPublic;
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
  owner: ownerUser,
  managers: [99],
  language: LanguageEnum.Fr,
  is_active: true,
  is_public: true,
  attendance_statuses: [],
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};
const mb1: TeamMembership = {
  id: 1,
  team: 4,
  member: 23,
  member_username: 'renaudvilain',
  member_fullname: 'Renaud Vilain',
  joined_at: '2026-04-10T00:00:00Z',
  left_at: null,
  created_at: '2026-04-10T00:00:00Z',
  updated_at: '2026-04-10T00:00:00Z',
};

interface ProtectedFields {
  team(): Team | null;
  memberships(): TeamMembership[];
  loading(): boolean;
  notFound(): boolean;
  currentUserRole(): TeamRole | null;
}

describe('TeamsDetailComponent', () => {
  let fixture: ComponentFixture<TeamsDetailComponent>;
  let component: TeamsDetailComponent;
  let serviceMock: {
    teamsRetrieve: ReturnType<typeof vi.fn>;
    teamsMembershipsList: ReturnType<typeof vi.fn>;
  };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;

  const access = (c: TeamsDetailComponent) => c as unknown as ProtectedFields;

  async function setup(idParam: string | null = '4', retrieveResult = team) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    serviceMock = {
      teamsRetrieve: vi.fn().mockReturnValue(retrieveResult ? of(retrieveResult) : throwError(() => new Error('404'))),
      teamsMembershipsList: vi.fn().mockReturnValue(of([mb1])),
    };
    userSig = signal<CustomUserPublic | null>(ownerUser);

    await TestBed.configureTestingModule({
      imports: [
        TeamsDetailComponent,
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
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeIdParam } } },
        },
      ],
    })
      .overrideComponent(TeamsDetailComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TeamsDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('loads team and memberships from route id on init', () => {
    expect(serviceMock.teamsRetrieve).toHaveBeenCalledWith(4);
    expect(serviceMock.teamsMembershipsList).toHaveBeenCalledWith(4);
    expect(access(component).team()?.id).toBe(4);
    expect(access(component).memberships()).toHaveLength(1);
  });

  it('computes the current user role from the loaded team', () => {
    expect(access(component).currentUserRole()).toBe('owner');
  });

  it('flags notFound when teamsRetrieve fails', async () => {
    await setup('4', null as unknown as Team);
    expect(access(component).notFound()).toBe(true);
    expect(access(component).team()).toBeNull();
  });

  it('handles invalid route id', async () => {
    await setup('not-a-number');
    expect(access(component).notFound()).toBe(true);
    expect(serviceMock.teamsRetrieve).not.toHaveBeenCalled();
  });
});
