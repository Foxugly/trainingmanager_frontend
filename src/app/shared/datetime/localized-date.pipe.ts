import { formatDate, registerLocaleData } from '@angular/common';
import localeEn from '@angular/common/locales/en';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';
import localeIt from '@angular/common/locales/it';
import localeNl from '@angular/common/locales/nl';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';

// formatDate() needs the locale data registered (registerLocaleData). main.ts
// does this for the runtime, but unit tests don't load main.ts — and this pipe
// forces the ACTIVE locale (not the bootstrap LOCALE_ID), so it must guarantee
// the data is present wherever it's used. registerLocaleData is idempotent, so
// registering here (module import side effect) is safe alongside main.ts.
registerLocaleData(localeFr);
registerLocaleData(localeNl);
registerLocaleData(localeEn);
registerLocaleData(localeIt);
registerLocaleData(localeEs);

/**
 * Drop-in replacement for the `date` pipe that formats with the CURRENT app
 * language (LanguageService.activeLang()) instead of the bootstrap-frozen
 * LOCALE_ID, so dates reformat when the user switches language mid-session.
 * Impure so it re-runs on the language change; delegates to Angular's
 * formatDate so the output is identical to `| date`.
 */
@Pipe({ name: 'localizedDate', pure: false })
export class LocalizedDatePipe implements PipeTransform {
  private readonly lang = inject(LanguageService);

  transform(
    value: Date | string | number | null | undefined,
    format = 'mediumDate',
    timezone?: string,
  ): string {
    if (value == null || value === '') return '';
    return formatDate(value, format, this.lang.activeLang(), timezone);
  }
}
