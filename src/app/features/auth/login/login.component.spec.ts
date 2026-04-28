import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class StubComponent {}

interface ProtectedFields {
  form: {
    invalid: boolean;
    valid: boolean;
    patchValue: (v: { username?: string; password?: string }) => void;
  };
  loading(): boolean;
  errorMessage(): string | null;
  submit(): void;
}

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let authMock: { login: ReturnType<typeof vi.fn> };
  let router: Router;
  let queryParams: Record<string, string>;

  const access = (c: LoginComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    authMock = { login: vi.fn() };
    queryParams = {};

    await TestBed.configureTestingModule({
      imports: [
        LoginComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        provideRouter([{ path: '**', component: StubComponent }]),
        { provide: AuthService, useValue: authMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: (k: string) => queryParams[k] ?? null },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('starts with an invalid form', () => {
    expect(access(component).form.invalid).toBe(true);
  });

  it('becomes valid when both fields are filled', () => {
    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    expect(access(component).form.valid).toBe(true);
  });

  it('navigates to / on successful login when no returnUrl is set', () => {
    authMock.login.mockReturnValue(of({ id: 1 }));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(authMock.login).toHaveBeenCalledWith('alice', 'pw');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('navigates to returnUrl when present in query params', () => {
    queryParams['returnUrl'] = '/teams/42';
    authMock.login.mockReturnValue(of({ id: 1 }));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(navigate).toHaveBeenCalledWith('/teams/42');
  });

  it('sets invalid_credentials when the backend returns 401 + code=authentication_failed', () => {
    authMock.login.mockReturnValue(
      throwError(() => ({ status: 401, error: { code: 'authentication_failed' } })),
    );

    access(component).form.patchValue({ username: 'alice', password: 'wrong' });
    access(component).submit();

    expect(access(component).errorMessage()).toBe('auth.errors.invalid_credentials');
    expect(access(component).loading()).toBe(false);
  });

  it('falls back to error.detail when the backend returns one', () => {
    authMock.login.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Account locked' } })),
    );

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(access(component).errorMessage()).toBe('Account locked');
  });

  it('falls back to the unknown i18n key when no detail and no recognised code', () => {
    authMock.login.mockReturnValue(throwError(() => ({ status: 500 })));

    access(component).form.patchValue({ username: 'alice', password: 'pw' });
    access(component).submit();

    expect(access(component).errorMessage()).toBe('auth.errors.unknown');
  });
});
