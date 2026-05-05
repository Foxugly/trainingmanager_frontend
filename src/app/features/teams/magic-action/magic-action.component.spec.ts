import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JoinMagicService } from '../../../api/api/join-magic.service';
import { ActionProposedEnum } from '../../../api/model/action-proposed-enum';
import { JoinMagicCancelledResponseCodeEnum } from '../../../api/model/join-magic-cancelled-response-code-enum';
import { MagicActionJoinRequestStatusEnum } from '../../../api/model/magic-action-join-request-status-enum';
import { TeamJoinRequestMagicActionResponse } from '../../../api/model/team-join-request-magic-action-response';
import { MagicActionComponent } from './magic-action.component';

function makePreview(
  overrides: Partial<TeamJoinRequestMagicActionResponse['join_request']> = {},
  topLevel: Partial<Omit<TeamJoinRequestMagicActionResponse, 'join_request'>> = {},
): TeamJoinRequestMagicActionResponse {
  return {
    join_request: {
      id: 77,
      team_id: 4,
      team_name: 'Sharks',
      requester_username: 'alice',
      requester_email: 'alice@example.com',
      message: 'Hi coach',
      requested_at: '2026-05-01T10:00:00Z',
      status: MagicActionJoinRequestStatusEnum.Pending,
      responded_at: null,
      responded_by: null,
      ...overrides,
    },
    action_proposed: ActionProposedEnum.Accept,
    would_change_decision: false,
    can_act: true,
    ...topLevel,
  };
}

interface ProtectedFields {
  loading(): boolean;
  executing(): boolean;
  executed(): boolean;
  data(): TeamJoinRequestMagicActionResponse | null;
  errorState(): string | null;
  confirmationCase(): string | null;
  isReversal(): boolean;
  canExecute(): boolean;
  execute(): void;
  dismissAndGoToTeam(): void;
}

describe('MagicActionComponent', () => {
  let fixture: ComponentFixture<MagicActionComponent>;
  let component: MagicActionComponent;
  let magicMock: {
    joinMagicRetrieve: ReturnType<typeof vi.fn>;
    joinMagicCreate: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  const access = (c: MagicActionComponent) => c as unknown as ProtectedFields;

  async function setup(opts: {
    token?: string | null;
    previewResult?: TeamJoinRequestMagicActionResponse | (() => never);
    previewError?: { status: number; error?: unknown };
  }) {
    TestBed.resetTestingModule();
    magicMock = {
      joinMagicRetrieve: vi.fn(),
      joinMagicCreate: vi.fn(),
    };
    if (opts.previewError) {
      magicMock.joinMagicRetrieve.mockReturnValue(throwError(() => opts.previewError));
    } else {
      magicMock.joinMagicRetrieve.mockReturnValue(
        of(opts.previewResult ?? makePreview()),
      );
    }

    const tokenValue = 'token' in opts ? opts.token : 'tok-abc';
    await TestBed.configureTestingModule({
      imports: [
        MagicActionComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: JoinMagicService, useValue: magicMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => tokenValue } } },
        },
      ],
    })
      .overrideComponent(MagicActionComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(MagicActionComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup({});
  });

  it('loads preview and exposes the parsed payload', () => {
    expect(magicMock.joinMagicRetrieve).toHaveBeenCalledWith('tok-abc');
    expect(access(component).data()?.join_request.team_name).toBe('Sharks');
    expect(access(component).errorState()).toBeNull();
  });

  it('confirmationCase = pending_accept for pending+accept', () => {
    expect(access(component).confirmationCase()).toBe('pending_accept');
    expect(access(component).canExecute()).toBe(true);
    expect(access(component).isReversal()).toBe(false);
  });

  it('confirmationCase = accepted_reject_reverse + isReversal=true for accepted+reject+would_change', async () => {
    await setup({
      previewResult: makePreview(
        { status: MagicActionJoinRequestStatusEnum.Accepted, responded_by: 'bob' },
        { action_proposed: ActionProposedEnum.Reject, would_change_decision: true },
      ),
    });
    expect(access(component).confirmationCase()).toBe('accepted_reject_reverse');
    expect(access(component).isReversal()).toBe(true);
    expect(access(component).canExecute()).toBe(true);
  });

  it('confirmationCase = accepted_accept_idle, canExecute=false (no-op already accepted)', async () => {
    await setup({
      previewResult: makePreview({ status: MagicActionJoinRequestStatusEnum.Accepted }),
    });
    expect(access(component).confirmationCase()).toBe('accepted_accept_idle');
    expect(access(component).canExecute()).toBe(false);
  });

  it('confirmationCase = cancelled_any when can_act=false', async () => {
    await setup({
      previewResult: makePreview(
        { status: MagicActionJoinRequestStatusEnum.Cancelled },
        { can_act: false },
      ),
    });
    expect(access(component).confirmationCase()).toBe('cancelled_any');
    expect(access(component).canExecute()).toBe(false);
  });

  it('execute() POSTs the token and reflects new status from response', async () => {
    magicMock.joinMagicCreate.mockReturnValue(
      of(makePreview({ status: MagicActionJoinRequestStatusEnum.Accepted, responded_by: 'me' })),
    );
    access(component).execute();
    expect(magicMock.joinMagicCreate).toHaveBeenCalledWith({ token: 'tok-abc' });
    expect(access(component).executed()).toBe(true);
    expect(access(component).data()?.join_request.status).toBe(
      MagicActionJoinRequestStatusEnum.Accepted,
    );
  });

  it('execute() handles 409 by hydrating cancelledSnapshot from the response body', () => {
    const cancelledBody = {
      ...makePreview(
        { status: MagicActionJoinRequestStatusEnum.Cancelled },
        { can_act: false },
      ),
      code: JoinMagicCancelledResponseCodeEnum.RequestCancelled,
      detail: 'cancelled',
    };
    magicMock.joinMagicCreate.mockReturnValue(
      throwError(() => ({ status: 409, error: cancelledBody })),
    );
    access(component).execute();
    expect(access(component).data()?.join_request.status).toBe(
      MagicActionJoinRequestStatusEnum.Cancelled,
    );
    expect(access(component).confirmationCase()).toBe('cancelled_any');
  });

  it('preview 400 → invalid_token error state', async () => {
    await setup({ previewError: { status: 400, error: { code: 'invalid_or_expired_token' } } });
    expect(access(component).errorState()).toBe('invalid_token');
    expect(access(component).data()).toBeNull();
  });

  it('preview 403 → forbidden error state', async () => {
    await setup({ previewError: { status: 403 } });
    expect(access(component).errorState()).toBe('forbidden');
  });

  it('preview 404 → not_found error state', async () => {
    await setup({ previewError: { status: 404 } });
    expect(access(component).errorState()).toBe('not_found');
  });

  it('dismissAndGoToTeam navigates to /teams/<team_id>', () => {
    access(component).dismissAndGoToTeam();
    expect(router.navigate).toHaveBeenCalledWith(['/teams', 4]);
  });

  it('missing :token route param → invalid_token immediately, no API call', async () => {
    await setup({ token: null });
    expect(magicMock.joinMagicRetrieve).not.toHaveBeenCalled();
    expect(access(component).errorState()).toBe('invalid_token');
  });
});
