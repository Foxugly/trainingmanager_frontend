import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        FooterComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
  });

  it('renders brand, tagline, version, author, year on a single line', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('app.title');
    expect(html).toContain('app.tagline');
    expect(html).toContain('footer.version_label');
    expect(html).toContain('footer.author');
  });

  it('renders the current year (computed in component, not template)', () => {
    const text = (fixture.nativeElement.textContent as string) ?? '';
    const expectedYear = new Date().getFullYear().toString();
    expect(text).toContain(expectedYear);
  });

  it('renders the APP_VERSION constant', () => {
    const text = (fixture.nativeElement.textContent as string) ?? '';
    expect(text).toMatch(/\d+\.\d+\.\d+/);
  });

  it('renders 4 separator dots between the segments', () => {
    // brand · tagline [fill] version · copyright(© year + author) · privacy · rights
    const seps = fixture.nativeElement.querySelectorAll('.footer-sep');
    expect(seps.length).toBe(4);
  });

  it('renders the Foxugly author link with logo + rights', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('footer.author');
    expect(html).toContain('footer.rights');
    expect(fixture.nativeElement.querySelector('.footer-author-logo')).toBeTruthy();
  });

  it('renders a Privacy link pointing at /privacy', () => {
    const link = fixture.nativeElement.querySelector('.footer-privacy-link') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/privacy');
    expect(fixture.nativeElement.innerHTML as string).toContain('footer.privacy');
  });
});
