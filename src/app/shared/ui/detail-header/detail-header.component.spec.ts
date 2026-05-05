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

@Component({
  imports: [DetailHeaderComponent],
  template: `
    <app-detail-header
      eyebrow="Team"
      title="Sharks"
      [backLink]="['/teams']"
      icon="pi-users"
      [centered]="true"
    >
      <span detailHeaderBadges class="badge">owner</span>
      <button detailHeaderActions type="button">Edit</button>
      <dl detailHeaderMeta>
        <div>Sport: Swim</div>
      </dl>
    </app-detail-header>
  `,
})
class CenteredHostComponent {}

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

    const sentinel = fixture.nativeElement.querySelector('hr');
    expect(sentinel).not.toBeNull();
  });

  it('applies centered layout classes when centered=true', async () => {
    await TestBed.configureTestingModule({
      imports: [
        CenteredHostComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: { common: { back: 'Retour' } } },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(CenteredHostComponent);
    fixture.detectChanges();

    const html = fixture.nativeElement.outerHTML as string;
    // Centered title block uses items-center + text-center on the wrapping flex.
    expect(html).toContain('text-center');
    expect(html).toContain('items-center');
    // Meta wrapper centers via justify-center in centered mode.
    expect(html).toContain('justify-center');
  });
});
