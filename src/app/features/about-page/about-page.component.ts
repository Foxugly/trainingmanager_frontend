import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { LanguageService } from '../../core/i18n/language.service';
import {
  WEBSITE_URL,
  WEBSITE_DISPLAY,
  emailDisplay,
  phoneDisplay,
  openContactEmail,
} from '../../shared/contact';
import { AboutTab, getAboutPageUiText } from './about-page.text';

@Component({
  selector: 'app-about-page',
  imports: [Tabs, TabList, Tab, TabPanels, TabPanel],
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPageComponent {
  private readonly languageService = inject(LanguageService);

  protected readonly frontendRepoUrl = 'https://github.com/Foxugly/trainingmanager_frontend';
  protected readonly websiteUrl = WEBSITE_URL;
  protected readonly websiteDisplay = WEBSITE_DISPLAY;
  protected readonly emailDisplay = emailDisplay;
  protected readonly phoneDisplay = phoneDisplay;
  protected readonly activeTab = signal<AboutTab>('company');
  protected readonly ui = computed(() => getAboutPageUiText(this.languageService.activeLang()));

  protected onEmailClick(): void {
    openContactEmail('Training Manager');
  }
}
