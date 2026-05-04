import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContributePageComponent } from './contribute-page.component';

describe('ContributePageComponent', () => {
  let fixture: ComponentFixture<ContributePageComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        ContributePageComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ContributePageComponent);
    fixture.detectChanges();
  });

  it('renders the page title + intro + thanks i18n keys', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('contribute_page.title');
    expect(html).toContain('contribute_page.intro');
    expect(html).toContain('contribute_page.thanks');
  });

  it('renders both OSS and Financial sections with their i18n keys', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('contribute_page.oss.title');
    expect(html).toContain('contribute_page.oss.description');
    expect(html).toContain('contribute_page.financial.title');
    expect(html).toContain('contribute_page.financial.description');
  });

  it('exposes external links to the GitHub frontend, backend and issues URLs', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('https://github.com/Foxugly/trainingmanager_frontend');
    expect(html).toContain('https://github.com/Foxugly/trainingmanager');
    expect(html).toContain('https://github.com/Foxugly/trainingmanager/issues');
    // Open in new tab convention
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('exposes the GitHub Sponsors CTA with target=_blank + rel=noopener', () => {
    const sponsorsLink = fixture.nativeElement.querySelector(
      'a[href="https://github.com/sponsors/Foxugly"]',
    ) as HTMLAnchorElement | null;
    expect(sponsorsLink).not.toBeNull();
    expect(sponsorsLink?.getAttribute('target')).toBe('_blank');
    expect(sponsorsLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(sponsorsLink?.textContent).toContain('contribute_page.financial.cta_sponsors');
  });
});
