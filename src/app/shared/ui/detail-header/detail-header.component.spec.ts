import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Component } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { DetailHeaderComponent } from './detail-header.component';

@Component({
  imports: [DetailHeaderComponent],
  template: `
    <app-detail-header
      eyebrow="Team"
      title="Sharks"
      [backLink]="['/teams']"
      icon="pi-users"
    >
      <span detailHeaderBadges class="badge">owner</span>
      <button detailHeaderActions type="button">Edit</button>
      <dl detailHeaderMeta>
        <div>Sport: Swim</div>
      </dl>
    </app-detail-header>
  `,
})
class HostComponent {}

describe('DetailHeaderComponent', () => {
  it('renders title, eyebrow, back link, and projects badges/actions/meta', async () => {
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: { common: { back: 'Retour' } } },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Sharks');
    expect(html).toContain('Team');
    expect(html).toContain('Retour');
    expect(html).toContain('owner');
    expect(html).toContain('Edit');
    expect(html).toContain('Sport: Swim');

    // The sticky-header sentinel is rendered as an aria-hidden div for IntersectionObserver.
    const header = fixture.nativeElement.querySelector('header');
    expect(header).not.toBeNull();
  });

  it('renders single-line toolbar layout: back left, title centered, actions right', async () => {
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: { common: { back: 'Retour' } } },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const html = fixture.nativeElement.outerHTML as string;
    expect(html).toContain('text-center');
    expect(html).toContain('items-center');
    expect(html).toContain('justify-center');
  });
});
