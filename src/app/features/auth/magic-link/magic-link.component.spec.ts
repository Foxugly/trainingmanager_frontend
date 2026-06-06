import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { MagicLinkComponent } from './magic-link.component';

@Component({ template: '' })
class StubComponent {}

interface ProtectedFields {
  state(): 'loading' | 'expired' | 'invalid';
}

describe('MagicLinkComponent', () => {
  let fixture: ComponentFixture<MagicLinkComponent>;
  let component: MagicLinkComponent;
  let authMock: { exchangeMagicLink: ReturnType<typeof vi.fn> };
  let router: Router;
  let params: Record<string, string>;
  let queryParams: Record<string, string>;

  const access = (c: MagicLinkComponent) => c as unknown as ProtectedFields;

  function setup(): void {
    TestBed.configureTestingModule({
      imports: [
        MagicLinkComponent,
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
              paramMap: { get: (k: string) => params[k] ?? null },
              queryParamMap: { get: (k: string) => queryParams[k] ?? null },
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(MagicLinkComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    authMock = { exchangeMagicLink: vi.fn() };
    params = { token: 'tok-123' };
    queryParams = {};
  });

  it('success: exchanges the token then navigates to /dashboard', () => {
    authMock.exchangeMagicLink.mockReturnValue(of({ id: 1 }));
    setup();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.detectChanges();

    expect(authMock.exchangeMagicLink).toHaveBeenCalledWith('tok-123');
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('success: honours a safe returnUrl query param', () => {
    authMock.exchangeMagicLink.mockReturnValue(of({ id: 1 }));
    queryParams['returnUrl'] = '/teams/7';
    setup();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/teams/7');
  });

  it('missing token: goes straight to the invalid state', () => {
    params = {};
    authMock.exchangeMagicLink.mockReturnValue(of({ id: 1 }));
    setup();

    fixture.detectChanges();

    expect(access(component).state()).toBe('invalid');
    expect(authMock.exchangeMagicLink).not.toHaveBeenCalled();
  });

  it('410: shows the expired state', () => {
    authMock.exchangeMagicLink.mockReturnValue(throwError(() => ({ status: 410 })));
    setup();

    fixture.detectChanges();

    expect(access(component).state()).toBe('expired');
  });

  it('400: shows the invalid state', () => {
    authMock.exchangeMagicLink.mockReturnValue(throwError(() => ({ status: 400 })));
    setup();

    fixture.detectChanges();

    expect(access(component).state()).toBe('invalid');
  });
});
