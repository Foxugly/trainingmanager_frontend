import { Injectable, effect, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { PatchedMe } from '../../api/model/patched-me';
import { MeService } from '../../api/api/me.service';
import { AuthService } from '../auth/auth.service';
import { LanguageCode } from './available-languages';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly meService = inject(MeService);
  private readonly authService = inject(AuthService);

  private readonly _activeLang = signal<LanguageCode>(
    this.transloco.getActiveLang() as LanguageCode,
  );
  readonly activeLang = this._activeLang.asReadonly();

  constructor() {
    // Keep Transloco in sync with the authenticated user's language preference.
    // Fires on bootstrap (after fetchMe), on login (after fetchMe), and after profile save.
    // The `code !== this._activeLang()` guard prevents reapplying when we just set it ourselves.
    effect(() => {
      const user = this.authService.currentUser();
      const userLang = user?.language as LanguageCode | undefined;
      if (userLang && userLang !== this._activeLang()) {
        this.applyToTranslocoOnly(userLang);
      }
    });
  }

  /**
   * Switch instantané : applique Transloco immédiatement, puis persiste via PATCH /me/.
   * Si le PATCH échoue, rollback Transloco à la langue précédente et propage l'erreur.
   */
  switchLanguage(code: LanguageCode): Observable<Me> {
    const previous = this._activeLang();
    this.applyToTranslocoOnly(code);

    const payload: PatchedMe = { language: code as LanguageEnum };
    return this.meService.mePartialUpdate(payload).pipe(
      tap((updated) => this.authService.setCurrentUser(updated)),
      catchError((err) => {
        this.applyToTranslocoOnly(previous);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Applique uniquement à Transloco, sans appel API.
   * Utilisé après un PATCH /me/ initié ailleurs (ex. profile form).
   */
  applyToTranslocoOnly(code: LanguageCode): void {
    this.transloco.setActiveLang(code);
    this._activeLang.set(code);
  }
}
