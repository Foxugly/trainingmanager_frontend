import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeService } from '../../api/api/me.service';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ProfileComponent } from './profile.component';

const baseUser: Me = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Anderson',
  language: LanguageEnum.Fr,
  last_login: null,
  date_joined: '2026-01-01T00:00:00Z',
};

interface ProtectedFields {
  form: {
    invalid: boolean;
    valid: boolean;
    value: { email: string; first_name: string; last_name: string; language: string };
    patchValue: (v: Partial<{ email: string; first_name: string; last_name: string; language: string }>) => void;
  };
  loading(): boolean;
  successMessage(): string | null;
  errorMessage(): string | null;
  user(): Me | null;
  submit(): void;
  cancel(): void;
}

describe('ProfileComponent', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let component: ProfileComponent;
  let meMock: { mePartialUpdate: ReturnType<typeof vi.fn> };
  let authMock: {
    currentUser: ReturnType<typeof vi.fn>;
    fetchMe: ReturnType<typeof vi.fn>;
    setCurrentUser: ReturnType<typeof vi.fn>;
  };
  let langMock: { applyToTranslocoOnly: ReturnType<typeof vi.fn> };

  const access = (c: ProfileComponent) => c as unknown as ProtectedFields;

  async function setup(initialUser: Me | null = baseUser) {
    TestBed.resetTestingModule();
    const userSignal = signal<Me | null>(initialUser);
    meMock = { mePartialUpdate: vi.fn() };
    authMock = {
      currentUser: userSignal.asReadonly() as unknown as ReturnType<typeof vi.fn>,
      fetchMe: vi.fn().mockReturnValue(of(baseUser)),
      setCurrentUser: vi.fn(),
    };
    langMock = { applyToTranslocoOnly: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        ProfileComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        { provide: MeService, useValue: meMock },
        { provide: AuthService, useValue: authMock },
        { provide: LanguageService, useValue: langMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('hydrates the form with the current user values', () => {
    expect(access(component).form.value).toEqual({
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Anderson',
      language: 'fr',
    });
    expect(access(component).form.valid).toBe(true);
  });

  it('falls back to fetchMe() when no current user is set', async () => {
    await setup(null);
    expect(authMock.fetchMe).toHaveBeenCalled();
    expect(access(component).user()).toEqual(baseUser);
  });

  it('submit() calls mePartialUpdate with the form payload', () => {
    meMock.mePartialUpdate.mockReturnValue(of({ ...baseUser, first_name: 'Alicia' }));
    access(component).form.patchValue({ first_name: 'Alicia' });

    access(component).submit();

    expect(meMock.mePartialUpdate).toHaveBeenCalledWith({
      email: 'alice@example.com',
      first_name: 'Alicia',
      last_name: 'Anderson',
      language: 'fr',
    });
    expect(authMock.setCurrentUser).toHaveBeenCalled();
    expect(access(component).successMessage()).toBe('profile.saved');
    expect(langMock.applyToTranslocoOnly).not.toHaveBeenCalled();
  });

  it('submit() applies the new language to Transloco when language changes', () => {
    meMock.mePartialUpdate.mockReturnValue(of({ ...baseUser, language: LanguageEnum.It }));
    access(component).form.patchValue({ language: 'it' });

    access(component).submit();

    expect(langMock.applyToTranslocoOnly).toHaveBeenCalledWith('it');
  });

  it('submit() surfaces field-level validation errors from DRF', () => {
    meMock.mePartialUpdate.mockReturnValue(
      throwError(() => ({ status: 400, error: { email: ['Enter a valid email address.'] } })),
    );

    access(component).form.patchValue({ email: 'not-an-email' });
    // form is now invalid due to Validators.email; force valid by patching back
    access(component).form.patchValue({ email: 'still@bad.invalid' });
    // ↑ keeps form valid client-side, server replies with 400
    access(component).submit();

    expect(access(component).errorMessage()).toContain('email');
    expect(access(component).errorMessage()).toContain('Enter a valid email address.');
    expect(access(component).loading()).toBe(false);
  });

  it('submit() falls back to detail when server returns one', () => {
    meMock.mePartialUpdate.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Account locked' } })),
    );

    access(component).submit();

    expect(access(component).errorMessage()).toBe('Account locked');
  });

  it('cancel() resets the form to the user values', () => {
    access(component).form.patchValue({ first_name: 'Changed' });
    access(component).cancel();
    expect(access(component).form.value.first_name).toBe('Alice');
  });
});
