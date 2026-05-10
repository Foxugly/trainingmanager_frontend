import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { getContributePageUiText } from './contribute-page.text';

@Component({
  selector: 'app-contribute-page',
  imports: [TranslocoPipe],
  templateUrl: './contribute-page.component.html',
  styleUrl: './contribute-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributePageComponent {
  private readonly languageService = inject(LanguageService);

  protected readonly sponsorsUrl = 'https://github.com/sponsors/Foxugly';
  protected readonly ui = computed(() => getContributePageUiText(this.languageService.activeLang()));
}
