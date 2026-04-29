import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembersService } from '../../api/api/members.service';
import { TeamsService } from '../../api/api/teams.service';
import { Member } from '../../api/model/member';
import { TeamMembership } from '../../api/model/team-membership';
import { MemberMembershipService } from './member-membership.service';

const member: Member = {
  id: 42,
  firstname: 'Mike',
  lastname: 'Doe',
  fullname: 'Mike Doe',
  email: null,
  phonenumber: null,
  teams: [],
  user: null as never,
  user_id: null,
  created_at: '2026-04-29T00:00:00Z',
  updated_at: '2026-04-29T00:00:00Z',
};

const membership: TeamMembership = {
  id: 7,
  team: 5,
  member: 42,
  member_username: '',
  member_fullname: 'Mike Doe',
  joined_at: '2026-04-29T00:00:00Z',
  left_at: null,
  created_at: '2026-04-29T00:00:00Z',
  updated_at: '2026-04-29T00:00:00Z',
};

describe('MemberMembershipService', () => {
  let service: MemberMembershipService;
  let membersMock: { membersCreate: ReturnType<typeof vi.fn> };
  let teamsMock: { teamsMembershipsCreate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    membersMock = { membersCreate: vi.fn() };
    teamsMock = { teamsMembershipsCreate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: MembersService, useValue: membersMock },
        { provide: TeamsService, useValue: teamsMock },
      ],
    });
    service = TestBed.inject(MemberMembershipService);
  });

  it('chains create member then create membership and returns both', async () => {
    membersMock.membersCreate.mockReturnValue(of(member));
    teamsMock.teamsMembershipsCreate.mockReturnValue(of(membership));

    const result = await new Promise<{ member: Member; membership: TeamMembership }>((resolve) => {
      service
        .createMemberAndAttach(
          { firstname: 'Mike', lastname: 'Doe' },
          5,
        )
        .subscribe(resolve);
    });

    expect(membersMock.membersCreate).toHaveBeenCalledWith({ firstname: 'Mike', lastname: 'Doe' });
    expect(teamsMock.teamsMembershipsCreate).toHaveBeenCalledWith(5, { member: 42 });
    expect(result.member.id).toBe(42);
    expect(result.membership.id).toBe(7);
  });

  it('propagates the error and skips attach when member creation fails', () => {
    const httpError = { status: 400 };
    membersMock.membersCreate.mockReturnValue(throwError(() => httpError));

    let caught: unknown;
    service
      .createMemberAndAttach({ firstname: 'X', lastname: 'Y' }, 5)
      .subscribe({ error: (err) => (caught = err) });

    expect(caught).toBe(httpError);
    expect(teamsMock.teamsMembershipsCreate).not.toHaveBeenCalled();
  });

  it('propagates the error when membership creation fails (member is created but orphan)', () => {
    membersMock.membersCreate.mockReturnValue(of(member));
    const httpError = { status: 400 };
    teamsMock.teamsMembershipsCreate.mockReturnValue(throwError(() => httpError));

    let caught: unknown;
    service
      .createMemberAndAttach({ firstname: 'Mike', lastname: 'Doe' }, 5)
      .subscribe({ error: (err) => (caught = err) });

    expect(membersMock.membersCreate).toHaveBeenCalledTimes(1);
    expect(teamsMock.teamsMembershipsCreate).toHaveBeenCalledTimes(1);
    expect(caught).toBe(httpError);
  });
});
