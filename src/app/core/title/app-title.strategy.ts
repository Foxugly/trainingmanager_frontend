import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject, combineLatest, map, switchMap } from 'rxjs';

/** Clé i18n du nom de l'application, suffixe de chaque titre d'onglet. */
const APP_TITLE_KEY = 'app.title';
const SEPARATOR = ' — ';

/** Clé `data.titleKey` de la route la plus profonde qui en déclare une. */
export function titleKeyOf(snapshot: RouterStateSnapshot): string | null {
  let key: string | null = null;
  let route: ActivatedRouteSnapshot | null = snapshot.root;
  while (route) {
    const candidate = route.data?.['titleKey'];
    if (typeof candidate === 'string') key = candidate;
    route = route.firstChild;
  }
  return key;
}

/**
 * Titre d'onglet : « {titre traduit de la page} — {nom de l'application} », ou le
 * seul nom de l'application quand la route n'a pas de `data.titleKey`.
 * `selectTranslate` ré-émet à chaque changement de langue et dès que le catalogue
 * est chargé : le titre suit donc la langue sans autre branchement.
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private readonly titleKey$ = new BehaviorSubject<string | null>(null);

  constructor() {
    super();
    this.titleKey$
      .pipe(
        switchMap((key) => {
          const app$ = this.transloco.selectTranslate(APP_TITLE_KEY);
          if (!key) return app$;
          return combineLatest([this.transloco.selectTranslate(key), app$]).pipe(
            map(([page, app]) => `${page}${SEPARATOR}${app}`),
          );
        }),
      )
      .subscribe((value) => this.title.setTitle(value));
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.titleKey$.next(titleKeyOf(snapshot));
  }
}
