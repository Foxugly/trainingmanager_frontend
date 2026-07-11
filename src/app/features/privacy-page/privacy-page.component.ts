import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { emailDisplay, openContactEmail } from '../../shared/contact';
import { getPrivacyPageUiText } from './privacy-page.text';

@Component({
  selector: 'app-privacy-page',
  imports: [],
  templateUrl: './privacy-page.component.html',
  styleUrl: './privacy-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPageComponent {
  private readonly languageService = inject(LanguageService);

  protected readonly emailDisplay = emailDisplay;
  protected readonly ui = computed(() => getPrivacyPageUiText(this.languageService.activeLang()));

  protected onEmailClick(): void {
    openContactEmail('Training Manager — Privacy');
  }
}
