import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationsService } from '../../../api/api/invitations.service';
import { JoinRequestsService } from '../../../api/api/join-requests.service';
import { InvitationStatusEnum } from '../../../api/model/invitation-status-enum';
import { JoinRequestStatusEnum } from '../../../api/model/join-request-status-enum';
import { TeamInvitation } from '../../../api/model/team-invitation';
import { TeamJoinRequest } from '../../../api/model/team-join-request';
import { TeamRequestsComponent } from './team-requests.component';

const inv1 = {
  id: 11,
  team: 4,
  email: 'inv@x.test',
  status: InvitationStatusEnum.Pending,
} as unknown as TeamInvitation;
const joinReq1 = {
  id: 77,
  team: 4,
  user: 9,
  user_username: 'jo',
  status: JoinRequestStatusEnum.Pending,
  requested_at: '2026-06-01T00:00:00Z',
} as unknown as TeamJoinRequest;

interface Protected {
  invitations(): TeamInvitation[];
  joinRequests(): TeamJoinRequest[];
  showInviteDialog(): boolean;
  inviteError(): string | null;
  rejectingRequest(): TeamJoinRequest | null;
  openInviteDialog(): void;
  submitInvite(): void;
  confirmCancelInvitation(inv: TeamInvitation): void;
  confirmAcceptJoinRequest(req: TeamJoinRequest): void;
  openRejectDialog(req: TeamJoinRequest): void;
  submitReject(): void;
  inviteForm: { patchValue(v: Record<string, unknown>): void };
  rejectMessage: { set(v: string): void };
}

describe('TeamRequestsComponent', () => {
  let fixture: ComponentFixture<TeamRequestsComponent>;
  let component: TeamRequestsComponent;
  let invitationsMock: {
    invitationsList: ReturnType<typeof vi.fn>;
    invitationsCreate: ReturnType<typeof vi.fn>;
    invitationsDestroy: ReturnType<typeof vi.fn>;
  };
  let joinRequestsMock: {
    joinRequestsList: ReturnType<typeof vi.fn>;
    joinRequestsPartialUpdate: ReturnType<typeof vi.fn>;
  };
  const access = (c: TeamRequestsComponent) => c as unknown as Protected;

  async function setup(
    opts: {
      invitations?: TeamInvitation[];
      joinRequests?: TeamJoinRequest[];
    } = {},
  ) {
    TestBed.resetTestingModule();
    // Fresh arrays per call so a reload genuinely changes the signal ref.
    invitationsMock = {
      invitationsList: vi
        .fn()
        .mockImplementation(() => of({ count: 1, results: [...(opts.invitations ?? [inv1])] })),
      invitationsCreate: vi.fn().mockReturnValue(of(inv1)),
      invitationsDestroy: vi.fn().mockReturnValue(of(null)),
    };
    joinRequestsMock = {
      joinRequestsList: vi
        .fn()
        .mockImplementation(() => of({ count: 1, results: [...(opts.joinRequests ?? [joinReq1])] })),
      joinRequestsPartialUpdate: vi.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [
        TeamRequestsComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: InvitationsService, useValue: invitationsMock },
        { provide: JoinRequestsService, useValue: joinRequestsMock },
        { provide: MessageService, useValue: { add: vi.fn() } },
      ],
    })
      .overrideComponent(TeamRequestsComponent, {
        set: {
          template: '',
          imports: [],
          providers: [
            {
              provide: ConfirmationService,
              useValue: {
                confirm: vi.fn().mockImplementation((o: { accept?: () => void }) => o.accept?.()),
              },
            },
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TeamRequestsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 4);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => setup());

  it('loads pending invitations + join requests on init, filtered by team', () => {
    expect(invitationsMock.invitationsList).toHaveBeenCalledWith({
      status: InvitationStatusEnum.Pending,
      team: 4,
    });
    expect(joinRequestsMock.joinRequestsList).toHaveBeenCalledWith({
      status: JoinRequestStatusEnum.Pending,
      team: 4,
    });
    expect(access(component).invitations()).toHaveLength(1);
    expect(access(component).joinRequests()).toHaveLength(1);
  });

  it('emits countChange = join requests + invitations', () => {
    let count: number | undefined;
    component.countChange.subscribe((n) => (count = n));
    // Re-trigger a load+emit after subscribing (the initial emit fired on init).
    fixture.componentRef.setInput('teamId', 5);
    fixture.detectChanges();
    expect(count).toBe(2);
  });

  it('submitInvite calls invitationsCreate with team + payload and reloads', () => {
    access(component).openInviteDialog();
    access(component).inviteForm.patchValue({ email: 'a@b.com', firstname: 'A', lastname: 'B' });
    access(component).submitInvite();
    expect(invitationsMock.invitationsCreate).toHaveBeenCalledWith({
      createInvitation: {
        team: 4,
        email: 'a@b.com',
        firstname: 'A',
        lastname: 'B',
      },
    });
    expect(invitationsMock.invitationsList).toHaveBeenCalledTimes(2);
    expect(access(component).showInviteDialog()).toBe(false);
  });

  it('submitInvite maps already_pending error to a dedicated i18n key', () => {
    invitationsMock.invitationsCreate.mockReturnValueOnce(
      throwError(() => ({
        error: { fields: { email: [{ code: 'invitation_already_pending', detail: 'x' }] } },
      })),
    );
    access(component).openInviteDialog();
    access(component).inviteForm.patchValue({ email: 'd@b.com', firstname: 'A', lastname: 'B' });
    access(component).submitInvite();
    expect(access(component).inviteError()).toBe('teams.errors.invitation_already_pending');
  });

  it('confirmCancelInvitation calls invitationsDestroy on accept', () => {
    access(component).confirmCancelInvitation(inv1);
    expect(invitationsMock.invitationsDestroy).toHaveBeenCalledWith({ id: 11 });
  });

  it('confirmAcceptJoinRequest accepts, reloads, and signals membershipsChanged', () => {
    const membershipsChanged = vi.fn();
    component.membershipsChanged.subscribe(membershipsChanged);
    access(component).confirmAcceptJoinRequest(joinReq1);
    expect(joinRequestsMock.joinRequestsPartialUpdate).toHaveBeenCalledWith({
      id: 77,
      patchedTeamJoinRequest: { status: JoinRequestStatusEnum.Accepted },
    });
    expect(joinRequestsMock.joinRequestsList).toHaveBeenCalledTimes(2);
    expect(membershipsChanged).toHaveBeenCalled();
  });

  it('submitReject sends status=rejected with response_message and clears the dialog', () => {
    access(component).openRejectDialog(joinReq1);
    expect(access(component).rejectingRequest()).toEqual(joinReq1);
    access(component).rejectMessage.set('full team');
    access(component).submitReject();
    expect(joinRequestsMock.joinRequestsPartialUpdate).toHaveBeenCalledWith({
      id: 77,
      patchedTeamJoinRequest: {
        status: JoinRequestStatusEnum.Rejected,
        response_message: 'full team',
      },
    });
    expect(access(component).rejectingRequest()).toBeNull();
  });
});
