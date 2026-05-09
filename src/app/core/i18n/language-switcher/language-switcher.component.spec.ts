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

  function build(initial: 'fr' | 'nl' | 'en' | 'it' | 'es' = 'fr') {
    const langSig = signal(initial);
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
        { provide: LanguageService, useValue: { activeLang: langSig.asReadonly(), switchLanguage: switchSpy } },
        { provide: MessageService, useValue: { add: messageSpy } },
      ],
    });
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.detectChanges();
    const protectedAccess = fixture.componentInstance as unknown as {
      languages: typeof AVAILABLE_LANGUAGES;
      current(): string;
      open(): boolean;
      toggle(): void;
      close(): void;
      select(code: 'fr' | 'nl' | 'en' | 'it' | 'es'): void;
    };
    return { fixture, component: protectedAccess };
  }

  it('exposes the 5 languages', () => {
    const { component } = build();
    expect(component.languages.map((l) => l.code)).toEqual(['fr', 'nl', 'en', 'it', 'es']);
  });

  it('reflects active language', () => {
    const { component } = build('it');
    expect(component.current()).toBe('it');
  });

  it('starts closed and toggles open/closed', () => {
    const { component, fixture } = build();
    expect(component.open()).toBe(false);
    component.toggle();
    fixture.detectChanges();
    expect(component.open()).toBe(true);
    component.close();
    fixture.detectChanges();
    expect(component.open()).toBe(false);
  });

  it('renders the trigger with the uppercase active code', () => {
    const { fixture } = build('nl');
    const trigger = fixture.nativeElement.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(trigger.textContent).toContain('NL');
  });

  it('renders 5 menu items when open with aria-current on the active one', () => {
    const { component, fixture } = build('en');
    component.toggle();
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(5);
    const active = fixture.nativeElement.querySelector('[role="menuitem"][aria-current="true"]') as HTMLElement;
    expect(active).not.toBeNull();
    expect(active.textContent).toContain('English');
  });

  it('select() calls switchLanguage and closes', () => {
    const { component } = build();
    switchSpy.mockReturnValue(of({}));
    component.toggle();
    component.select('nl');
    expect(switchSpy).toHaveBeenCalledWith('nl');
    expect(component.open()).toBe(false);
  });

  it('select() is a no-op for the active language', () => {
    const { component } = build('fr');
    switchSpy.mockReturnValue(of({}));
    component.select('fr');
    expect(switchSpy).not.toHaveBeenCalled();
  });

  it('shows an error toast on switch failure', () => {
    const { component } = build();
    switchSpy.mockReturnValue(throwError(() => ({ status: 500 })));
    component.select('nl');
    expect(messageSpy).toHaveBeenCalledTimes(1);
    expect(messageSpy.mock.calls[0][0]).toMatchObject({ severity: 'error' });
  });
});
