import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { CheckYourEmailComponent } from './check-your-email.component';

interface ProtectedFields {
  email(): string | null;
  resending(): boolean;
  cooldownSeconds(): number | null;
  cooldownActive(): boolean;
  errorMessage(): string | null;
  emailForm: {
    invalid: boolean;
    patchValue: (v: { email?: string }) => void;
  };
  resend(): void;
  submitEmailForm(): void;
}

describe('CheckYourEmailComponent', () => {
  let fixture: ComponentFixture<CheckYourEmailComponent>;
  let component: CheckYourEmailComponent;
  let authMock: { resendEmail: ReturnType<typeof vi.fn> };
  let queryParams: Record<string, string>;
  let messageAddSpy: ReturnType<typeof vi.fn>;

  const access = (c: CheckYourEmailComponent) => c as unknown as ProtectedFields;

  async function setup(initialEmail: string | null = null) {
    TestBed.resetTestingModule();
    authMock = { resendEmail: vi.fn() };
    queryParams = initialEmail ? { email: initialEmail } : {};
    messageAddSpy = vi.fn();

    history.replaceState({}, '');

    await TestBed.configureTestingModule({
      imports: [
        CheckYourEmailComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: MessageService, useValue: { add: messageAddSpy } },
        { provide: AuthService, useValue: authMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (k: string) => queryParams[k] ?? null } } },
        },
      ],
    })
      .overrideComponent(CheckYourEmailComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(CheckYourEmailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('reads email from query param fallback', async () => {
    await setup('a@b.c');
    expect(access(component).email()).toBe('a@b.c');
  });

  it('resend(): success → message added + cooldown started', async () => {
    await setup('a@b.c');
    authMock.resendEmail.mockReturnValue(of({ detail: 'ok' }));
    access(component).resend();
    expect(authMock.resendEmail).toHaveBeenCalledWith('a@b.c');
    expect(messageAddSpy).toHaveBeenCalled();
    expect(access(component).cooldownActive()).toBe(true);
  });

  it('resend(): 429 → cooldown started from Retry-After + error set', async () => {
    await setup('a@b.c');
    const mockHeaders = { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '600' : null) };
    authMock.resendEmail.mockReturnValue(throwError(() => ({ status: 429, headers: mockHeaders })));
    access(component).resend();
    expect(access(component).cooldownSeconds()).toBe(600);
    expect(access(component).errorMessage()).toBe('auth.check_email.resend_rate_limited');
  });

  it('without email, the email-input form is shown and submitting it triggers resend', () => {
    expect(access(component).email()).toBeNull();
    expect(access(component).emailForm.invalid).toBe(true);
    authMock.resendEmail.mockReturnValue(of({ detail: 'ok' }));
    access(component).emailForm.patchValue({ email: 'late@example.com' });
    access(component).submitEmailForm();
    expect(authMock.resendEmail).toHaveBeenCalledWith('late@example.com');
    expect(access(component).email()).toBe('late@example.com');
  });
});
