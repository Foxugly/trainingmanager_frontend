import './sentry-init';

import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import localeNl from '@angular/common/locales/nl';
import localeEn from '@angular/common/locales/en';
import localeIt from '@angular/common/locales/it';
import localeEs from '@angular/common/locales/es';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

registerLocaleData(localeFr);
registerLocaleData(localeNl);
registerLocaleData(localeEn);
registerLocaleData(localeIt);
registerLocaleData(localeEs);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
