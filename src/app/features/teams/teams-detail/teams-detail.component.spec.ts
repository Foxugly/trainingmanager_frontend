import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationsService } from '../../../api/api/invitations.service';
import { JoinRequestsService } from '../../../api/api/join-requests.service';
import { MembersService } from '../../../api/api/members.service';
import { TeamsService } from '../../../api/api/teams.service';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { InvitationStatusEnum } from '../../../api/model/invitation-status-enum';
import { JoinRequestStatusEnum } from '../../../api/model/join-request-status-enum';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { TeamInvitation } from '../../../api/model/team-invitation';
import { TeamJoinRequest } from '../../../api/model/team-join-request';
import { TeamMembership } from '../../../api/model/team-membership';
import { AuthService } from '../../../core/auth/auth.service';
import { MemberMembershipService } from '../member-membership.service';
import { TeamRole } from '../teams-list/teams-list.component';
import { TeamsDetailComponent } from './teams-detail.component';

const ownerUser = { id: 17, username: 'testfrontend' } as CustomUserPublic;
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
  owner: ownerUser,
  managers: [],
  language: LanguageEnum.Fr,
  is_active: true,
  is_public: true,
  attendance_statuses: [],
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};
const inv1: TeamInvitation = {
  id: 11,
  team: 4,
  invited_by: 17,
  member: 0,
  email: 'pending@example.com',
  status: InvitationStatusEnum.Pending,
  created_at: '2026-04-29T00:00:00Z',
  expires_at: '2026-05-13T00:00:00Z',
  completed_at: null,
};

const joinReq1: TeamJoinRequest = {
  id: 77,
  user: 42,
  user_username: 'alice42',
  user_fullname: 'Alice Dupont',
  team: 4,
  status: JoinRequestStatusEnum.Pending,
  message: 'Salut, je viens du club voisin.',
  requested_at: '2026-05-01T00:00:00Z',
  responded_at: null,
  responded_by: null,
  responded_by_username: null,
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
  canManage(): boolean;
  isOwner(): boolean;
  activeTab(): string;
  requestsInvitationsCount(): number;
  myMembership(): TeamMembership | null;
  showAddMemberDialog(): boolean;
  openAddMember(): void;
  closeAddMember(): void;
  submitAddMember(): void;
  confirmRemoveMember(mb: TeamMembership): void;
  confirmDeactivate(): void;
  activeValue(): boolean;
  patchActive(id: number, value: boolean): unknown;
  addMemberForm: { patchValue(v: Record<string, unknown>): void; invalid: boolean };
  invitations(): TeamInvitation[];
  showInviteDialog(): boolean;
  inviteError(): string | null;
  openInviteDialog(): void;
  submitInvite(): void;
  confirmCancelInvitation(inv: TeamInvitation): void;
  inviteForm: { patchValue(v: Record<string, unknown>): void; invalid: boolean };
  joinRequests(): TeamJoinRequest[];
  loadingJoinRequests(): boolean;
  processingRequestId(): number | null;
  rejectingRequest(): TeamJoinRequest | null;
  rejectMessage(): string;
  confirmAcceptJoinRequest(req: TeamJoinRequest): void;
  openRejectDialog(req: TeamJoinRequest): void;
  closeRejectDialog(): void;
  submitReject(): void;
  myPendingRequest(): TeamJoinRequest | null;
  canRequestJoin(): boolean;
  isMemberOrAbove(): boolean;
  discussionRole(): TeamRole | null;
  currentUserId(): number;
  initialTopicId(): number | null;
  myMemberId(): number | null;
  isAthleteMember(): boolean;
  selectedStatsMember(): number | null;
  notesDialogOpen(): boolean;
  notesMembership(): TeamMembership | null;
  openNotes(mb: TeamMembership): void;
  onNotesDialogVisibleChange(value: boolean): void;
  anonymizing(): boolean;
  confirmAnonymizeMember(mb: TeamMembership): void;
  joinMessage(): string;
  joinError(): string | null;
  showJoinDialog(): boolean;
  openJoinDialog(): void;
  closeJoinDialog(): void;
  submitJoinRequest(): void;
  confirmCancelMyRequest(): void;
}

