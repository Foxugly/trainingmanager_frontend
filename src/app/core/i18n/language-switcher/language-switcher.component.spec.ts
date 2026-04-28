import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AVAILABLE_LANGUAGES } from '../available-languages';
import { LanguageService } from '../language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';

describe('LanguageSwitcherComponent', () => {
  let switchSpy: ReturnType<typeof vi.fn>;
  let messageSpy: ReturnType<typeof vi.fn>;

  function build(initialLang: 'fr' | 'nl' | 'en' | 'it' | 'es' = 'fr') {
    const langSignal = signal(initialLang);
    switchSpy = vi.fn();
    messageSpy = vi.fn();

    TestBed.configureTestingModule({
      imports: [
        LanguageSwitcherComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        {
          provide: LanguageService,
          useValue: { activeLang: langSignal.asReadonly(), switchLanguage: switchSpy },
        },
        { provide: MessageService, useValue: { add: messageSpy } },
      ],
    });

    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.detectChanges();
    const protectedAccess = fixture.componentInstance as unknown as {
      languages: typeof AVAILABLE_LANGUAGES;
      current(): string;
      onChange(code: 'fr' | 'nl' | 'en' | 'it' | 'es'): void;
    };
    return { fixture, component: protectedAccess };
  }

  it('exposes the 5 native languages', () => {
    const { component } = build();
    expect(component.languages.map((l) => l.code)).toEqual(['fr', 'nl', 'en', 'it', 'es']);
    expect(component.languages.map((l) => l.nativeName)).toEqual([
      'Français',
      'Nederlands',
      'English',
      'Italiano',
      'Español',
    ]);
  });

  it('reflects the current active language from LanguageService', () => {
    const { component } = build('it');
    expect(component.current()).toBe('it');
  });

  it('calls switchLanguage on selection', () => {
    const { component } = build();
    switchSpy.mockReturnValue(of({}));
    component.onChange('nl');
    expect(switchSpy).toHaveBeenCalledWith('nl');
  });

  it('shows an error toast when the switch fails', () => {
    const { component } = build();
    switchSpy.mockReturnValue(throwError(() => ({ status: 500 })));
    component.onChange('nl');
    expect(messageSpy).toHaveBeenCalledTimes(1);
    expect(messageSpy.mock.calls[0][0]).toMatchObject({ severity: 'error' });
  });
});
