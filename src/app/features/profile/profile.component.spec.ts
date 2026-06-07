import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService as AuthApi } from '../../api/api/auth.service';
import { MeService } from '../../api/api/me.service';
import { NotificationsService } from '../../api/api/notifications.service';
import { NotificationPreference } from '../../api/model/notification-preference';
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
  is_staff: false,
  member_id: null,
  weekly_recap_opt_in: true,
  team_quota: { used: 0, max: 0, can_create: false },
  calendar_token: 'tok-abc123',
};

interface ProtectedFields {
  form: {
    invalid: boolean;
    valid: boolean;
    value: {
      first_name: string;
      last_name: string;
      language: string;
      weekly_recap_opt_in: boolean;
    };
    patchValue: (
      v: Partial<{
        first_name: string;
        last_name: string;
        language: string;
        weekly_recap_opt_in: boolean;
      }>,
    ) => void;
  };
  loading(): boolean;
  fieldErrors(): { [k: string]: string[] } | null;
  fieldError(name: string): string | null;
  user(): Me | null;
  submit(): void;
  // change-password
  changePwOpen(): boolean;
  changePwForm: {
    patchValue: (v: Partial<{
      current_password: string;
      new_password: string;
      new_password_confirm: string;
    }>) => void;
  };
  changePwErrors(): { [k: string]: string[] } | null;
  changePwFieldError(name: string): string | null;
  openChangePassword(): void;
  submitChangePassword(): void;
  // delete-account
  deleteOpen(): boolean;
  deleteForm: { patchValue: (v: Partial<{ current_password: string }>) => void };
  deleteErrors(): { [k: string]: string[] } | null;
  deleteFieldError(name: string): string | null;
  openDeleteDialog(): void;
  submitDelete(): void;
  // notification preferences matrix
  prefs(): NotificationPreference[];
  prefsSaving(): boolean;
  toggleChannel(index: number, channel: 'in_app' | 'email', value: boolean): void;
  savePreferences(): void;
  // iCal calendar subscription
  calendarUrl(): string | null;
  calendarWebcalUrl(): string | null;
  calendarRotating(): boolean;
  copyCalendarUrl(): void;
  regenerateCalendarUrl(): void;
  // RGPD export
  exporting(): boolean;
  downloadMyData(): void;
}

const prefRows: NotificationPreference[] = [
  { type: 'note_for_coach', label: 'Note added', in_app: true, email: true } as NotificationPreference,
  { type: 'message_new_reply', label: 'New reply', in_app: true, email: false } as NotificationPreference,
];

