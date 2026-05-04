import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Me } from '../../../api/model/me';
import { AuthService } from '../../../core/auth/auth.service';
import { EmailConfirmComponent } from './email-confirm.component';

interface ProtectedFields {
  phase(): 'loading' | 'success' | 'invalid_token' | 'unknown_error';
}

describe('EmailConfirmComponent', () => {
  let fixture: ComponentFixture<EmailConfirmComponent>;
  let component: EmailConfirmComponent;
  let authMock: { confirmEmail: ReturnType<typeof vi.fn> };
  let router: Router;

  const access = (c: EmailConfirmComponent) => c as unknown as ProtectedFields;

  /**
   * Build the test bed with a pre-configured confirmEmail return value.
   * ngOnInit fires immediately on detectChanges(), so the mock must already
   * answer before the component is instantiated — otherwise we hit
   * `undefined.pipe(...)` synchronously.
   */
  async function setup(opts: {
    key: string | null;
    confirmReturns?: Observable<Me> | (() => Observable<Me>);
  }) {
    TestBed.resetTestingModule();
    authMock = {
      confirmEmail: vi.fn().mockImplementation(() => {
        if (typeof opts.confirmReturns === 'function') return opts.confirmReturns();
        return opts.confirmReturns ?? of({} as Me);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [
        EmailConfirmComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => opts.key } } },
        },
      ],
    })
      .overrideComponent(EmailConfirmComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(EmailConfirmComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
  }

  it('on 200 success → confirmEmail called and navigate /dashboard', async () => {
    await setup({ key: 'TOKEN', confirmReturns: of({ id: 1 } as Me) });
    expect(authMock.confirmEmail).toHaveBeenCalledWith('TOKEN');
    expect(access(component).phase()).toBe('success');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('on 400 code=invalid_or_expired_token → phase=invalid_token, no redirect', async () => {
    await setup({
      key: 'BADTOKEN',
      confirmReturns: () =>
        throwError(() => ({ status: 400, error: { code: 'invalid_or_expired_token' } })) as unknown as Observable<Me>,
    });
    expect(access(component).phase()).toBe('invalid_token');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('without :key param → phase=invalid_token immediately, no API call', async () => {
    await setup({ key: null });
    expect(access(component).phase()).toBe('invalid_token');
    expect(authMock.confirmEmail).not.toHaveBeenCalled();
  });

  it('on unknown error (status 500) → phase=unknown_error', async () => {
    await setup({
      key: 'TOKEN',
      confirmReturns: () =>
        throwError(() => ({ status: 500 })) as unknown as Observable<Me>,
    });
    expect(access(component).phase()).toBe('unknown_error');
  });
});
