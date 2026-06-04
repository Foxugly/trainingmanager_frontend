import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { getRuntimeConfig } from '../runtime-config';
import { LanguageService } from './language.service';

export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(getRuntimeConfig().apiBaseUrl)) return next(req);

  const lang = inject(LanguageService).activeLang();
  return next(req.clone({ setHeaders: { 'Accept-Language': lang } }));
};
