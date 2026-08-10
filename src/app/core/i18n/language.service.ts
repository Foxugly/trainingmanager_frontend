import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { PrimeNG } from 'primeng/config';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { LanguageEnum } from '../../api/model/language-enum';
import { Me } from '../../api/model/me';
import { PatchedMeRequest } from '../../api/model/patched-me-request';
import { MeService } from '../../api/api/me.service';
import { AuthService } from '../auth/auth.service';
import { LanguageCode } from './available-languages';
import { PRIMENG_TRANSLATIONS } from './primeng-translations';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly meService = inject(MeService);
  private readonly authService = inject(AuthService);
  private readonly primeNG = inject(PrimeNG);

  private readonly _activeLang = signal<LanguageCode>(
    this.transloco.getActiveLang() as LanguageCode,
  );
  readonly activeLang = this._activeLang.asReadonly();

  // Transloco charge ses catalogues apres le premier rendu. Le pipe | transloco
  // s'abonne a cette arrivee, translate() non : un computed qui l'appelle trop tot
  // rend la clef brute et la met en cache. Ce compteur lui donne la dependance
  // manquante.
  private readonly _loads = signal(0);

  /**
   * A lire dans tout computed qui appelle translate(). Change a la bascule de langue
   * *et* a chaque catalogue charge.
   *
   * Ne pas y substituer `transloco.getActiveLang()` : c'est un getter, pas un signal,
   * donc le lire dans un computed ne cree aucune dependance — le computed n'etait
   * alors jamais recalcule, pas meme au changement de langue.
   */
  readonly revision = computed(() => `${this._activeLang()}#${this._loads()}`);

  constructor() {
    this.transloco.events$
      .pipe(
        filter((e) => e.type === 'translationLoadSuccess'),
        takeUntilDestroyed(),
      )
      // queueMicrotask, pas un set direct : le catalogue est demande *pendant* le
      // rendu (par le pipe | transloco), et l'evenement revient donc souvent dans
      // ce meme rendu — ecrire un signal la leve NG0600. On repousse au tick
      // suivant, ou l'ecriture est legitime et provoque un nouveau rendu.
      .subscribe(() => queueMicrotask(() => this._loads.update((n) => n + 1)));

    // Initial sync: PrimeNG ships with English-only translations until we call
    // setTranslation. Apply the dictionary that matches Transloco's current lang.
    this.primeNG.setTranslation(PRIMENG_TRANSLATIONS[this._activeLang()]);

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

    const payload: PatchedMeRequest = { language: code as LanguageEnum };
    return this.meService.mePartialUpdate({ patchedMeRequest: payload }).pipe(
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
    this.primeNG.setTranslation(PRIMENG_TRANSLATIONS[code]);
  }
}
