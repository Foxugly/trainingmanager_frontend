import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { isApiUrl } from '../http/api-url';
import { LanguageService } from './language.service';

export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url)) return next(req);

  const lang = inject(LanguageService).activeLang();
  return next(req.clone({ setHeaders: { 'Accept-Language': lang } }));
};
