import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageService } from '../../core/i18n/language.service';
import { ContributePageComponent } from './contribute-page.component';

describe('ContributePageComponent', () => {
  let fixture: ComponentFixture<ContributePageComponent>;
  let langSig: ReturnType<typeof signal<'fr' | 'en' | 'nl' | 'it' | 'es'>>;

  async function setup(initialLang: 'fr' | 'en' | 'nl' | 'it' | 'es' = 'fr') {
    TestBed.resetTestingModule();
    langSig = signal(initialLang);
    await TestBed.configureTestingModule({
      imports: [
        ContributePageComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: LanguageService, useValue: { activeLang: langSig.asReadonly() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ContributePageComponent);
    fixture.detectChanges();
  }

  it('renders 4 sections with their data-slug attributes (intro, reasons, donate, thanks)', async () => {
    await setup();
    const slugs = Array.from(fixture.nativeElement.querySelectorAll('section.contribute-section'))
      .map((s) => (s as HTMLElement).getAttribute('data-slug'));
    expect(slugs).toEqual(['intro', 'reasons', 'donate', 'thanks']);
  });

  it('renders 4 reason cards in REASON_DEFS order (oss, hosting, maintenance, features)', async () => {
    await setup();
    const cards = fixture.nativeElement.querySelectorAll('.contribute-card');
    expect(cards.length).toBe(4);
    const slugs = Array.from(cards).map((c) => (c as HTMLElement).getAttribute('data-slug'));
    expect(slugs).toEqual(['oss', 'hosting', 'maintenance', 'features']);
  });

  it('renders Sponsors CTA with target=_blank, rel=noopener noreferrer, correct href', async () => {
    await setup();
    const link = fixture.nativeElement.querySelector('a.donate-cta') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://github.com/sponsors/Foxugly');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders FR strings when activeLang is fr', async () => {
    await setup('fr');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Aidez Training Manager à grandir');
    expect(text).toContain('Faire un don');
  });

  it('switches to EN strings when activeLang flips', async () => {
    await setup('fr');
    langSig.set('en');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Help Training Manager grow');
    expect(text).toContain('Make a donation');
  });

  it('does not reference the legacy Transloco contribute_page.* keys', async () => {
    await setup();
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).not.toContain('contribute_page.title');
    expect(html).not.toContain('contribute_page.oss.title');
  });
});
