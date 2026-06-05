import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { MeService } from '../../api/api/me.service';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
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
}

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    Select,
    Button,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
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
  private readonly meService = inject(MeService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly messageService = inject(MessageService);

  protected readonly languages = AVAILABLE_LANGUAGES;

  protected readonly user = signal<Me | null>(null);
  protected readonly loading = signal(false);
  protected readonly fieldErrors = signal<FieldErrors | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    first_name: ['', Validators.required],
    last_name: ['', Validators.required],
    language: ['fr' as LanguageCode, Validators.required],
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
  }

  private hydrate(me: Me): void {
    this.user.set(me);
    this.form.reset({
      first_name: me.first_name ?? '',
      last_name: me.last_name ?? '',
      language: (me.language ?? 'fr') as LanguageCode,
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

  protected cancel(): void {
    const me = this.user();
    if (me) {
      this.hydrate(me);
    }
    this.fieldErrors.set(null);
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
}