describe('ProfileComponent', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let component: ProfileComponent;
  let meMock: {
    mePartialUpdate: ReturnType<typeof vi.fn>;
    meCalendarTokenRotate: ReturnType<typeof vi.fn>;
    meExportRetrieve: ReturnType<typeof vi.fn>;
  };
  let authMock: {
    currentUser: ReturnType<typeof vi.fn>;
    fetchMe: ReturnType<typeof vi.fn>;
    setCurrentUser: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let authApiMock: {
    authPasswordChangeCreate: ReturnType<typeof vi.fn>;
    authAccountDeleteCreate: ReturnType<typeof vi.fn>;
  };
  let langMock: { applyToTranslocoOnly: ReturnType<typeof vi.fn> };
  let notifMock: {
    notificationsPreferencesRetrieve: ReturnType<typeof vi.fn>;
    notificationsPreferencesUpdate: ReturnType<typeof vi.fn>;
  };
  let messageService: MessageService;

  const access = (c: ProfileComponent) => c as unknown as ProtectedFields;

  async function setup(initialUser: Me | null = baseUser) {
    TestBed.resetTestingModule();
    const userSignal = signal<Me | null>(initialUser);
    meMock = {
      mePartialUpdate: vi.fn(),
      meCalendarTokenRotate: vi.fn(),
      meExportRetrieve: vi.fn(),
    };
    authMock = {
      currentUser: userSignal.asReadonly() as unknown as ReturnType<typeof vi.fn>,
      fetchMe: vi.fn().mockReturnValue(of(baseUser)),
      setCurrentUser: vi.fn(),
      logout: vi.fn(),
    };
    authApiMock = {
      authPasswordChangeCreate: vi.fn(),
      authAccountDeleteCreate: vi.fn(),
    };
    langMock = { applyToTranslocoOnly: vi.fn() };
    notifMock = {
      notificationsPreferencesRetrieve: vi.fn().mockReturnValue(of(prefRows)),
      notificationsPreferencesUpdate: vi.fn().mockReturnValue(of(prefRows)),
    };

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
        MessageService,
        { provide: MeService, useValue: meMock },
        { provide: AuthService, useValue: authMock },
        { provide: AuthApi, useValue: authApiMock },
        { provide: LanguageService, useValue: langMock },
        { provide: NotificationsService, useValue: notifMock },
      ],
    })
      .overrideComponent(ProfileComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    messageService = TestBed.inject(MessageService);
    vi.spyOn(messageService, 'add');
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('hydrates the form with the current user values (email is read-only and not in the form)', () => {
    expect(access(component).form.value).toEqual({
      first_name: 'Alice',
      last_name: 'Anderson',
      language: 'fr',
      weekly_recap_opt_in: true,
    });
    expect(access(component).form.valid).toBe(true);
  });

  it('falls back to fetchMe() when no current user is set', async () => {
    await setup(null);
    expect(authMock.fetchMe).toHaveBeenCalled();
    expect(access(component).user()).toEqual(baseUser);
  });

  it('submit() calls mePartialUpdate with the form payload (no email field sent)', () => {
    meMock.mePartialUpdate.mockReturnValue(of({ ...baseUser, first_name: 'Alicia' }));
    access(component).form.patchValue({ first_name: 'Alicia' });

    access(component).submit();

    expect(meMock.mePartialUpdate).toHaveBeenCalledWith({
      first_name: 'Alicia',
      last_name: 'Anderson',
      language: 'fr',
      weekly_recap_opt_in: true,
    });
    expect(authMock.setCurrentUser).toHaveBeenCalled();
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
    expect(langMock.applyToTranslocoOnly).not.toHaveBeenCalled();
  });

  it('submit() applies the new language to Transloco when language changes', () => {
    meMock.mePartialUpdate.mockReturnValue(of({ ...baseUser, language: LanguageEnum.It }));
    access(component).form.patchValue({ language: 'it' });

    access(component).submit();

    expect(langMock.applyToTranslocoOnly).toHaveBeenCalledWith('it');
  });

  it('hydrates weekly_recap_opt_in from the user (opt-out model defaults to true)', () => {
    expect(access(component).form.value.weekly_recap_opt_in).toBe(true);
  });

  it('submit() persists the notifications toggle (weekly_recap_opt_in) via mePartialUpdate', () => {
    meMock.mePartialUpdate.mockReturnValue(of({ ...baseUser, weekly_recap_opt_in: false }));
    access(component).form.patchValue({ weekly_recap_opt_in: false });

    access(component).submit();

    expect(meMock.mePartialUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ weekly_recap_opt_in: false }),
    );
  });

  it('submit() maps field-level validation errors from DRF into fieldErrors', () => {
    meMock.mePartialUpdate.mockReturnValue(
      throwError(() => ({ status: 400, error: { first_name: ['This field is required.'] } })),
    );

    access(component).submit();

    expect(access(component).fieldErrors()?.['first_name']).toEqual(['This field is required.']);
    expect(access(component).fieldError('first_name')).toBe('This field is required.');
    expect(access(component).loading()).toBe(false);
  });

  it('submit() toasts the global detail when the server returns one (no field errors)', () => {
    meMock.mePartialUpdate.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Account locked' } })),
    );

    access(component).submit();

    expect(access(component).fieldErrors()).toBeNull();
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'Account locked' }),
    );
  });

  // --- Change-password flow ---

  it('submitChangePassword() blocks client-side when new != confirm', () => {
    access(component).openChangePassword();
    access(component).changePwForm.patchValue({
      current_password: 'old',
      new_password: 'newpass1',
      new_password_confirm: 'newpass2',
    });

    access(component).submitChangePassword();

    expect(authApiMock.authPasswordChangeCreate).not.toHaveBeenCalled();
    expect(access(component).changePwFieldError('new_password_confirm')).not.toBeNull();
  });

  it('submitChangePassword() calls the API and closes on success', () => {
    authApiMock.authPasswordChangeCreate.mockReturnValue(of({ detail: 'ok' }));
    access(component).openChangePassword();
    access(component).changePwForm.patchValue({
      current_password: 'old',
      new_password: 'newpass1',
      new_password_confirm: 'newpass1',
    });

    access(component).submitChangePassword();

    expect(authApiMock.authPasswordChangeCreate).toHaveBeenCalledWith({
      current_password: 'old',
      new_password: 'newpass1',
    });
    expect(access(component).changePwOpen()).toBe(false);
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
  });

  it('submitChangePassword() maps current_password_invalid to a field error', () => {
    authApiMock.authPasswordChangeCreate.mockReturnValue(
      throwError(() => ({ status: 400, error: { code: 'current_password_invalid' } })),
    );
    access(component).openChangePassword();
    access(component).changePwForm.patchValue({
      current_password: 'wrong',
      new_password: 'newpass1',
      new_password_confirm: 'newpass1',
    });

    access(component).submitChangePassword();

    expect(access(component).changePwFieldError('current_password')).not.toBeNull();
    expect(access(component).changePwOpen()).toBe(true);
  });

  it('submitChangePassword() maps password_unchanged to the new_password field', () => {
    authApiMock.authPasswordChangeCreate.mockReturnValue(
      throwError(() => ({ status: 400, error: { code: 'password_unchanged' } })),
    );
    access(component).openChangePassword();
    access(component).changePwForm.patchValue({
      current_password: 'old',
      new_password: 'old',
      new_password_confirm: 'old',
    });

    access(component).submitChangePassword();

    expect(access(component).changePwFieldError('new_password')).not.toBeNull();
  });

  it('submitChangePassword() maps fields.new_password inline', () => {
    authApiMock.authPasswordChangeCreate.mockReturnValue(
      throwError(() => ({ status: 400, error: { fields: { new_password: ['Too short.'] } } })),
    );
    access(component).openChangePassword();
    access(component).changePwForm.patchValue({
      current_password: 'old',
      new_password: 'x',
      new_password_confirm: 'x',
    });

    access(component).submitChangePassword();

    expect(access(component).changePwFieldError('new_password')).toBe('Too short.');
  });

  // --- Delete-account flow ---

  it('submitDelete() calls the API, logs out and toasts on 204', () => {
    authApiMock.authAccountDeleteCreate.mockReturnValue(of(null));
    access(component).openDeleteDialog();
    access(component).deleteForm.patchValue({ current_password: 'pw' });

    access(component).submitDelete();

    expect(authApiMock.authAccountDeleteCreate).toHaveBeenCalledWith({ current_password: 'pw' });
    expect(authMock.logout).toHaveBeenCalled();
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
  });

  it('submitDelete() toasts the server detail and keeps the dialog open on owns_teams (409)', () => {
    authApiMock.authAccountDeleteCreate.mockReturnValue(
      throwError(() => ({ status: 409, error: { code: 'owns_teams', detail: 'You own teams.' } })),
    );
    access(component).openDeleteDialog();
    access(component).deleteForm.patchValue({ current_password: 'pw' });

    access(component).submitDelete();

    expect(authMock.logout).not.toHaveBeenCalled();
    expect(access(component).deleteOpen()).toBe(true);
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'You own teams.' }),
    );
  });

  it('submitDelete() maps current_password_invalid inline on 400', () => {
    authApiMock.authAccountDeleteCreate.mockReturnValue(
      throwError(() => ({ status: 400, error: { code: 'current_password_invalid' } })),
    );
    access(component).openDeleteDialog();
    access(component).deleteForm.patchValue({ current_password: 'wrong' });

    access(component).submitDelete();

    expect(access(component).deleteFieldError('current_password')).not.toBeNull();
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  // --- Notification preferences matrix ---

  it('loads the preferences matrix on init', () => {
    expect(notifMock.notificationsPreferencesRetrieve).toHaveBeenCalled();
    expect(access(component).prefs().length).toBe(2);
  });

  it('toggleChannel mutates the local matrix row', () => {
    access(component).toggleChannel(1, 'email', true);
    expect(access(component).prefs()[1].email).toBe(true);
    expect(access(component).prefs()[0].email).toBe(true);
  });

  it('savePreferences PUTs the matrix and toasts on success', () => {
    access(component).toggleChannel(0, 'in_app', false);
    access(component).savePreferences();

    expect(notifMock.notificationsPreferencesUpdate).toHaveBeenCalledWith({
      preferences: [
        { type: 'note_for_coach', label: 'Note added', in_app: false, email: true },
        { type: 'message_new_reply', label: 'New reply', in_app: true, email: false },
      ],
    });
    expect(access(component).prefsSaving()).toBe(false);
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
  });

  it('savePreferences toasts an error on failure', () => {
    notifMock.notificationsPreferencesUpdate.mockReturnValue(
      throwError(() => ({ status: 500 })),
    );
    access(component).savePreferences();
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
    expect(access(component).prefsSaving()).toBe(false);
  });

  // --- iCal calendar subscription ---

  it('builds the calendar subscribe URL from apiBase + token', () => {
    // No runtime globals in jsdom → apiBase falls back to environment.apiBase
    // (http://localhost:8000). The .ics path uses the seeded calendar_token.
    expect(access(component).calendarUrl()).toBe(
      'http://localhost:8000/api/v1/calendar/tok-abc123.ics',
    );
  });

  it('derives the webcal:// variant from the https URL', () => {
    expect(access(component).calendarWebcalUrl()).toBe(
      'webcal://localhost:8000/api/v1/calendar/tok-abc123.ics',
    );
  });

  it('copyCalendarUrl writes the URL to the clipboard and toasts success', async () => {
    const writeText = vi.fn<(v: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    access(component).copyCalendarUrl();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('http://localhost:8000/api/v1/calendar/tok-abc123.ics');
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
  });

  it('regenerateCalendarUrl rotates and updates the URL on confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    meMock.meCalendarTokenRotate.mockReturnValue(of({ calendar_token: 'tok-new999' }));

    access(component).regenerateCalendarUrl();

    expect(meMock.meCalendarTokenRotate).toHaveBeenCalled();
    expect(access(component).calendarUrl()).toBe(
      'http://localhost:8000/api/v1/calendar/tok-new999.ics',
    );
    expect(authMock.setCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ calendar_token: 'tok-new999' }),
    );
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
    confirmSpy.mockRestore();
  });

  it('regenerateCalendarUrl is a no-op when the user cancels the confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    access(component).regenerateCalendarUrl();

    expect(meMock.meCalendarTokenRotate).not.toHaveBeenCalled();
    expect(access(component).calendarUrl()).toBe(
      'http://localhost:8000/api/v1/calendar/tok-abc123.ics',
    );
    confirmSpy.mockRestore();
  });

  it('regenerateCalendarUrl toasts an error on failure', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    meMock.meCalendarTokenRotate.mockReturnValue(throwError(() => ({ status: 500 })));

    access(component).regenerateCalendarUrl();

    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
    expect(access(component).calendarRotating()).toBe(false);
    confirmSpy.mockRestore();
  });

  // --- RGPD data export ---

  it('downloadMyData calls meExportRetrieve and toasts success', () => {
    meMock.meExportRetrieve.mockReturnValue(of({ profile: { username: 'alice' } }));
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:fake');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    // jsdom doesn't implement <a>.click navigation; stub it to a no-op.
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    access(component).downloadMyData();

    expect(meMock.meExportRetrieve).toHaveBeenCalled();
    expect(createUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:fake');
    expect(access(component).exporting()).toBe(false);
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );

    createUrl.mockRestore();
    revokeUrl.mockRestore();
    clickSpy.mockRestore();
  });

  it('downloadMyData toasts an error on failure', () => {
    meMock.meExportRetrieve.mockReturnValue(throwError(() => ({ status: 500 })));

    access(component).downloadMyData();

    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
    expect(access(component).exporting()).toBe(false);
  });
});
