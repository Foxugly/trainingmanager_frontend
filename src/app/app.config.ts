import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { firstValueFrom } from 'rxjs';

import { environment } from '../environments/environment';
import { provideApi } from './api/provide-api';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/auth/auth.interceptor';
import { LanguageService } from './core/i18n/language.service';
import { TranslocoHttpLoader } from './transloco-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: { preset: Aura, options: { darkModeSelector: '.dark-mode' } },
    }),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideApi(environment.apiBase),
    provideTransloco({
      config: {
        availableLangs: ['fr', 'nl', 'en', 'it', 'es'],
        defaultLang: 'fr',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      // Force LanguageService instantiation so its currentUser-watching effect is wired
      // before bootstrap() sets the user, ensuring Transloco picks up me.language at startup.
      inject(LanguageService);
      return firstValueFrom(authService.bootstrap()).catch(() => false);
    }),
    {
      // Resolves once at first injection — we rely on provideAppInitializer above
      // to have populated LanguageService.activeLang() (from me.language) before
      // the first DatePipe asks for LOCALE_ID. Mid-session swap won't repropagate
      // to existing pipe instances (Angular caches LOCALE_ID per injector).
      provide: LOCALE_ID,
      useFactory: () => inject(LanguageService).activeLang(),
    },
    MessageService,
  ],
};
