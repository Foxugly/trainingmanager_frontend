import { UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../available-languages';
import { LanguageService } from '../language.service';

@Component({
  selector: 'app-language-switcher',
  imports: [TranslocoPipe, UpperCasePipe],
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class LanguageSwitcherComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly languageService = inject(LanguageService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly languages = AVAILABLE_LANGUAGES;
  protected readonly current = this.languageService.activeLang;
  protected readonly open = signal(false);

  protected toggle(): void { this.open.update((v) => !v); }
  protected close(): void { this.open.set(false); }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const root = this.elementRef.nativeElement;
    if (!root.contains(event.target as Node)) {
      this.close();
    }
  }

  protected select(code: LanguageCode): void {
    this.close();
    if (code === this.current()) return;
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
