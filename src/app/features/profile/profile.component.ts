import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { Select } from 'primeng/select';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { AuthService as AuthApi } from '../../api/api/auth.service';
import { MeService } from '../../api/api/me.service';
import { NotificationsService } from '../../api/api/notifications.service';
import { NotificationPreference } from '../../api/model/notification-preference';
import { NotificationPreferenceRequest } from '../../api/model/notification-preference-request';
import { AccountDeleteRequest } from '../../api/model/account-delete-request';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { EmailChangeRequestRequest } from '../../api/model/email-change-request-request';
import { PasswordChangeRequest } from '../../api/model/password-change-request';
import { PatchedMeRequest } from '../../api/model/patched-me-request';
import { AuthService } from '../../core/auth/auth.service';
import { getRuntimeConfig } from '../../core/runtime-config';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../../core/i18n/available-languages';
import { LanguageService } from '../../core/i18n/language.service';
import { type FieldErrors, extractServerError } from '../../shared/forms/notify-error';
import { FormFooterComponent } from '../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { AriaDescribesDirective } from '../../shared/a11y/aria-describes.directive';

interface ProfileFormValue {
  first_name: string;
  last_name: string;
  language: LanguageCode;
  weekly_recap_opt_in: boolean;
}

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    InputText,
    Select,
    Button,
    Dialog,
    Password,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    ToggleSwitch,
    PageHeaderComponent,
    MetaFieldComponent,
    FormFooterComponent,
    AriaDescribesDirective,
    DatePipe,
    TranslocoPipe,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly authApi = inject(AuthApi);
  private readonly meService = inject(MeService);
  private readonly notificationsApi = inject(NotificationsService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly languages = AVAILABLE_LANGUAGES;

  protected readonly user = signal<Me | null>(null);
  protected readonly loading = signal(false);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  // --- Per-type notification channel matrix ---
  protected readonly prefs = signal<NotificationPreference[]>([]);
  protected readonly prefsLoading = signal(false);
  protected readonly prefsSaving = signal(false);

  // --- iCal calendar subscription ---
  // apiBase is precomputed here (never read from window in the template).
  private readonly apiBase = getRuntimeConfig().apiBaseUrl.replace(/\/+$/, '');
  protected readonly calendarToken = signal<string | null>(null);
  protected readonly calendarRotating = signal(false);

  /** Full https subscribe URL for the current token, or null when unavailable. */
  protected readonly calendarUrl = computed(() => {
    const token = this.calendarToken();
    return token ? `${this.apiBase}/api/v1/calendar/${token}.ics` : null;
  });

  /** webcal:// variant some calendar apps auto-handle (https → webcal). */
  protected readonly calendarWebcalUrl = computed(() => {
    const url = this.calendarUrl();
    return url ? url.replace(/^https?:\/\//, 'webcal://') : null;
  });

  protected readonly form = this.fb.nonNullable.group({
    first_name: ['', Validators.required],
    last_name: ['', Validators.required],
    language: ['fr' as LanguageCode, Validators.required],
    weekly_recap_opt_in: [true],
  });

  // --- Change-password dialog ---
  protected readonly changePwOpen = signal(false);
  protected readonly changePwLoading = signal(false);
  protected readonly changePwErrors = signal<FieldErrors | null>(null);
  protected readonly changePwForm = this.fb.nonNullable.group({
    current_password: ['', Validators.required],
    new_password: ['', Validators.required],
    new_password_confirm: ['', Validators.required],
  });

  // --- Change-email dialog (verified flow) ---
  protected readonly emailChangeOpen = signal(false);
  protected readonly emailChangeLoading = signal(false);
  protected readonly emailChangeErrors = signal<FieldErrors | null>(null);
  protected readonly emailChangeForm = this.fb.nonNullable.group({
    new_email: ['', [Validators.required, Validators.email]],
  });

  // --- Delete-account dialog ---
  protected readonly deleteOpen = signal(false);
  protected readonly deleteLoading = signal(false);
  protected readonly deleteErrors = signal<FieldErrors | null>(null);
  protected readonly deleteForm = this.fb.nonNullable.group({
    current_password: ['', Validators.required],
  });

  ngOnInit(): void {
    const current = this.authService.currentUser();
    if (current) {
      this.hydrate(current);
    } else {
      this.authService
        .fetchMe()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (me) => this.hydrate(me),
        });
    }
    this.loadPreferences();
  }

  private loadPreferences(): void {
    this.prefsLoading.set(true);
    this.notificationsApi
      .notificationsPreferencesRetrieve()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.prefs.set(rows);
          this.prefsLoading.set(false);
        },
        error: () => this.prefsLoading.set(false),
      });
  }

  protected toggleChannel(index: number, channel: 'in_app' | 'email', value: boolean): void {
    this.prefs.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [channel]: value } : row)),
    );
  }

  protected savePreferences(): void {
    this.prefsSaving.set(true);
    // `label` is server-derived (read-only) and excluded from the request type.
    const preferences: NotificationPreferenceRequest[] = this.prefs().map((p) => ({
      type: p.type,
      in_app: p.in_app,
      email: p.email,
    }));
    this.notificationsApi
      .notificationsPreferencesUpdate({ notificationPreferenceUpdateRequest: { preferences } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.prefs.set(rows);
          this.prefsSaving.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('notifications.prefs_saved'),
          });
        },
        error: () => {
          this.prefsSaving.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('profile.errors.unknown'),
          });
        },
      });
  }

  // --- RGPD data export ---
  protected readonly exporting = signal(false);

  protected downloadMyData(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.meService
      .meExportRetrieve()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (data) => {
        try {
          const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'trainingmanager-export.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('rgpd.export.toast'),
          });
        } finally {
          this.exporting.set(false);
        }
      },
      error: () => {
        this.exporting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('rgpd.export.error'),
        });
      },
    });
  }

  // --- iCal calendar subscription ---

  protected copyCalendarUrl(): void {
    const url = this.calendarUrl();
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => {
      this.messageService.add({
        severity: 'success',
        summary: this.transloco.translate('common.success'),
        detail: this.transloco.translate('profile.calendar_copied'),
      });
    });
  }

  protected regenerateCalendarUrl(): void {
    if (this.calendarRotating()) return;
    if (!window.confirm(this.transloco.translate('profile.calendar_regenerate_confirm'))) {
      return;
    }
    this.calendarRotating.set(true);
    this.meService
      .meCalendarTokenRotate()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (res) => {
        this.calendarToken.set(res.calendar_token);
        const current = this.user();
        if (current) {
          const updated: Me = { ...current, calendar_token: res.calendar_token };
          this.user.set(updated);
          this.authService.setCurrentUser(updated);
        }
        this.calendarRotating.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.transloco.translate('common.success'),
          detail: this.transloco.translate('profile.calendar_regenerated'),
        });
      },
      error: () => {
        this.calendarRotating.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('profile.errors.unknown'),
        });
      },
    });
  }

  private hydrate(me: Me): void {
    this.user.set(me);
    this.calendarToken.set(me.calendar_token);
    this.form.reset({
      first_name: me.first_name ?? '',
      last_name: me.last_name ?? '',
      language: (me.language ?? 'fr') as LanguageCode,
      weekly_recap_opt_in: me.weekly_recap_opt_in ?? true,
    });
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()?.[name]?.join(', ') ?? null;
  }

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    this.fieldErrors.set(null);

    const value = this.form.getRawValue() as ProfileFormValue;
    const payload: PatchedMeRequest = {
      first_name: value.first_name,
      last_name: value.last_name,
      language: value.language as LanguageEnum,
      weekly_recap_opt_in: value.weekly_recap_opt_in,
    };

    this.meService
      .mePartialUpdate({ patchedMeRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (updated) => {
        const previousLang = this.transloco.getActiveLang() as LanguageCode;
        if (value.language !== previousLang) {
          this.languageService.applyToTranslocoOnly(value.language);
        }
        this.authService.setCurrentUser(updated);
        this.user.set(updated);
        this.messageService.add({
          severity: 'success',
          summary: this.transloco.translate('common.success'),
          detail: this.transloco.translate('profile.saved'),
        });
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.applyServerError(err);
        this.loading.set(false);
      },
    });
  }

  private applyServerError(err: HttpErrorResponse): void {
    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: detail
          ? this.transloco.translate(detail)
          : this.transloco.translate('profile.errors.unknown'),
      });
    }
  }

  // --- Change-password ---

  protected changePwFieldError(name: string): string | null {
    return this.changePwErrors()?.[name]?.join(', ') ?? null;
  }

  protected openChangePassword(): void {
    this.changePwForm.reset({ current_password: '', new_password: '', new_password_confirm: '' });
    this.changePwErrors.set(null);
    this.changePwOpen.set(true);
  }

  protected cancelChangePassword(): void {
    if (this.changePwLoading()) return;
    this.changePwOpen.set(false);
  }

  protected onChangePwVisibleChange(value: boolean): void {
    if (!value && !this.changePwLoading()) {
      this.changePwOpen.set(false);
    }
  }

  protected submitChangePassword(): void {
    if (this.changePwForm.invalid || this.changePwLoading()) return;
    const value = this.changePwForm.getRawValue();
    if (value.new_password !== value.new_password_confirm) {
      this.changePwErrors.set({
        new_password_confirm: [this.transloco.translate('profile.password_mismatch')],
      });
      return;
    }
    this.changePwLoading.set(true);
    this.changePwErrors.set(null);

    const payload: PasswordChangeRequest = {
      current_password: value.current_password,
      new_password: value.new_password,
    };
    this.authApi
      .authPasswordChangeCreate({ passwordChangeRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: () => {
        this.changePwLoading.set(false);
        this.changePwOpen.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.transloco.translate('common.success'),
          detail: this.transloco.translate('profile.password_changed'),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.changePwLoading.set(false);
        this.applyChangePwError(err);
      },
    });
  }

  protected emailChangeFieldError(name: string): string | null {
    return this.emailChangeErrors()?.[name]?.join(', ') ?? null;
  }

  protected openEmailChange(): void {
    this.emailChangeForm.reset({ new_email: '' });
    this.emailChangeErrors.set(null);
    this.emailChangeOpen.set(true);
  }

  protected onEmailChangeVisible(value: boolean): void {
    if (!value && !this.emailChangeLoading()) this.emailChangeOpen.set(false);
  }

  protected submitEmailChange(): void {
    if (this.emailChangeForm.invalid || this.emailChangeLoading()) return;
    this.emailChangeLoading.set(true);
    this.emailChangeErrors.set(null);
    const payload: EmailChangeRequestRequest = {
      new_email: this.emailChangeForm.getRawValue().new_email,
    };
    this.meService
      .meEmailChangeCreate({ emailChangeRequestRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.emailChangeLoading.set(false);
          this.emailChangeOpen.set(false);
          this.messageService.add({
            severity: 'success',
            summary: this.transloco.translate('common.success'),
            detail: this.transloco.translate('profile.email_change.requested_toast'),
          });
        },
        error: (err: HttpErrorResponse) => {
          this.emailChangeLoading.set(false);
          const code = (err?.error as { code?: string } | null | undefined)?.code;
          if (code === 'email_unchanged' || code === 'email_taken') {
            this.emailChangeErrors.set({
              new_email: [this.transloco.translate(`profile.email_change.errors.${code}`)],
            });
            return;
          }
          const { fields } = extractServerError(err);
          if (fields) {
            this.emailChangeErrors.set(fields);
            return;
          }
          this.messageService.add({
            severity: 'error',
            summary: this.transloco.translate('common.error'),
            detail: this.transloco.translate('profile.email_change.errors.generic'),
          });
        },
      });
  }

  private applyChangePwError(err: HttpErrorResponse): void {
    const code = (err?.error as { code?: string } | null | undefined)?.code;
    if (code === 'current_password_invalid') {
      this.changePwErrors.set({
        current_password: [this.transloco.translate('profile.errors.current_password_invalid')],
      });
      return;
    }
    if (code === 'password_unchanged') {
      this.changePwErrors.set({
        new_password: [this.transloco.translate('profile.errors.password_unchanged')],
      });
      return;
    }
    const { fields, detail } = extractServerError(err);
    if (fields) {
      this.changePwErrors.set(fields);
      return;
    }
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: detail
        ? this.transloco.translate(detail)
        : this.transloco.translate('profile.errors.unknown'),
    });
  }

  // --- Delete account ---

  protected deleteFieldError(name: string): string | null {
    return this.deleteErrors()?.[name]?.join(', ') ?? null;
  }

  protected openDeleteDialog(): void {
    this.deleteForm.reset({ current_password: '' });
    this.deleteErrors.set(null);
    this.deleteOpen.set(true);
  }

  protected cancelDelete(): void {
    if (this.deleteLoading()) return;
    this.deleteOpen.set(false);
  }

  protected onDeleteVisibleChange(value: boolean): void {
    if (!value && !this.deleteLoading()) {
      this.deleteOpen.set(false);
    }
  }

  protected submitDelete(): void {
    if (this.deleteForm.invalid || this.deleteLoading()) return;
    this.deleteLoading.set(true);
    this.deleteErrors.set(null);

    const payload: AccountDeleteRequest = {
      current_password: this.deleteForm.getRawValue().current_password,
    };
    this.authApi
      .authAccountDeleteCreate({ accountDeleteRequest: payload })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: () => {
        this.deleteLoading.set(false);
        this.deleteOpen.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.transloco.translate('common.success'),
          detail: this.transloco.translate('profile.account_deleted'),
        });
        this.authService.logout();
      },
      error: (err: HttpErrorResponse) => {
        this.deleteLoading.set(false);
        this.applyDeleteError(err);
      },
    });
  }

  private applyDeleteError(err: HttpErrorResponse): void {
    const body = err?.error as { code?: string; detail?: string } | null | undefined;
    if (body?.code === 'current_password_invalid') {
      this.deleteErrors.set({
        current_password: [this.transloco.translate('profile.errors.current_password_invalid')],
      });
      return;
    }
    if (body?.code === 'owns_teams') {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: body.detail ?? this.transloco.translate('profile.errors.owns_teams'),
      });
      return;
    }
    const { fields, detail } = extractServerError(err);
    if (fields) {
      this.deleteErrors.set(fields);
      return;
    }
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate('common.error'),
      detail: detail
        ? this.transloco.translate(detail)
        : this.transloco.translate('profile.errors.unknown'),
    });
  }
}
