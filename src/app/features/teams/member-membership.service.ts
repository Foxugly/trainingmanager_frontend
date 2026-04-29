import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import { MembersService } from '../../api/api/members.service';
import { TeamsService } from '../../api/api/teams.service';
import { Member } from '../../api/model/member';
import { TeamMembership } from '../../api/model/team-membership';

export interface CreateMemberAndAttachInput {
  firstname: string;
  lastname: string;
  email?: string | null;
  phonenumber?: string | null;
  user_id?: number | null;
}

export interface CreateMemberAndAttachResult {
  member: Member;
  membership: TeamMembership;
}

@Injectable({ providedIn: 'root' })
export class MemberMembershipService {
  private readonly membersService = inject(MembersService);
  private readonly teamsService = inject(TeamsService);

  createMemberAndAttach(
    input: CreateMemberAndAttachInput,
    teamId: number,
  ): Observable<CreateMemberAndAttachResult> {
    return this.membersService.membersCreate(input as unknown as Member).pipe(
      switchMap((member) =>
        this.teamsService
          .teamsMembershipsCreate(teamId, { member: member.id } as unknown as TeamMembership)
          .pipe(map((membership) => ({ member, membership }))),
      ),
    );
  }
}
