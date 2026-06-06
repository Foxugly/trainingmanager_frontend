import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
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
import { AccountDelete } from '../../api/model/account-delete';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { PasswordChange } from '../../api/model/password-change';
import { PatchedMe } from '../../api/model/patched-me';
import { AuthService } from '../../core/auth/auth.service';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../../core/i18n/available-languages';
import { LanguageService } from '../../core/i18n/language.service';
import { type FieldErrors, extractServerError } from '../../shared/forms/notify-error';
import { FormFooterComponent } from '../../shared/ui/form-footer/form-footer.component';
import { MetaFieldComponent } from '../../shared/ui/meta-field/meta-field.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

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

  protected readonly languages = AVAILABLE_LANGUAGES;

  protected readonly user = signal<Me | null>(null);
  protected readonly loading = signal(false);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  // --- Per-type notification channel matrix ---
  protected readonly prefs = signal<NotificationPreference[]>([]);
  protected readonly prefsLoading = signal(false);
  protected readonly prefsSaving = signal(false);

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
      this.authService.fetchMe().subscribe({
        next: (me) => this.hydrate(me),
      });
    }
    this.loadPreferences();
  }

  private loadPreferences(): void {
    this.prefsLoading.set(true);
    this.notificationsApi.notificationsPreferencesRetrieve().subscribe({
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
    const preferences: NotificationPreference[] = this.prefs().map((p) => ({
      type: p.type,
      label: p.label,
      in_app: p.in_app,
      email: p.email,
    }));
    this.notificationsApi.notificationsPreferencesUpdate({ preferences }).subscribe({
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

  private hydrate(me: Me): void {
    this.user.set(me);
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
    const payload: PatchedMe = {
      first_name: value.first_name,
      last_name: value.last_name,
      language: value.language as LanguageEnum,
      weekly_recap_opt_in: value.weekly_recap_opt_in,
    };

    this.meService.mePartialUpdate(payload).subscribe({
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

    const payload: PasswordChange = {
      current_password: value.current_password,
      new_password: value.new_password,
    };
    this.authApi.authPasswordChangeCreate(payload).subscribe({
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

    const payload: AccountDelete = {
      current_password: this.deleteForm.getRawValue().current_password,
    };
    this.authApi.authAccountDeleteCreate(payload).subscribe({
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
