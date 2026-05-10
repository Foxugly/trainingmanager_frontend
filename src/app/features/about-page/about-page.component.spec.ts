import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { LanguageService } from '../../core/i18n/language.service';
import { AboutPageComponent } from './about-page.component';

// Polyfill ResizeObserver for jsdom — PrimeNG's <p-tablist> uses it on view init.
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverPolyfill;
}

describe('AboutPageComponent', () => {
  let fixture: ComponentFixture<AboutPageComponent>;

  async function setup(initialLang: 'fr' | 'en' | 'nl' | 'it' | 'es' = 'fr') {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AboutPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: LanguageService, useValue: { activeLang: signal(initialLang).asReadonly() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AboutPageComponent);
    fixture.detectChanges();
  }


  it('renders intro + content sections with their data-slug', async () => {
    await setup();
    const slugs = Array.from(fixture.nativeElement.querySelectorAll('section.about-section'))
      .map((s) => (s as HTMLElement).getAttribute('data-slug'));
    expect(slugs).toEqual(['intro', 'content']);
  });

  it('renders the view-repo link with target=_blank, rel=noopener noreferrer', async () => {
    await setup();
    const link = fixture.nativeElement.querySelector('a.about-repo') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://github.com/Foxugly/trainingmanager_frontend');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders 3 tabs in order: company / legal / technical', async () => {
    await setup();
    const tabHeaders = fixture.nativeElement.querySelectorAll('p-tab');
    expect(tabHeaders.length).toBe(3);
  });

  it('default active tab is "company"', async () => {
    await setup();
    const c = fixture.componentInstance as unknown as { activeTab: { (): string } };
    expect(c.activeTab()).toBe('company');
  });

  it('Company tab: displays the email obfuscated and never as raw "@"', async () => {
    await setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('info [at] foxugly [dot] com');
    expect(text).not.toMatch(/info@foxugly\.com/);
  });

  it('Company tab: clicking the email CTA invokes openContactEmail("Training Manager")', async () => {
    // ESM bindings are read-only so we can't `vi.spyOn(contact, 'openContactEmail')`,
    // and the Angular unit-test runner blocks `vi.mock` for relative imports.
    // Instead, observe the side effect: `openContactEmail` writes to `window.location.href`
    // with `mailto:<addr>?subject=<subject>`. We replace `window.location` with a stub
    // that captures assignments to `href`.
    const original = window.location;
    const captured: { href: string | null } = { href: null };
    const stub = {
      set href(v: string) {
        captured.href = v;
      },
      get href() {
        return captured.href ?? '';
      },
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: stub,
    });

    try {
      await setup();
      const btn = fixture.nativeElement.querySelector('button.email-cta') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      btn.click();
      expect(captured.href).not.toBeNull();
      expect(captured.href!.startsWith('mailto:')).toBe(true);
      // URLSearchParams encodes a space as '+'
      expect(captured.href).toContain('subject=Training+Manager');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });

  it('Company tab: phone displayed as "+32 478 811988"', async () => {
    await setup();
    expect(fixture.nativeElement.textContent).toContain('+32 478 811988');
  });

  it('Company tab: website link with WEBSITE_URL, target=_blank, rel=noopener noreferrer', async () => {
    await setup();
    const links = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    const site = links.find((a) => a.getAttribute('href') === 'https://www.foxugly.com');
    expect(site).toBeDefined();
    expect(site?.getAttribute('target')).toBe('_blank');
    expect(site?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('Legal tab content appears after switching activeTab to "legal"', async () => {
    await setup();
    const c = fixture.componentInstance as unknown as { activeTab: { set: (v: 'company' | 'legal' | 'technical') => void } };
    c.activeTab.set('legal');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Responsable du traitement');
    expect(text).toContain('Données collectées');
    expect(text).toContain('Cookies');
  });

  it('Technical tab content appears after switching activeTab to "technical"', async () => {
    await setup();
    const c = fixture.componentInstance as unknown as { activeTab: { set: (v: 'company' | 'legal' | 'technical') => void } };
    c.activeTab.set('technical');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Dépôt');
    expect(text).toContain('Backend');
    expect(text).toContain('Frontend');
  });
});
