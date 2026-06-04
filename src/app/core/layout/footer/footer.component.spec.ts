import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('renders 2 separator dots between the segments', () => {
    // brand · tagline [fill] version · copyright(© year + author + rights)
    const seps = fixture.nativeElement.querySelectorAll('.footer-sep');
    expect(seps.length).toBe(2);
  });

  it('renders the Foxugly author link with logo + rights', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('footer.author');
    expect(html).toContain('footer.rights');
    expect(fixture.nativeElement.querySelector('.footer-author-logo')).toBeTruthy();
  });
});
