import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { TranslocoService, provideTransloco } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { AppTitleStrategy } from './app-title.strategy';

@Component({ template: '' })
class DummyComponent {}

const CATALOGS: Record<string, Record<string, string>> = {
  fr: { 'app.title': 'Training Manager', 'nav.teams': 'Équipes' },
  en: { 'app.title': 'Training Manager', 'nav.teams': 'Teams' },
};

class FakeLoader {
  getTranslation(lang: string): Observable<Record<string, string>> {
    return of(CATALOGS[lang] ?? {});
  }
}

describe('AppTitleStrategy', () => {
  let router: Router;
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'teams', component: DummyComponent, data: { titleKey: 'nav.teams' } },
          { path: 'plain', component: DummyComponent },
        ]),
        provideTransloco({
          config: { availableLangs: ['fr', 'en'], defaultLang: 'fr', reRenderOnLangChange: true },
          loader: FakeLoader,
        }),
        { provide: TitleStrategy, useExisting: AppTitleStrategy },
      ],
    });
    router = TestBed.inject(Router);
    transloco = TestBed.inject(TranslocoService);
    TestBed.inject(TitleStrategy);
  });

  it('compose « page — app » à partir de data.titleKey', async () => {
    await router.navigateByUrl('/teams');
    expect(TestBed.inject(Title).getTitle()).toBe('Équipes — Training Manager');
  });

  it('se met à jour au changement de langue', async () => {
    await router.navigateByUrl('/teams');
    transloco.setActiveLang('en');
    await new Promise((resolve) => setTimeout(resolve));
    expect(TestBed.inject(Title).getTitle()).toBe('Teams — Training Manager');
  });

  it("n'affiche que le nom de l'app sans titleKey", async () => {
    await router.navigateByUrl('/plain');
    expect(TestBed.inject(Title).getTitle()).toBe('Training Manager');
  });
});
