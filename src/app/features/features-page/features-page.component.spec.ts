import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeaturesPageComponent } from './features-page.component';

describe('FeaturesPageComponent', () => {
  let fixture: ComponentFixture<FeaturesPageComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        FeaturesPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(FeaturesPageComponent);
    fixture.detectChanges();
  });

  it('renders the page title and subtitle keys', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('features_page.title');
    expect(html).toContain('features_page.subtitle');
    expect(html).toContain('features_page.cta');
  });

  it('renders all 6 capability sections with their i18n keys', () => {
    const html = fixture.nativeElement.innerHTML as string;
    for (const key of ['teams', 'planning', 'ai', 'attendance', 'i18n', 'roles']) {
      expect(html).toContain(`features_page.sections.${key}.title`);
      expect(html).toContain(`features_page.sections.${key}.description`);
    }
  });
});
