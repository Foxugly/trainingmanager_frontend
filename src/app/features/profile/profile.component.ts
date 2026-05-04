import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { MeService } from '../../api/api/me.service';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { PatchedMe } from '../../api/model/patched-me';
import { AuthService } from '../../core/auth/auth.service';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../../core/i18n/available-languages';
import { LanguageService } from '../../core/i18n/language.service';

interface ProfileFormValue {
  first_name: string;
  last_name: string;
  language: LanguageCode;
}

@Component({
  selector: 'app-profile',
  imports: [CommonModule, ReactiveFormsModule, InputText, Select, Button, Message, TranslocoPipe],
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

  protected readonly languages = AVAILABLE_LANGUAGES;

  protected readonly user = signal<Me | null>(null);
  protected readonly loading = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

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

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

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
        this.successMessage.set('profile.saved');
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.errorMessage.set(this.formatError(err));
        this.loading.set(false);
      },
    });
  }

  protected cancel(): void {
    const me = this.user();
    if (me) {
      this.hydrate(me);
    }
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }

  private formatError(err: HttpErrorResponse): string {
    const body = err?.error as Record<string, unknown> | string | null | undefined;

    if (body && typeof body === 'object') {
      const detail = (body as { detail?: string }).detail;
      if (typeof detail === 'string' && detail.length > 0) {
        return detail;
      }

      const fieldMessages: string[] = [];
      for (const [field, value] of Object.entries(body)) {
        if (field === 'code' || field === 'detail') continue;
        if (Array.isArray(value)) {
          for (const m of value) {
            if (typeof m === 'string') fieldMessages.push(`${field}: ${m}`);
          }
        } else if (typeof value === 'string') {
          fieldMessages.push(`${field}: ${value}`);
        }
      }
      if (fieldMessages.length > 0) {
        return fieldMessages.join(' • ');
      }
    }

    return 'profile.errors.unknown';
  }
}
