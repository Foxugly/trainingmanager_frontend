import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformancesService } from '../../../api/api/performances.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { PerformancePanelComponent } from './performance-panel.component';

// Polyfill ResizeObserver for jsdom — PrimeNG UIChart / p-dialog use it.
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverPolyfill;
}

/**
 * Garde-fou sur la retraduction des libellés construits par un computed().
 *
 * `unitOptions` appelait `translate()` en lisant `transloco.getActiveLang()` pour
 * « toucher » la langue. Mais getActiveLang est un getter, pas un signal : aucune
 * dépendance n'était créée, et le computed n'était jamais recalculé. Comme TM
 * bascule de langue sans recharger la page, ces libellés restaient figés dans la
 * langue du premier rendu. Ce test échoue si l'on y revient.
 */
interface WithUnitOptions {
  unitOptions(): { label: string }[];
}

describe('PerformancePanelComponent — retraduction au changement de langue', () => {
  let component: PerformancePanelComponent;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        PerformancePanelComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            fr: { performance: { units: { s: 'secondes', m: 'm', reps: 'reps', kg: 'kg', pts: 'pts' } } },
            en: { performance: { units: { s: 'seconds', m: 'm', reps: 'reps', kg: 'kg', pts: 'pts' } } },
          },
          translocoConfig: { availableLangs: ['fr', 'en'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        MessageService,
        ConfirmationService,
        {
          provide: PerformancesService,
          useValue: {
            performancesList: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
            performancesCreate: vi.fn(),
            performancesPartialUpdate: vi.fn(),
            performancesDestroy: vi.fn(),
          },
        },
      ],
    })
      .overrideComponent(PerformancePanelComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(PerformancePanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 7);
    fixture.componentRef.setInput('memberId', 3);
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
  });

  /** Laisse arriver le catalogue (chargement asynchrone) puis la microtache qui
   *  incremente le compteur de LanguageService. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  /** Charge un catalogue comme le ferait le pipe | transloco a l'ecran (ce spec
   *  neutralise le gabarit, donc rien ne le demande spontanement). */
  const loadCatalogue = async (lang: string) => {
    await firstValueFrom(TestBed.inject(TranslocoService).load(lang));
    await settle();
  };

  it('remplace la clef brute par le texte une fois le catalogue arrive', async () => {
    const options = () => (component as unknown as WithUnitOptions).unitOptions();
    // Tant que le catalogue n'est pas la, translate() rend la clef : c'est
    // exactement l'etat que l'ancien code figeait pour toujours.
    expect(options()[0].label).toBe('performance.units.s');

    await loadCatalogue('fr');

    expect(options()[0].label).toBe('secondes');
  });

  it('retraduit les libelles quand la langue bascule, sans recharger le composant', async () => {
    const options = () => (component as unknown as WithUnitOptions).unitOptions();
    await loadCatalogue('fr');
    expect(options()[0].label).toBe('secondes');

    TestBed.inject(LanguageService).applyToTranslocoOnly('en');
    await loadCatalogue('en');

    expect(options()[0].label).toBe('seconds');
  });
});
