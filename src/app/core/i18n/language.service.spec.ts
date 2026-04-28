import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeService } from '../../api/api/me.service';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { AuthService } from '../auth/auth.service';
import { LanguageService } from './language.service';

const updatedMe: Me = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Anderson',
  language: LanguageEnum.Nl,
  last_login: null,
  date_joined: '2026-01-01T00:00:00Z',
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

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslocoService, useValue: translocoMock },
        { provide: MeService, useValue: meMock },
        { provide: AuthService, useValue: authMock },
      ],
    });
    service = TestBed.inject(LanguageService);
  });

  it('initialises activeLang from the current Transloco lang', () => {
    expect(service.activeLang()).toBe('fr');
  });

  it('switchLanguage() applies Transloco immediately, then PATCHes /me/, then syncs the user', async () => {
    meMock.mePartialUpdate.mockReturnValue(of(updatedMe));

    const emitted = await new Promise<Me>((resolve) =>
      service.switchLanguage('nl').subscribe(resolve),
    );

    expect(translocoMock.setActiveLang).toHaveBeenCalledWith('nl');
    expect(service.activeLang()).toBe('nl');
    expect(meMock.mePartialUpdate).toHaveBeenCalledWith({ language: 'nl' });
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
