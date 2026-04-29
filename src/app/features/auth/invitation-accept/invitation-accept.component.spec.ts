import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationsService } from '../../../api/api/invitations.service';
import { InvitationStatusEnum } from '../../../api/model/invitation-status-enum';
import { Me } from '../../../api/model/me';
import { ValidateInvitation } from '../../../api/model/validate-invitation';
import { AuthService } from '../../../core/auth/auth.service';
import { InvitationAcceptComponent } from './invitation-accept.component';

const validInvitation: ValidateInvitation = {
  email: 'invitee@example.com',
  team_name: 'RBP WP Senior',
  status: InvitationStatusEnum.Pending,
  expires_at: '2026-05-13T00:00:00Z',
};

interface ProtectedFields {
  loading(): boolean;
  invitation(): ValidateInvitation | null;
  lookupError(): string | null;
  acceptError(): string | null;
  fieldErrors(): { [k: string]: string[] } | null;
  accepting(): boolean;
  canSubmit(): boolean;
  form: {
    patchValue(v: Record<string, unknown>): void;
    invalid: boolean;
    errors: Record<string, unknown> | null;
  };
  submit(): void;
  logout(): void;
}

describe('InvitationAcceptComponent', () => {
  let fixture: ComponentFixture<InvitationAcceptComponent>;
  let component: InvitationAcceptComponent;
  let invitationsMock: {
    invitationsLookupRetrieve: ReturnType<typeof vi.fn>;
    invitationsLookupCreate: ReturnType<typeof vi.fn>;
  };
  let authMock: {
    currentUser: ReturnType<typeof signal<Me | null>>;
    loginWithTokens: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let routeToken: string | null;
  let router: Router;

  const access = (c: InvitationAcceptComponent) => c as unknown as ProtectedFields;

  async function setup(
    token: string | null = 'tok-abc',
    lookupReturn: 'default' | { ok: ValidateInvitation } | { err: unknown } = 'default',
  ) {
    TestBed.resetTestingModule();
    routeToken = token;
    const lookupRetrieve = vi.fn();
    if (lookupReturn === 'default') {
      lookupRetrieve.mockReturnValue(of(validInvitation));
    } else if ('ok' in lookupReturn) {
      lookupRetrieve.mockReturnValue(of(lookupReturn.ok));
    } else {
      lookupRetrieve.mockReturnValue(throwError(() => lookupReturn.err));
    }
    invitationsMock = {
      invitationsLookupRetrieve: lookupRetrieve,
      invitationsLookupCreate: vi
        .fn()
        .mockReturnValue(of({ detail: 'ok', username: 'u', access: 'A', refresh: 'R' })),
    };
    const userSig = signal<Me | null>(null);
    authMock = {
      currentUser: userSig,
      loginWithTokens: vi.fn().mockReturnValue(of({ id: 1, username: 'u' })),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        InvitationAcceptComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: InvitationsService, useValue: invitationsMock },
        { provide: AuthService, useValue: authMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeToken } } },
        },
      ],
    })
      .overrideComponent(InvitationAcceptComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(InvitationAcceptComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('fetches the invitation on init', () => {
    expect(invitationsMock.invitationsLookupRetrieve).toHaveBeenCalledWith('tok-abc');
    expect(access(component).invitation()?.team_name).toBe('RBP WP Senior');
    expect(access(component).lookupError()).toBeNull();
    expect(access(component).canSubmit()).toBe(true);
  });

  it('flags unknown error when no token in route', async () => {
    await setup(null);
    expect(access(component).lookupError()).toBe('unknown');
    expect(invitationsMock.invitationsLookupRetrieve).not.toHaveBeenCalled();
  });

  it('flags expired error on 410 response', async () => {
    await setup('tok-x', {
      err: { status: 410, error: { code: 'invitation_expired' } },
    });
    expect(access(component).lookupError()).toBe('expired');
  });

  it('flags completed/cancelled when status is not pending', async () => {
    await setup('tok-c', {
      ok: { ...validInvitation, status: InvitationStatusEnum.Completed },
    });
    expect(access(component).lookupError()).toBe('completed');
    expect(access(component).canSubmit()).toBe(false);
  });

  it('rejects submit when passwords do not match', () => {
    access(component).form.patchValue({
      username: 'newathlete',
      password: 'StrongPass1!',
      password_confirm: 'StrongPass2!',
    });
    expect(access(component).form.invalid).toBe(true);
    access(component).submit();
    expect(invitationsMock.invitationsLookupCreate).not.toHaveBeenCalled();
  });

  it('on submit success calls accept then loginWithTokens then navigates to /teams', () => {
    access(component).form.patchValue({
      username: 'newathlete',
      password: 'StrongPass1!',
      password_confirm: 'StrongPass1!',
    });
    access(component).submit();
    expect(invitationsMock.invitationsLookupCreate).toHaveBeenCalledWith('tok-abc', {
      username: 'newathlete',
      password: 'StrongPass1!',
    });
    expect(authMock.loginWithTokens).toHaveBeenCalledWith('A', 'R');
    expect(router.navigate).toHaveBeenCalledWith(['/teams']);
  });

  it('maps username_taken field error from accept response', () => {
    invitationsMock.invitationsLookupCreate.mockReturnValueOnce(
      throwError(() => ({
        error: {
          code: 'validation_error',
          fields: { username: [{ code: 'username_taken', detail: 'taken' }] },
        },
      })),
    );
    access(component).form.patchValue({
      username: 'taken',
      password: 'StrongPass1!',
      password_confirm: 'StrongPass1!',
    });
    access(component).submit();
    expect(access(component).fieldErrors()).not.toBeNull();
    expect(access(component).fieldErrors()?.['username']).toBeDefined();
  });

  it('promotes invitation_expired returned at submit-time to a lookup error', () => {
    invitationsMock.invitationsLookupCreate.mockReturnValueOnce(
      throwError(() => ({ error: { code: 'invitation_expired' } })),
    );
    access(component).form.patchValue({
      username: 'newathlete',
      password: 'StrongPass1!',
      password_confirm: 'StrongPass1!',
    });
    access(component).submit();
    expect(access(component).lookupError()).toBe('expired');
  });
});
