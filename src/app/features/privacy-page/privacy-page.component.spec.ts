import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageService } from '../../core/i18n/language.service';
import { PrivacyPageComponent } from './privacy-page.component';

describe('PrivacyPageComponent', () => {
  let fixture: ComponentFixture<PrivacyPageComponent>;
  let langSig: ReturnType<typeof signal<'fr' | 'en' | 'nl' | 'it' | 'es'>>;

  async function setup(initialLang: 'fr' | 'en' | 'nl' | 'it' | 'es' = 'fr') {
    TestBed.resetTestingModule();
    langSig = signal(initialLang);
    await TestBed.configureTestingModule({
      imports: [PrivacyPageComponent],
      providers: [{ provide: LanguageService, useValue: { activeLang: langSig.asReadonly() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(PrivacyPageComponent);
    fixture.detectChanges();
  }

  it('renders the five privacy blocks in order', async () => {
    await setup();
    const slugs = Array.from(fixture.nativeElement.querySelectorAll('.privacy-block'))
      .map((s) => (s as HTMLElement).getAttribute('data-slug'));
    expect(slugs).toEqual(['data', 'use', 'sharing', 'retention', 'rights', 'contact']);
  });

  it('renders the obfuscated contact email', async () => {
    await setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('info [at] foxugly [dot] com');
  });

  it('renders FR strings when activeLang is fr', async () => {
    await setup('fr');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Politique de confidentialité');
  });

  it('switches to EN strings when activeLang flips', async () => {
    await setup('fr');
    langSig.set('en');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Privacy Policy');
  });
});