describe('TeamsDetailComponent', () => {
  let fixture: ComponentFixture<TeamsDetailComponent>;
  let component: TeamsDetailComponent;
  let serviceMock: {
    teamsRetrieve: ReturnType<typeof vi.fn>;
    teamsMembershipsList: ReturnType<typeof vi.fn>;
    teamsMembershipsDestroy: ReturnType<typeof vi.fn>;
    teamsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  let invitationsMock: {
    invitationsList: ReturnType<typeof vi.fn>;
    invitationsCreate: ReturnType<typeof vi.fn>;
    invitationsDestroy: ReturnType<typeof vi.fn>;
  };
  let joinRequestsMock: {
    joinRequestsList: ReturnType<typeof vi.fn>;
    joinRequestsPartialUpdate: ReturnType<typeof vi.fn>;
    joinRequestsCreate: ReturnType<typeof vi.fn>;
  };
  let memberMembershipMock: { createMemberAndAttach: ReturnType<typeof vi.fn> };
  let membersMock: { membersAnonymize: ReturnType<typeof vi.fn> };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;
  let routeQueryParams: Record<string, string>;
  let router: Router;

  const access = (c: TeamsDetailComponent) => c as unknown as ProtectedFields;

  async function setup(
    idParam: string | null = '4',
    retrieveResult: Team | null = team,
    currentUser: CustomUserPublic = ownerUser,
    overrides: {
      memberships?: TeamMembership[];
      joinRequestsList?: { count: number; results: TeamJoinRequest[] };
      invitationsList?: { count: number; results: TeamInvitation[] };
      queryParams?: Record<string, string>;
    } = {},
  ) {
    TestBed.resetTestingModule();
    routeIdParam = idParam;
    routeQueryParams = overrides.queryParams ?? {};
    serviceMock = {
      teamsRetrieve: vi
        .fn()
        .mockReturnValue(retrieveResult ? of(retrieveResult) : throwError(() => new Error('404'))),
      teamsMembershipsList: vi.fn().mockReturnValue(of(overrides.memberships ?? [mb1])),
      teamsMembershipsDestroy: vi.fn().mockReturnValue(of(null)),
      teamsPartialUpdate: vi.fn().mockReturnValue(of(team)),
    };
    invitationsMock = {
      invitationsList: vi
        .fn()
        .mockReturnValue(of(overrides.invitationsList ?? { count: 1, results: [inv1] })),
      invitationsCreate: vi.fn().mockReturnValue(of(inv1)),
      invitationsDestroy: vi.fn().mockReturnValue(of(null)),
    };
    joinRequestsMock = {
      joinRequestsList: vi
        .fn()
        .mockReturnValue(of(overrides.joinRequestsList ?? { count: 1, results: [joinReq1] })),
      joinRequestsPartialUpdate: vi.fn().mockReturnValue(of({ ...joinReq1 })),
      joinRequestsCreate: vi.fn().mockReturnValue(of({ id: 99, team: 4, message: 'hi' })),
    };
    memberMembershipMock = {
      createMemberAndAttach: vi.fn().mockReturnValue(of({ member: { id: 99 }, membership: mb1 })),
    };
    membersMock = {
      membersAnonymize: vi.fn().mockReturnValue(of({ id: 23 })),
    };
    userSig = signal<CustomUserPublic | null>(currentUser);

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
        ConfirmationService,
        MessageService,
        { provide: TeamsService, useValue: serviceMock },
        { provide: InvitationsService, useValue: invitationsMock },
        { provide: JoinRequestsService, useValue: joinRequestsMock },
        { provide: MemberMembershipService, useValue: memberMembershipMock },
        { provide: MembersService, useValue: membersMock },
        {
          provide: AuthService,
          useValue: { currentUser: userSig.asReadonly(), refreshMe: vi.fn() },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => routeIdParam },
              queryParamMap: { get: (k: string) => routeQueryParams[k] ?? null },
            },
          },
        },
      ],
    })
      .overrideComponent(TeamsDetailComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TeamsDetailComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
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
    expect(access(component).canManage()).toBe(true);
    expect(access(component).isOwner()).toBe(true);
  });

  it('member-only user sees role member but cannot manage', async () => {
    // currentUserRole now reads memberships to detect 'member' (instead of
    // defaulting to 'member' for non-owner/non-manager). Mock the membership
    // so that otherUser appears as a real member.
    const memberOther: TeamMembership = { ...mb1, member_username: 'someone' };
    await setup('4', team, otherUser, { memberships: [memberOther] });
    expect(access(component).currentUserRole()).toBe('member');
    expect(access(component).canManage()).toBe(false);
    expect(access(component).isOwner()).toBe(false);
  });

  it('flags notFound when teamsRetrieve fails', async () => {
    await setup('4', null);
    expect(access(component).notFound()).toBe(true);
    expect(access(component).team()).toBeNull();
  });

  it('handles invalid route id', async () => {
    await setup('not-a-number');
    expect(access(component).notFound()).toBe(true);
    expect(serviceMock.teamsRetrieve).not.toHaveBeenCalled();
  });

  it('openAddMember shows the dialog and resets the form', () => {
    access(component).openAddMember();
    expect(access(component).showAddMemberDialog()).toBe(true);
  });

  it('submitAddMember chains createMemberAndAttach and reloads memberships', () => {
    access(component).openAddMember();
    access(component).addMemberForm.patchValue({ firstname: 'Mike', lastname: 'Doe' });
    access(component).submitAddMember();
    expect(memberMembershipMock.createMemberAndAttach).toHaveBeenCalledWith(
      { firstname: 'Mike', lastname: 'Doe', email: null, phonenumber: null },
      4,
    );
    expect(serviceMock.teamsMembershipsList).toHaveBeenCalledTimes(2);
    expect(access(component).showAddMemberDialog()).toBe(false);
  });

  it('openNotes opens the per-member notes dialog scoped to that membership', () => {
    access(component).openNotes(mb1);
    expect(access(component).notesDialogOpen()).toBe(true);
    expect(access(component).notesMembership()?.member).toBe(mb1.member);
  });

  it('onNotesDialogVisibleChange(false) closes the dialog and clears the membership', () => {
    access(component).openNotes(mb1);
    access(component).onNotesDialogVisibleChange(false);
    expect(access(component).notesDialogOpen()).toBe(false);
    expect(access(component).notesMembership()).toBeNull();
  });

  it('confirmAnonymizeMember anonymizes on accept, closes notes dialog and reloads memberships', () => {
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).openNotes(mb1);
    access(component).confirmAnonymizeMember(mb1);
    expect(membersMock.membersAnonymize).toHaveBeenCalledWith(mb1.member);
    expect(access(component).notesDialogOpen()).toBe(false);
    expect(access(component).notesMembership()).toBeNull();
    // initial load + reload after anonymize
    expect(serviceMock.teamsMembershipsList).toHaveBeenCalledTimes(2);
  });

  it('confirmAnonymizeMember is a no-op for a non-manager (coach-gated)', async () => {
    await setup('4', team, otherUser);
    expect(access(component).canManage()).toBe(false);
    access(component).confirmAnonymizeMember(mb1);
    expect(membersMock.membersAnonymize).not.toHaveBeenCalled();
  });

  it('confirmRemoveMember calls teamsMembershipsDestroy on accept', () => {
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).confirmRemoveMember(mb1);
    expect(serviceMock.teamsMembershipsDestroy).toHaveBeenCalledWith(1, 4);
  });

  it('confirmDeactivate calls teamsPartialUpdate with is_active=false and navigates to /teams', () => {
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).confirmDeactivate();
    expect(serviceMock.teamsPartialUpdate).toHaveBeenCalledWith(4, { is_active: false });
    expect(router.navigate).toHaveBeenCalledWith(['/teams']);
  });

  it('seeds activeValue from team.is_active on load', () => {
    expect(access(component).activeValue()).toBe(true);
  });

  it('patchActive calls teamsPartialUpdate with is_active as the 2nd arg', () => {
    serviceMock.teamsPartialUpdate.mockClear();
    access(component).patchActive(4, false);
    expect(serviceMock.teamsPartialUpdate).toHaveBeenCalledWith(4, { is_active: false });
  });

  it('loads invitations on init filtered by team and pending status', () => {
    expect(invitationsMock.invitationsList).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      InvitationStatusEnum.Pending,
      4,
    );
    expect(access(component).invitations()).toHaveLength(1);
  });

  it('non-manager (member) cannot manage and the template hides invitation controls', async () => {
    await setup('4', team, otherUser);
    expect(access(component).canManage()).toBe(false);
  });

  it('openInviteDialog opens the dialog', () => {
    access(component).openInviteDialog();
    expect(access(component).showInviteDialog()).toBe(true);
  });

  it('submitInvite calls invitationsCreate with team + payload and reloads', () => {
    access(component).openInviteDialog();
    access(component).inviteForm.patchValue({
      email: 'a@b.com',
      firstname: 'A',
      lastname: 'B',
    });
    access(component).submitInvite();
    expect(invitationsMock.invitationsCreate).toHaveBeenCalledWith({
      team: 4,
      email: 'a@b.com',
      firstname: 'A',
      lastname: 'B',
    });
    expect(invitationsMock.invitationsList).toHaveBeenCalledTimes(2);
    expect(access(component).showInviteDialog()).toBe(false);
  });

  it('submitInvite maps already_pending error to dedicated i18n key', () => {
    invitationsMock.invitationsCreate.mockReturnValueOnce(
      throwError(() => ({
        error: { fields: { email: [{ code: 'invitation_already_pending', detail: 'x' }] } },
      })),
    );
    access(component).openInviteDialog();
    access(component).inviteForm.patchValue({
      email: 'dup@b.com',
      firstname: 'A',
      lastname: 'B',
    });
    access(component).submitInvite();
    expect(access(component).inviteError()).toBe('teams.errors.invitation_already_pending');
  });

  it('submitInvite maps email_already_member error to dedicated i18n key', () => {
    invitationsMock.invitationsCreate.mockReturnValueOnce(
      throwError(() => ({
        error: { code: 'email_already_member', detail: 'already' },
      })),
    );
    access(component).openInviteDialog();
    access(component).inviteForm.patchValue({
      email: 'm@b.com',
      firstname: 'A',
      lastname: 'B',
    });
    access(component).submitInvite();
    expect(access(component).inviteError()).toBe('teams.errors.email_already_member');
  });

  it('confirmCancelInvitation calls invitationsDestroy on accept', () => {
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).confirmCancelInvitation(inv1);
    expect(invitationsMock.invitationsDestroy).toHaveBeenCalledWith(11);
  });

  it('loads pending join requests on init filtered by team', () => {
    expect(joinRequestsMock.joinRequestsList).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      JoinRequestStatusEnum.Pending,
      4,
    );
    expect(access(component).joinRequests()).toHaveLength(1);
  });

  it('confirmAcceptJoinRequest patches status=accepted and reloads list + memberships', () => {
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).confirmAcceptJoinRequest(joinReq1);
    expect(joinRequestsMock.joinRequestsPartialUpdate).toHaveBeenCalledWith(77, {
      status: JoinRequestStatusEnum.Accepted,
    });
    expect(joinRequestsMock.joinRequestsList).toHaveBeenCalledTimes(2);
    expect(serviceMock.teamsMembershipsList).toHaveBeenCalledTimes(2);
  });

  it('submitReject sends status=rejected with response_message and clears the dialog', () => {
    access(component).openRejectDialog(joinReq1);
    expect(access(component).rejectingRequest()).toEqual(joinReq1);
    (access(component) as unknown as { rejectMessage: { set(v: string): void } }).rejectMessage.set(
      'Sorry, full team',
    );
    access(component).submitReject();
    expect(joinRequestsMock.joinRequestsPartialUpdate).toHaveBeenCalledWith(77, {
      status: JoinRequestStatusEnum.Rejected,
      response_message: 'Sorry, full team',
    });
    expect(access(component).rejectingRequest()).toBeNull();
  });

  it('non-member visitor on a public team sees the join CTA', async () => {
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 0, results: [] },
    });
    expect(access(component).isMemberOrAbove()).toBe(false);
    expect(access(component).canRequestJoin()).toBe(true);
    expect(access(component).myPendingRequest()).toBeNull();
  });

  it('non-member with an existing pending request sees the chip, not the CTA', async () => {
    const myPending: TeamJoinRequest = { ...joinReq1, user: 99 };
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 1, results: [myPending] },
    });
    expect(access(component).myPendingRequest()).toEqual(myPending);
    expect(access(component).canRequestJoin()).toBe(false);
  });

  it('submitJoinRequest posts {team, message} and re-syncs state on success', async () => {
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 0, results: [] },
    });
    access(component).openJoinDialog();
    (access(component) as unknown as { joinMessage: { set(v: string): void } }).joinMessage.set(
      'Hi, swimmer here',
    );
    access(component).submitJoinRequest();
    expect(joinRequestsMock.joinRequestsCreate).toHaveBeenCalledWith({
      id: 0,
      team: 4,
      message: 'Hi, swimmer here',
    });
    expect(access(component).showJoinDialog()).toBe(false);
  });

  it('submitJoinRequest maps pending_request_exists error → loads pending + closes dialog', async () => {
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 0, results: [] },
    });
    joinRequestsMock.joinRequestsCreate.mockReturnValueOnce(
      throwError(() => ({
        error: { fields: { team: [{ code: 'pending_request_exists', detail: 'x' }] } },
      })),
    );
    const initialListCalls = joinRequestsMock.joinRequestsList.mock.calls.length;
    access(component).openJoinDialog();
    access(component).submitJoinRequest();
    expect(access(component).showJoinDialog()).toBe(false);
    // The error path triggers a refresh of the pending request via joinRequestsList.
    expect(joinRequestsMock.joinRequestsList.mock.calls.length).toBe(initialListCalls + 1);
  });

  it('submitJoinRequest maps team_not_public error to inline joinError', async () => {
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 0, results: [] },
    });
    joinRequestsMock.joinRequestsCreate.mockReturnValueOnce(
      throwError(() => ({
        error: { fields: { team: [{ code: 'team_not_public', detail: 'x' }] } },
      })),
    );
    access(component).openJoinDialog();
    access(component).submitJoinRequest();
    expect(access(component).joinError()).toBe('teams.join_request.errors.team_not_public');
    expect(access(component).showJoinDialog()).toBe(true);
  });

  it('cancelMyRequest PATCHes status=cancelled and clears the chip on success', async () => {
    const myPending: TeamJoinRequest = { ...joinReq1, user: 99 };
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 1, results: [myPending] },
    });
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((cfg) => {
      cfg.accept?.();
      return confirmation;
    });
    access(component).confirmCancelMyRequest();
    expect(joinRequestsMock.joinRequestsPartialUpdate).toHaveBeenCalledWith(77, {
      status: JoinRequestStatusEnum.Cancelled,
    });
    expect(access(component).myPendingRequest()).toBeNull();
  });

  it('currentUserRole returns null for non-member visitor on a public team', async () => {
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 0, results: [] },
    });
    expect(access(component).currentUserRole()).toBeNull();
  });

  it('default active tab on mount is "programs"', () => {
    expect(access(component).activeTab()).toBe('programs');
  });

  it('activeTab can switch to members and requests', () => {
    const tab = (component as unknown as { activeTab: { set(v: string): void } }).activeTab;
    tab.set('members');
    expect(access(component).activeTab()).toBe('members');
    tab.set('requests');
    expect(access(component).activeTab()).toBe('requests');
  });

  it('requestsInvitationsCount sums pending join requests + invitations', () => {
    // setup() default: 1 pending join request + 1 pending invitation
    expect(access(component).requestsInvitationsCount()).toBe(2);
  });

  it('requestsInvitationsCount returns 0 when no pending requests and no invitations', async () => {
    await setup('4', team, ownerUser, {
      joinRequestsList: { count: 0, results: [] },
      invitationsList: { count: 0, results: [] },
    });
    expect(access(component).requestsInvitationsCount()).toBe(0);
  });

  it('myMembership resolves to the current user’s membership entry when present', async () => {
    const myMb: TeamMembership = { ...mb1, member_username: otherUser.username };
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [myMb],
      joinRequestsList: { count: 0, results: [] },
    });
    expect(access(component).myMembership()).toEqual(myMb);
  });

  it('myMembership is null for a non-member visitor', async () => {
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 0, results: [] },
    });
    expect(access(component).myMembership()).toBeNull();
  });

  it('owner gets the aggregate Statistiques tab (canManage), not the athlete tab', () => {
    // default setup: ownerUser is owner of the team
    expect(access(component).canManage()).toBe(true);
    expect(access(component).isAthleteMember()).toBe(false);
    expect(access(component).selectedStatsMember()).toBeNull();
  });

  it('selectedStatsMember drives manager drill-down and resets to null', () => {
    const sel = (component as unknown as { selectedStatsMember: { set(v: number | null): void } })
      .selectedStatsMember;
    sel.set(23);
    expect(access(component).selectedStatsMember()).toBe(23);
    sel.set(null);
    expect(access(component).selectedStatsMember()).toBeNull();
  });

  it('athlete-member (non-manager) resolves myMemberId and gets the athlete tab', async () => {
    const myMb: TeamMembership = { ...mb1, member: 23, member_username: otherUser.username };
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [myMb],
      joinRequestsList: { count: 0, results: [] },
    });
    expect(access(component).canManage()).toBe(false);
    expect(access(component).myMemberId()).toBe(23);
    expect(access(component).isAthleteMember()).toBe(true);
  });

  it('non-member visitor has no athlete tab and no resolvable member id', async () => {
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 0, results: [] },
    });
    expect(access(component).myMemberId()).toBeNull();
    expect(access(component).isAthleteMember()).toBe(false);
  });

  it('discussionRole mirrors the owner role for a member-or-above viewer', () => {
    // default setup: ownerUser owns the team
    expect(access(component).discussionRole()).toBe('owner');
    expect(access(component).currentUserId()).toBe(ownerUser.id);
  });

  it('discussionRole is null for a non-member visitor', async () => {
    await setup('4', { ...team, is_public: true }, otherUser, {
      memberships: [],
      joinRequestsList: { count: 0, results: [] },
    });
    expect(access(component).discussionRole()).toBeNull();
  });

  it('deep-link ?tab=discussions&topic=10 selects the tab and seeds the topic id', async () => {
    await setup('4', team, ownerUser, { queryParams: { tab: 'discussions', topic: '10' } });
    expect(access(component).activeTab()).toBe('discussions');
    expect(access(component).initialTopicId()).toBe(10);
  });

  it('no deep-link leaves the default programs tab and a null initial topic', () => {
    expect(access(component).activeTab()).toBe('programs');
    expect(access(component).initialTopicId()).toBeNull();
  });
});
