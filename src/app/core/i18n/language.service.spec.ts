import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { PrimeNG } from 'primeng/config';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeService } from '../../api/api/me.service';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { AuthService } from '../auth/auth.service';
import { LanguageService } from './language.service';
import { PRIMENG_TRANSLATIONS } from './primeng-translations';

const updatedMe: Me = {
  id: 1,
  email: 'alice@example.com',
  email_confirmed: true,
  first_name: 'Alice',
  last_name: 'Anderson',
  language: LanguageEnum.Nl,
  last_login: null,
  date_joined: '2026-01-01T00:00:00Z',
  is_staff: false,
  is_superuser: false,
  member_id: null,
  team_quota: { used: 0, max: 0, can_create: false },
  subscription_bypass: false,
  calendar_token: 'tok-test',
};

describe('LanguageService', () => {
  let service: LanguageService;
  let translocoMock: {
    getActiveLang: ReturnType<typeof vi.fn>;
    setActiveLang: ReturnType<typeof vi.fn>;
  };
  let meMock: { mePartialUpdate: ReturnType<typeof vi.fn> };
  let authMock: {
    currentUser: () => Me | null;
    setCurrentUser: ReturnType<typeof vi.fn>;
  };
  let primeNGMock: { setTranslation: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    translocoMock = {
      getActiveLang: vi.fn().mockReturnValue('fr'),
      setActiveLang: vi.fn(),
    };
    meMock = { mePartialUpdate: vi.fn() };
    const userSignal = signal<Me | null>(null);
    authMock = {
      currentUser: userSignal.asReadonly(),
      setCurrentUser: vi.fn(),
    };
    primeNGMock = { setTranslation: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslocoService, useValue: translocoMock },
        { provide: MeService, useValue: meMock },
        { provide: AuthService, useValue: authMock },
        { provide: PrimeNG, useValue: primeNGMock },
      ],
    });
    service = TestBed.inject(LanguageService);
  });

  it('initialises activeLang from the current Transloco lang', () => {
    expect(service.activeLang()).toBe('fr');
  });

  it('applies PrimeNG translation for the initial lang on construction', () => {
    expect(primeNGMock.setTranslation).toHaveBeenCalledWith(PRIMENG_TRANSLATIONS.fr);
  });

  it('applyToTranslocoOnly() applies the matching PrimeNG translation', () => {
    primeNGMock.setTranslation.mockClear();
    service.applyToTranslocoOnly('it');
    expect(primeNGMock.setTranslation).toHaveBeenCalledWith(PRIMENG_TRANSLATIONS.it);
  });

  it('switchLanguage() applies the PrimeNG translation alongside Transloco', async () => {
    primeNGMock.setTranslation.mockClear();
    meMock.mePartialUpdate.mockReturnValue(of(updatedMe));
    await new Promise<Me>((resolve) => service.switchLanguage('nl').subscribe(resolve));
    expect(primeNGMock.setTranslation).toHaveBeenCalledWith(PRIMENG_TRANSLATIONS.nl);
  });

  it('switchLanguage() applies Transloco immediately, then PATCHes /me/, then syncs the user', async () => {
    meMock.mePartialUpdate.mockReturnValue(of(updatedMe));

    const emitted = await new Promise<Me>((resolve) =>
      service.switchLanguage('nl').subscribe(resolve),
    );

    expect(translocoMock.setActiveLang).toHaveBeenCalledWith('nl');
    expect(service.activeLang()).toBe('nl');
    expect(meMock.mePartialUpdate).toHaveBeenCalledWith({ patchedMeRequest: { language: 'nl' } });
    expect(authMock.setCurrentUser).toHaveBeenCalledWith(updatedMe);
    expect(emitted).toEqual(updatedMe);
  });

  it('switchLanguage() rolls back Transloco when the PATCH fails', async () => {
    meMock.mePartialUpdate.mockReturnValue(throwError(() => ({ status: 500 })));

    await new Promise<void>((resolve, reject) => {
      service.switchLanguage('it').subscribe({
        next: () => reject(new Error('should not have succeeded')),
        error: () => resolve(),
      });
    });

    // setActiveLang called twice: once optimistic ('it'), once rollback ('fr')
    expect(translocoMock.setActiveLang).toHaveBeenNthCalledWith(1, 'it');
    expect(translocoMock.setActiveLang).toHaveBeenNthCalledWith(2, 'fr');
    expect(service.activeLang()).toBe('fr');
    expect(authMock.setCurrentUser).not.toHaveBeenCalled();
  });

  it('applyToTranslocoOnly() updates Transloco and the signal but does not hit the API', () => {
    service.applyToTranslocoOnly('it');
    expect(translocoMock.setActiveLang).toHaveBeenCalledWith('it');
    expect(service.activeLang()).toBe('it');
    expect(meMock.mePartialUpdate).not.toHaveBeenCalled();
  });
});
