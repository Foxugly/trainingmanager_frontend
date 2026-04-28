import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Select } from 'primeng/select';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../available-languages';
import { LanguageService } from '../language.service';

@Component({
  selector: 'app-language-switcher',
  imports: [FormsModule, Select],
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitcherComponent {
  private readonly languageService = inject(LanguageService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly languages = AVAILABLE_LANGUAGES;
  protected readonly current = this.languageService.activeLang;

  protected onChange(code: LanguageCode): void {
    this.languageService.switchLanguage(code).subscribe({
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('profile.language_switch_failed'),
        });
      },
    });
  }
}
