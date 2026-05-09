# Public navigation revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revamp `/contribute` as a donate-style page, add a new `/about` page with 2 tabs (Legal/Technical), and replace the language switcher with a compact globe-trigger popup, all aligned with the new dark-gradient topbar.

**Architecture:** Three coordinated, independent UI changes shipped as four feature commits, then verification. Each change reuses existing patterns: PrimeNG components (`Menu` import where useful, `Tabs`/`TabList`/`Tab`/`TabPanels`/`TabPanel` for the about-page tabs), Tailwind utilities for layout, signals for local UI state, Transloco for i18n across all 5 locales, Vitest specs mirroring the project's `nativeElement.innerHTML.toContain('key.path')` style.

**Tech Stack:** Angular 21 (standalone, signals, `inject()`), PrimeNG 21 (`Tabs`, `Menu`, `Button`), Tailwind 4, Transloco 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-05-09-contribute-about-langswitcher-design.md`

---

## File map

### Created
- `src/app/features/about-page/about-page.component.ts`
- `src/app/features/about-page/about-page.component.html`
- `src/app/features/about-page/about-page.component.scss`
- `src/app/features/about-page/about-page.component.spec.ts`

### Modified
- `src/app/core/i18n/language-switcher/language-switcher.component.ts` — full rewrite (signal-driven dropdown, `pi-globe` trigger).
- `src/app/core/i18n/language-switcher/language-switcher.component.html` — full rewrite.
- `src/app/core/i18n/language-switcher/language-switcher.component.scss` — purge unused.
- `src/app/core/i18n/language-switcher/language-switcher.component.spec.ts` — replace `<p-select>` assertions with the new dropdown contract.
- `src/app/features/contribute-page/contribute-page.component.ts` — keep only `sponsorsUrl`.
- `src/app/features/contribute-page/contribute-page.component.html` — full rewrite.
- `src/app/features/contribute-page/contribute-page.component.spec.ts` — drop oss/financial assertions; assert hero + 4 reasons + sponsors CTA.
- `src/app/app.routes.ts` — add `/about` route under `PublicLayoutComponent`.
- `src/app/core/layout/public-layout/public-layout.component.html` — add the About link in desktop nav and mobile dropdown.
- `src/app/core/layout/public-layout/public-layout.component.spec.ts` — assert `public.nav.about` rendered.
- `public/i18n/{fr,nl,en,it,es}.json` — add new keys (`common.language_switcher.aria`, restructured `contribute_page.*`, new `about_page.*`, new `public.nav.about`).

---

## Task 1 — Refactor language switcher

**Goal:** Replace `<p-select>` with a compact button + custom dropdown styled for dark backgrounds.

**Files:**
- Modify: `src/app/core/i18n/language-switcher/language-switcher.component.ts`
- Modify: `src/app/core/i18n/language-switcher/language-switcher.component.html`
- Modify: `src/app/core/i18n/language-switcher/language-switcher.component.scss`
- Modify: `src/app/core/i18n/language-switcher/language-switcher.component.spec.ts`
- Modify: `public/i18n/fr.json`, `public/i18n/nl.json`, `public/i18n/en.json`, `public/i18n/it.json`, `public/i18n/es.json` (1 new key only)

### Step 1.1 — Update the spec to reflect the new contract

Replace the entire content of `src/app/core/i18n/language-switcher/language-switcher.component.spec.ts` with:

```ts
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
      open(): boolean;
      toggle(): void;
      close(): void;
      select(code: 'fr' | 'nl' | 'en' | 'it' | 'es'): void;
    };
    return { fixture, component: protectedAccess };
  }

  it('exposes the 5 native languages', () => {
    const { component } = build();
    expect(component.languages.map((l) => l.code)).toEqual(['fr', 'nl', 'en', 'it', 'es']);
  });

  it('reflects the current active language from LanguageService', () => {
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

  it('renders all 5 menu items when open, with aria-current on the active item', () => {
    const { component, fixture } = build('en');
    component.toggle();
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(5);
    const active = fixture.nativeElement.querySelector('[role="menuitem"][aria-current="true"]') as HTMLElement;
    expect(active).not.toBeNull();
    expect(active.textContent).toContain('English');
  });

  it('select() calls switchLanguage and closes the menu', () => {
    const { component } = build();
    switchSpy.mockReturnValue(of({}));
    component.toggle();
    component.select('nl');
    expect(switchSpy).toHaveBeenCalledWith('nl');
    expect(component.open()).toBe(false);
  });

  it('select() is a no-op when picking the active language', () => {
    const { component } = build('fr');
    switchSpy.mockReturnValue(of({}));
    component.select('fr');
    expect(switchSpy).not.toHaveBeenCalled();
  });

  it('shows an error toast when the switch fails', () => {
    const { component } = build();
    switchSpy.mockReturnValue(throwError(() => ({ status: 500 })));
    component.select('nl');
    expect(messageSpy).toHaveBeenCalledTimes(1);
    expect(messageSpy.mock.calls[0][0]).toMatchObject({ severity: 'error' });
  });
});
```

- [ ] **Step 1.1.1 — Run the spec to confirm it fails**

Run: `npm test -- src/app/core/i18n/language-switcher/language-switcher.component.spec.ts`
Expected: FAIL — multiple errors. The current component has no `open`/`toggle`/`close`/`select`, exports `<p-select>` not `<button aria-haspopup="menu">`. This confirms the test drives the new contract.

### Step 1.2 — Rewrite the component class

Replace the entire content of `src/app/core/i18n/language-switcher/language-switcher.component.ts` with:

```ts
import { UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { AVAILABLE_LANGUAGES, LanguageCode } from '../available-languages';
import { LanguageService } from '../language.service';

@Component({
  selector: 'app-language-switcher',
  imports: [TranslocoPipe, UpperCasePipe],
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class LanguageSwitcherComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly languageService = inject(LanguageService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly languages = AVAILABLE_LANGUAGES;
  protected readonly current = this.languageService.activeLang;
  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const root = this.elementRef.nativeElement;
    if (!root.contains(event.target as Node)) {
      this.close();
    }
  }

  protected select(code: LanguageCode): void {
    this.close();
    if (code === this.current()) return;
    this.languageService.switchLanguage(code).subscribe({
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('profile.language_switch_failed'),
        });
      },
    });
  }
}
```

### Step 1.3 — Rewrite the template

Replace the entire content of `src/app/core/i18n/language-switcher/language-switcher.component.html` with:

```html
<div class="relative inline-block">
  <button
    type="button"
    class="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 text-sm font-medium text-white transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    [attr.aria-label]="'common.language_switcher.aria' | transloco"
    [attr.aria-haspopup]="'menu'"
    [attr.aria-expanded]="open()"
    (click)="toggle()"
  >
    <i class="pi pi-globe text-sm" aria-hidden="true"></i>
    <span class="font-semibold tracking-wide">{{ current() | uppercase }}</span>
    <i class="pi pi-chevron-down text-[10px]" aria-hidden="true"></i>
  </button>

  @if (open()) {
    <div
      role="menu"
      class="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-200"
    >
      @for (lang of languages; track lang.code) {
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-gray-50"
          [class.bg-indigo-50]="lang.code === current()"
          [attr.aria-current]="lang.code === current() ? 'true' : null"
          (click)="select(lang.code)"
        >
          <span
            class="inline-flex h-5 w-7 items-center justify-center rounded text-[10px] font-bold uppercase"
            [class.bg-gray-100]="lang.code !== current()"
            [class.text-gray-600]="lang.code !== current()"
            [class.bg-indigo-100]="lang.code === current()"
            [class.text-indigo-700]="lang.code === current()"
          >
            {{ lang.code }}
          </span>
          <span class="flex-1 text-gray-700">{{ lang.nativeName }}</span>
          @if (lang.code === current()) {
            <i class="pi pi-check text-xs text-indigo-600" aria-hidden="true"></i>
          }
        </button>
      }
    </div>
  }
</div>
```

### Step 1.4 — Empty out the SCSS (no custom CSS needed)

Replace the entire content of `src/app/core/i18n/language-switcher/language-switcher.component.scss` with:

```scss
:host {
  display: inline-block;
}
```

### Step 1.5 — Add the new i18n key to all 5 catalogs

In each of `public/i18n/fr.json`, `nl.json`, `en.json`, `it.json`, `es.json`, locate the existing `"common"` object (at the top level) and add a `language_switcher` sub-object inside it. Add it after the existing `"entity": { … }` block.

`fr.json` snippet (insert this block before the closing `}` of `"common"`):
```json
    "language_switcher": {
      "aria": "Choisir la langue"
    }
```

`nl.json`:
```json
    "language_switcher": {
      "aria": "Taal kiezen"
    }
```

`en.json`:
```json
    "language_switcher": {
      "aria": "Choose language"
    }
```

`it.json`:
```json
    "language_switcher": {
      "aria": "Scegli la lingua"
    }
```

`es.json`:
```json
    "language_switcher": {
      "aria": "Elegir idioma"
    }
```

Make sure to add the comma after the preceding sibling key.

### Step 1.6 — Run the spec; confirm it passes

- [ ] Run: `npm test -- src/app/core/i18n/language-switcher/language-switcher.component.spec.ts`
- Expected: PASS, all 8 tests green.

If it fails, read the assertion message and adjust. Common pitfalls:
- Forgot to add `provideNoopAnimations()` (already in place).
- The `host` listener on `document:click` swallowing the `toggle()` test click — the test calls `component.toggle()` directly, no DOM click, so this is safe.

### Step 1.7 — Commit

- [ ] Run:

```bash
git add src/app/core/i18n/language-switcher public/i18n
git commit -m "refactor(i18n): compact globe-trigger language switcher

Replace the full-width <p-select> with a compact button + custom dropdown
styled for dark topbars. Adds common.language_switcher.aria across the
5 locales.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Revamp `/contribute` as a donate-style page

**Goal:** Replace the current dual-card layout with a single-purpose donation page (hero + 4 reasons + GitHub Sponsors CTA + thanks).

**Files:**
- Modify: `src/app/features/contribute-page/contribute-page.component.ts`
- Modify: `src/app/features/contribute-page/contribute-page.component.html`
- Modify: `src/app/features/contribute-page/contribute-page.component.spec.ts`
- Modify: `public/i18n/fr.json`, `nl.json`, `en.json`, `it.json`, `es.json` — restructure `contribute_page.*`.

### Step 2.1 — Update the spec to reflect the new contract

Replace the entire content of `src/app/features/contribute-page/contribute-page.component.spec.ts` with:

```ts
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

  it('renders the hero (eyebrow + title + intro) i18n keys', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('contribute_page.eyebrow');
    expect(html).toContain('contribute_page.title');
    expect(html).toContain('contribute_page.intro');
  });

  it('renders the 4 reason cards with their i18n keys', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('contribute_page.reasons.section_title');
    expect(html).toContain('contribute_page.reasons.oss.title');
    expect(html).toContain('contribute_page.reasons.oss.body');
    expect(html).toContain('contribute_page.reasons.hosting.title');
    expect(html).toContain('contribute_page.reasons.hosting.body');
    expect(html).toContain('contribute_page.reasons.maintenance.title');
    expect(html).toContain('contribute_page.reasons.maintenance.body');
    expect(html).toContain('contribute_page.reasons.features.title');
    expect(html).toContain('contribute_page.reasons.features.body');
  });

  it('renders the donate section with GitHub Sponsors CTA in a new tab', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('contribute_page.donate.title');
    expect(html).toContain('contribute_page.donate.intro');
    expect(html).toContain('contribute_page.donate.redirect_note');

    const sponsorsLink = fixture.nativeElement.querySelector(
      'a[href="https://github.com/sponsors/Foxugly"]',
    ) as HTMLAnchorElement | null;
    expect(sponsorsLink).not.toBeNull();
    expect(sponsorsLink?.getAttribute('target')).toBe('_blank');
    expect(sponsorsLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(sponsorsLink?.textContent).toContain('contribute_page.donate.cta');
  });

  it('renders the thanks section', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('contribute_page.thanks.title');
    expect(html).toContain('contribute_page.thanks.body');
  });

  it('does not surface repo or issues links anymore', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).not.toContain('https://github.com/Foxugly/trainingmanager_frontend');
    expect(html).not.toContain('https://github.com/Foxugly/trainingmanager"');
    expect(html).not.toContain('/issues');
  });
});
```

- [ ] **Step 2.1.1 — Run the spec to confirm it fails**

Run: `npm test -- src/app/features/contribute-page/contribute-page.component.spec.ts`
Expected: FAIL — `contribute_page.eyebrow` and the new keys aren't yet referenced in the template.

### Step 2.2 — Slim the component class

Replace the entire content of `src/app/features/contribute-page/contribute-page.component.ts` with:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-contribute-page',
  imports: [TranslocoPipe],
  templateUrl: './contribute-page.component.html',
  styleUrl: './contribute-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributePageComponent {
  protected readonly sponsorsUrl = 'https://github.com/sponsors/Foxugly';
}
```

### Step 2.3 — Rewrite the template

Replace the entire content of `src/app/features/contribute-page/contribute-page.component.html` with:

```html
<section class="relative overflow-hidden">
  <div
    class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-rose-50/60 to-transparent"
    aria-hidden="true"
  ></div>

  <div class="container mx-auto px-6 py-12 md:py-20">
    <div class="mx-auto max-w-2xl text-center">
      <p class="text-xs font-semibold uppercase tracking-widest text-rose-600">
        {{ 'contribute_page.eyebrow' | transloco }}
      </p>
      <h1 class="mt-3 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
        {{ 'contribute_page.title' | transloco }}
      </h1>
      <p class="mt-4 text-base text-gray-600 md:text-lg">
        {{ 'contribute_page.intro' | transloco }}
      </p>
    </div>

    <div class="mx-auto mt-16 max-w-4xl">
      <h2 class="text-center text-2xl font-semibold text-gray-900">
        {{ 'contribute_page.reasons.section_title' | transloco }}
      </h2>

      <div class="mt-8 grid gap-5 md:grid-cols-2">
        <article class="flex gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"
            aria-hidden="true"
          >
            <i class="pi pi-code text-base"></i>
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900">
              {{ 'contribute_page.reasons.oss.title' | transloco }}
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-gray-600">
              {{ 'contribute_page.reasons.oss.body' | transloco }}
            </p>
          </div>
        </article>

        <article class="flex gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"
            aria-hidden="true"
          >
            <i class="pi pi-server text-base"></i>
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900">
              {{ 'contribute_page.reasons.hosting.title' | transloco }}
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-gray-600">
              {{ 'contribute_page.reasons.hosting.body' | transloco }}
            </p>
          </div>
        </article>

        <article class="flex gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"
            aria-hidden="true"
          >
            <i class="pi pi-shield text-base"></i>
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900">
              {{ 'contribute_page.reasons.maintenance.title' | transloco }}
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-gray-600">
              {{ 'contribute_page.reasons.maintenance.body' | transloco }}
            </p>
          </div>
        </article>

        <article class="flex gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700"
            aria-hidden="true"
          >
            <i class="pi pi-sparkles text-base"></i>
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900">
              {{ 'contribute_page.reasons.features.title' | transloco }}
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-gray-600">
              {{ 'contribute_page.reasons.features.body' | transloco }}
            </p>
          </div>
        </article>
      </div>
    </div>

    <div class="mx-auto mt-16 max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <h2 class="text-2xl font-semibold text-gray-900">
        {{ 'contribute_page.donate.title' | transloco }}
      </h2>
      <p class="mt-3 text-sm leading-relaxed text-gray-600">
        {{ 'contribute_page.donate.intro' | transloco }}
      </p>
      <div class="mt-6 flex justify-center">
        <a
          [href]="sponsorsUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-rose-400 hover:to-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        >
          <i class="pi pi-heart-fill text-xs" aria-hidden="true"></i>
          {{ 'contribute_page.donate.cta' | transloco }}
          <i class="pi pi-external-link text-xs" aria-hidden="true"></i>
        </a>
      </div>
      <p class="mt-3 text-xs italic text-gray-500">
        {{ 'contribute_page.donate.redirect_note' | transloco }}
      </p>
    </div>

    <div class="mx-auto mt-12 max-w-xl text-center">
      <h2 class="text-xl font-semibold text-gray-900">
        {{ 'contribute_page.thanks.title' | transloco }}
      </h2>
      <p class="mt-2 text-sm text-gray-600">
        {{ 'contribute_page.thanks.body' | transloco }}
      </p>
    </div>
  </div>
</section>
```

### Step 2.4 — Restructure the i18n keys (5 catalogs)

The shape changes from the current:

```json
"contribute_page": {
  "title": "...",
  "intro": "...",
  "oss": { "title": "...", "description": "...", "cta_repo_frontend": "...", "cta_repo_backend": "...", "cta_issues": "..." },
  "financial": { "title": "...", "description": "...", "cta_sponsors": "..." },
  "thanks": "..."
}
```

…to:

```json
"contribute_page": {
  "eyebrow": "…",
  "title": "…",
  "intro": "…",
  "reasons": {
    "section_title": "…",
    "oss": { "title": "…", "body": "…" },
    "hosting": { "title": "…", "body": "…" },
    "maintenance": { "title": "…", "body": "…" },
    "features": { "title": "…", "body": "…" }
  },
  "donate": {
    "title": "…",
    "intro": "…",
    "cta": "…",
    "redirect_note": "…"
  },
  "thanks": {
    "title": "…",
    "body": "…"
  }
}
```

Use the Edit tool with `old_string` set to the entire current `"contribute_page": { … }` block (including the trailing comma) and `new_string` set to the new block (with the trailing comma) — preserving each catalog's surrounding context.

**`fr.json` — new value:**
```json
"contribute_page": {
    "eyebrow": "Soutenir le projet",
    "title": "Aidez Training Manager à grandir",
    "intro": "Training Manager est un projet libre et open source. Votre soutien permet de maintenir la plateforme, corriger les bugs et développer de nouvelles fonctionnalités.",
    "reasons": {
      "section_title": "Pourquoi soutenir Training Manager ?",
      "oss": {
        "title": "Open source et gratuit",
        "body": "Pas d'abonnement, pas de publicité. Le code est libre et le restera."
      },
      "hosting": {
        "title": "Hébergement et infrastructure",
        "body": "Serveurs, certificats SSL et envoi d'emails ont un coût bien réel."
      },
      "maintenance": {
        "title": "Maintenance continue",
        "body": "Mises à jour de sécurité, correctifs et compatibilité avec les nouvelles versions."
      },
      "features": {
        "title": "Nouvelles fonctionnalités",
        "body": "Chaque contribution accélère le développement des fonctionnalités demandées par la communauté."
      }
    },
    "donate": {
      "title": "Faire un don",
      "intro": "Les dons sont gérés via GitHub Sponsors. Vous pouvez faire un don ponctuel ou mettre en place un soutien récurrent.",
      "cta": "Soutenir sur GitHub Sponsors",
      "redirect_note": "Vous serez redirigé vers GitHub Sponsors dans un nouvel onglet."
    },
    "thanks": {
      "title": "Merci !",
      "body": "Chaque contribution, aussi petite soit-elle, fait une différence. Merci de croire en ce projet."
    }
  },
```

**`en.json` — new value:**
```json
"contribute_page": {
    "eyebrow": "Support the project",
    "title": "Help Training Manager grow",
    "intro": "Training Manager is a free, open-source project. Your support helps maintain the platform, fix bugs and develop new features.",
    "reasons": {
      "section_title": "Why support Training Manager?",
      "oss": {
        "title": "Open-source and free",
        "body": "No subscription, no ads. The code is free and will remain so."
      },
      "hosting": {
        "title": "Hosting and infrastructure",
        "body": "Servers, SSL certificates and email delivery have a real cost."
      },
      "maintenance": {
        "title": "Ongoing maintenance",
        "body": "Security updates, bug fixes and compatibility with new releases."
      },
      "features": {
        "title": "New features",
        "body": "Every contribution accelerates the development of community-requested features."
      }
    },
    "donate": {
      "title": "Make a donation",
      "intro": "Donations are handled through GitHub Sponsors. You can make a one-time donation or set up recurring support.",
      "cta": "Support on GitHub Sponsors",
      "redirect_note": "You will be redirected to GitHub Sponsors in a new tab."
    },
    "thanks": {
      "title": "Thank you!",
      "body": "Every contribution, however small, makes a difference. Thank you for believing in this project."
    }
  },
```

**`nl.json` — new value:**
```json
"contribute_page": {
    "eyebrow": "Steun het project",
    "title": "Help Training Manager groeien",
    "intro": "Training Manager is een vrij, open-source project. Jouw steun helpt het platform te onderhouden, bugs op te lossen en nieuwe functies te ontwikkelen.",
    "reasons": {
      "section_title": "Waarom Training Manager steunen?",
      "oss": {
        "title": "Open source en gratis",
        "body": "Geen abonnement, geen reclame. De code is vrij en blijft dat."
      },
      "hosting": {
        "title": "Hosting en infrastructuur",
        "body": "Servers, SSL-certificaten en e-maillevering hebben een reële kost."
      },
      "maintenance": {
        "title": "Doorlopend onderhoud",
        "body": "Beveiligingsupdates, foutoplossingen en compatibiliteit met nieuwe versies."
      },
      "features": {
        "title": "Nieuwe functies",
        "body": "Elke bijdrage versnelt de ontwikkeling van door de community gevraagde functies."
      }
    },
    "donate": {
      "title": "Een donatie doen",
      "intro": "Donaties worden afgehandeld via GitHub Sponsors. Je kunt een eenmalige donatie doen of terugkerende steun instellen.",
      "cta": "Steunen op GitHub Sponsors",
      "redirect_note": "Je wordt doorverwezen naar GitHub Sponsors in een nieuw tabblad."
    },
    "thanks": {
      "title": "Bedankt!",
      "body": "Elke bijdrage, hoe klein ook, maakt een verschil. Bedankt om in dit project te geloven."
    }
  },
```

**`it.json` — new value:**
```json
"contribute_page": {
    "eyebrow": "Sostieni il progetto",
    "title": "Aiuta Training Manager a crescere",
    "intro": "Training Manager è un progetto libero e open source. Il tuo sostegno aiuta a mantenere la piattaforma, correggere bug e sviluppare nuove funzionalità.",
    "reasons": {
      "section_title": "Perché sostenere Training Manager?",
      "oss": {
        "title": "Open source e gratuito",
        "body": "Nessun abbonamento, nessuna pubblicità. Il codice è libero e tale rimarrà."
      },
      "hosting": {
        "title": "Hosting e infrastruttura",
        "body": "Server, certificati SSL e invio email hanno un costo reale."
      },
      "maintenance": {
        "title": "Manutenzione continua",
        "body": "Aggiornamenti di sicurezza, correzioni di bug e compatibilità con le nuove versioni."
      },
      "features": {
        "title": "Nuove funzionalità",
        "body": "Ogni contributo accelera lo sviluppo delle funzionalità richieste dalla community."
      }
    },
    "donate": {
      "title": "Fai una donazione",
      "intro": "Le donazioni sono gestite tramite GitHub Sponsors. Puoi fare una donazione una tantum o impostare un sostegno ricorrente.",
      "cta": "Sostieni su GitHub Sponsors",
      "redirect_note": "Sarai reindirizzato a GitHub Sponsors in una nuova scheda."
    },
    "thanks": {
      "title": "Grazie!",
      "body": "Ogni contributo, per quanto piccolo, fa la differenza. Grazie per credere in questo progetto."
    }
  },
```

**`es.json` — new value:**
```json
"contribute_page": {
    "eyebrow": "Apoya el proyecto",
    "title": "Ayuda a Training Manager a crecer",
    "intro": "Training Manager es un proyecto libre y de código abierto. Tu apoyo ayuda a mantener la plataforma, corregir errores y desarrollar nuevas funciones.",
    "reasons": {
      "section_title": "¿Por qué apoyar a Training Manager?",
      "oss": {
        "title": "Código abierto y gratuito",
        "body": "Sin suscripción, sin anuncios. El código es libre y lo seguirá siendo."
      },
      "hosting": {
        "title": "Alojamiento e infraestructura",
        "body": "Servidores, certificados SSL y envío de correos tienen un coste real."
      },
      "maintenance": {
        "title": "Mantenimiento continuo",
        "body": "Actualizaciones de seguridad, correcciones y compatibilidad con nuevas versiones."
      },
      "features": {
        "title": "Nuevas funciones",
        "body": "Cada contribución acelera el desarrollo de las funciones solicitadas por la comunidad."
      }
    },
    "donate": {
      "title": "Hacer una donación",
      "intro": "Las donaciones se gestionan a través de GitHub Sponsors. Puedes hacer una donación única o configurar un apoyo recurrente.",
      "cta": "Apoyar en GitHub Sponsors",
      "redirect_note": "Serás redirigido a GitHub Sponsors en una nueva pestaña."
    },
    "thanks": {
      "title": "¡Gracias!",
      "body": "Cada contribución, por pequeña que sea, marca la diferencia. Gracias por creer en este proyecto."
    }
  },
```

### Step 2.5 — Run the spec; confirm it passes

- [ ] Run: `npm test -- src/app/features/contribute-page/contribute-page.component.spec.ts`
- Expected: PASS, all 5 tests green.

### Step 2.6 — Commit

- [ ] Run:

```bash
git add src/app/features/contribute-page public/i18n
git commit -m "feat(contribute): donate-style revamp inspired by quizonline/donate

Single-purpose donation page: hero, 4 reason cards, GitHub Sponsors CTA,
thanks. Drops the OSS repo links and the dual-card layout. Restructures
contribute_page.* across the 5 locales.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — New `/about` page (component + route + nav link)

**Goal:** Add an About page with a hero and 2 PrimeNG tabs (Mentions légales / Technique). Wire it into the public nav.

**Files:**
- Create: `src/app/features/about-page/about-page.component.ts`
- Create: `src/app/features/about-page/about-page.component.html`
- Create: `src/app/features/about-page/about-page.component.scss`
- Create: `src/app/features/about-page/about-page.component.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/core/layout/public-layout/public-layout.component.html`
- Modify: `src/app/core/layout/public-layout/public-layout.component.spec.ts`
- Modify: `public/i18n/{fr,nl,en,it,es}.json` — add `about_page.*` and `public.nav.about`.

### Step 3.1 — Create the component spec first (TDD)

Create `src/app/features/about-page/about-page.component.spec.ts` with:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { AboutPageComponent } from './about-page.component';

describe('AboutPageComponent', () => {
  let fixture: ComponentFixture<AboutPageComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        AboutPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [provideNoopAnimations(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AboutPageComponent);
    fixture.detectChanges();
  });

  it('renders the hero with eyebrow + title + lead i18n keys', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('about_page.eyebrow');
    expect(html).toContain('about_page.title');
    expect(html).toContain('about_page.lead');
  });

  it('renders a "View repository" link to the frontend repo, opens in a new tab', () => {
    const repoLink = fixture.nativeElement.querySelector(
      'a[href="https://github.com/Foxugly/trainingmanager_frontend"]',
    ) as HTMLAnchorElement | null;
    expect(repoLink).not.toBeNull();
    expect(repoLink?.getAttribute('target')).toBe('_blank');
    expect(repoLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(repoLink?.textContent).toContain('about_page.view_repo');
  });

  it('renders the 2 tabs (Legal / Technical) with their headings', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('about_page.legal.tab');
    expect(html).toContain('about_page.technical.tab');
  });

  it('renders the Legal tab content sections (initial active tab)', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('about_page.legal.section_title');
    expect(html).toContain('about_page.legal.controller.title');
    expect(html).toContain('about_page.legal.collected.title');
    expect(html).toContain('about_page.legal.basis.title');
    expect(html).toContain('about_page.legal.rights.title');
    expect(html).toContain('about_page.legal.retention.title');
    expect(html).toContain('about_page.legal.security.title');
    expect(html).toContain('about_page.legal.cookies.title');
  });

  it('renders the Technical tab content sections after activating that tab', () => {
    // PrimeNG v21 p-tabs lazily renders panels — flip the active tab first.
    (fixture.componentInstance as unknown as { activeTab: { set: (v: 'legal' | 'technical') => void } })
      .activeTab.set('technical');
    fixture.detectChanges();
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('about_page.technical.section_title');
    expect(html).toContain('about_page.technical.repo.title');
    expect(html).toContain('about_page.technical.backend.title');
    expect(html).toContain('about_page.technical.frontend.title');
  });

  it('does NOT render a Features tab (already covered by /features)', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).not.toContain('about_page.features.tab');
  });
});
```

### Step 3.2 — Run the spec to confirm it fails

- [ ] Run: `npm test -- src/app/features/about-page/about-page.component.spec.ts`
- Expected: FAIL — `AboutPageComponent` doesn't exist yet.

### Step 3.3 — Create the component class

Create `src/app/features/about-page/about-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';

type AboutTab = 'legal' | 'technical';

@Component({
  selector: 'app-about-page',
  imports: [TranslocoPipe, Tabs, TabList, Tab, TabPanels, TabPanel],
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPageComponent {
  protected readonly frontendRepoUrl = 'https://github.com/Foxugly/trainingmanager_frontend';
  protected readonly activeTab = signal<AboutTab>('legal');
}
```

### Step 3.4 — Create the SCSS

Create `src/app/features/about-page/about-page.component.scss`:

```scss
:host {
  display: block;
}
```

### Step 3.5 — Create the template

Create `src/app/features/about-page/about-page.component.html`:

```html
<section class="relative overflow-hidden">
  <div
    class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-indigo-50/40 to-transparent"
    aria-hidden="true"
  ></div>

  <div class="container mx-auto px-6 py-12 md:py-20">
    <div class="mx-auto max-w-3xl">
      <p class="text-xs font-semibold uppercase tracking-widest text-indigo-600">
        {{ 'about_page.eyebrow' | transloco }}
      </p>
      <h1 class="mt-3 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
        {{ 'about_page.title' | transloco }}
      </h1>
      <p class="mt-4 text-base text-gray-600 md:text-lg">
        {{ 'about_page.lead' | transloco }}
      </p>
      <div class="mt-6">
        <a
          [href]="frontendRepoUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-indigo-400 hover:text-indigo-700"
        >
          <i class="pi pi-github text-xs" aria-hidden="true"></i>
          {{ 'about_page.view_repo' | transloco }}
          <i class="pi pi-external-link text-xs" aria-hidden="true"></i>
        </a>
      </div>
    </div>

    <div class="mx-auto mt-10 max-w-4xl rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
      <p-tabs [value]="activeTab()" (valueChange)="activeTab.set($any($event))">
        <p-tablist>
          <p-tab value="legal">
            <i class="pi pi-shield mr-2" aria-hidden="true"></i>
            {{ 'about_page.legal.tab' | transloco }}
          </p-tab>
          <p-tab value="technical">
            <i class="pi pi-cog mr-2" aria-hidden="true"></i>
            {{ 'about_page.technical.tab' | transloco }}
          </p-tab>
        </p-tablist>

        <p-tabpanels>
          <p-tabpanel value="legal">
            <article class="space-y-6 p-2 md:p-4">
              <header>
                <h2 class="text-xl font-semibold text-gray-900">
                  {{ 'about_page.legal.section_title' | transloco }}
                </h2>
                <p class="mt-2 text-sm text-gray-600">
                  {{ 'about_page.legal.section_intro' | transloco }}
                </p>
              </header>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.legal.controller.title' | transloco }}
                </h3>
                <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-gray-700">
                  <li>{{ 'about_page.legal.controller.item_1' | transloco }}</li>
                  <li>{{ 'about_page.legal.controller.item_2' | transloco }}</li>
                </ul>
              </div>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.legal.collected.title' | transloco }}
                </h3>
                <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-gray-700">
                  <li>{{ 'about_page.legal.collected.item_1' | transloco }}</li>
                  <li>{{ 'about_page.legal.collected.item_2' | transloco }}</li>
                  <li>{{ 'about_page.legal.collected.item_3' | transloco }}</li>
                </ul>
              </div>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.legal.basis.title' | transloco }}
                </h3>
                <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-gray-700">
                  <li>{{ 'about_page.legal.basis.item_1' | transloco }}</li>
                  <li>{{ 'about_page.legal.basis.item_2' | transloco }}</li>
                  <li>{{ 'about_page.legal.basis.item_3' | transloco }}</li>
                </ul>
              </div>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.legal.rights.title' | transloco }}
                </h3>
                <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-gray-700">
                  <li>{{ 'about_page.legal.rights.item_1' | transloco }}</li>
                  <li>{{ 'about_page.legal.rights.item_2' | transloco }}</li>
                  <li>{{ 'about_page.legal.rights.item_3' | transloco }}</li>
                  <li>{{ 'about_page.legal.rights.item_4' | transloco }}</li>
                  <li>{{ 'about_page.legal.rights.item_5' | transloco }}</li>
                  <li>{{ 'about_page.legal.rights.item_6' | transloco }}</li>
                </ul>
              </div>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.legal.retention.title' | transloco }}
                </h3>
                <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-gray-700">
                  <li>{{ 'about_page.legal.retention.item_1' | transloco }}</li>
                  <li>{{ 'about_page.legal.retention.item_2' | transloco }}</li>
                  <li>{{ 'about_page.legal.retention.item_3' | transloco }}</li>
                </ul>
              </div>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.legal.security.title' | transloco }}
                </h3>
                <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-gray-700">
                  <li>{{ 'about_page.legal.security.item_1' | transloco }}</li>
                  <li>{{ 'about_page.legal.security.item_2' | transloco }}</li>
                  <li>{{ 'about_page.legal.security.item_3' | transloco }}</li>
                </ul>
              </div>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.legal.cookies.title' | transloco }}
                </h3>
                <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-gray-700">
                  <li>{{ 'about_page.legal.cookies.item_1' | transloco }}</li>
                  <li>{{ 'about_page.legal.cookies.item_2' | transloco }}</li>
                </ul>
              </div>
            </article>
          </p-tabpanel>

          <p-tabpanel value="technical">
            <article class="space-y-6 p-2 md:p-4">
              <header>
                <h2 class="text-xl font-semibold text-gray-900">
                  {{ 'about_page.technical.section_title' | transloco }}
                </h2>
                <p class="mt-2 text-sm text-gray-600">
                  {{ 'about_page.technical.section_intro' | transloco }}
                </p>
              </header>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.technical.repo.title' | transloco }}
                </h3>
                <p class="mt-2 text-sm text-gray-700">
                  {{ 'about_page.technical.repo.intro' | transloco }}
                </p>
                <p class="mt-2 text-sm">
                  <a
                    [href]="frontendRepoUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-medium text-indigo-700 hover:underline"
                  >
                    {{ frontendRepoUrl }}
                  </a>
                </p>
              </div>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.technical.backend.title' | transloco }}
                </h3>
                <p class="mt-2 text-sm text-gray-700">
                  {{ 'about_page.technical.backend.intro' | transloco }}
                </p>
                <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-gray-700">
                  <li>Django · Django REST Framework</li>
                  <li>drf-spectacular (OpenAPI)</li>
                  <li>Simple JWT · django-filter · django-parler</li>
                  <li>Celery</li>
                </ul>
              </div>

              <div>
                <h3 class="text-base font-semibold text-gray-900">
                  {{ 'about_page.technical.frontend.title' | transloco }}
                </h3>
                <p class="mt-2 text-sm text-gray-700">
                  {{ 'about_page.technical.frontend.intro' | transloco }}
                </p>
                <ul class="mt-2 list-disc pl-5 text-sm leading-relaxed text-gray-700">
                  <li>Angular 21 · TypeScript 5.9 (strict)</li>
                  <li>PrimeNG 21 · Tailwind 4</li>
                  <li>Transloco 8</li>
                  <li>Vitest 4 · openapi-generator-cli</li>
                </ul>
              </div>
            </article>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </div>
  </div>
</section>
```

### Step 3.6 — Run the spec; confirm it passes

- [ ] Run: `npm test -- src/app/features/about-page/about-page.component.spec.ts`
- Expected: PASS, all 6 tests green.

### Step 3.7 — Wire the route

In `src/app/app.routes.ts`, locate the `PublicLayoutComponent` children block. Add a new route after the `features` route:

Use the Edit tool with this `old_string`:
```ts
      {
        path: 'features',
        loadComponent: () =>
          import('./features/features-page/features-page.component').then(
            (m) => m.FeaturesPageComponent,
          ),
      },
      {
        path: 'contribute',
```

…and this `new_string`:
```ts
      {
        path: 'features',
        loadComponent: () =>
          import('./features/features-page/features-page.component').then(
            (m) => m.FeaturesPageComponent,
          ),
      },
      {
        path: 'about',
        loadComponent: () =>
          import('./features/about-page/about-page.component').then(
            (m) => m.AboutPageComponent,
          ),
      },
      {
        path: 'contribute',
```

### Step 3.8 — Add the About link to the public layout (desktop + mobile)

In `src/app/core/layout/public-layout/public-layout.component.html`:

**Desktop nav** — locate the `<nav>` block (around line 14, after the topbar gradient changes from earlier in this branch). Add an About link **before** the `Contribute` link, but **after** the `Features` link.

Use Edit with `old_string`:
```html
        <a
          [routerLink]="['/features']"
          routerLinkActive="text-white font-semibold"
          class="text-sm font-medium text-slate-200 transition hover:text-white"
        >
          {{ 'public.nav.features' | transloco }}
        </a>
        <a
          [routerLink]="['/contribute']"
          routerLinkActive="text-white font-semibold"
          class="text-sm font-medium text-slate-200 transition hover:text-white"
        >
          {{ 'public.nav.contribute' | transloco }}
        </a>
      </nav>
```

…and `new_string`:
```html
        <a
          [routerLink]="['/features']"
          routerLinkActive="text-white font-semibold"
          class="text-sm font-medium text-slate-200 transition hover:text-white"
        >
          {{ 'public.nav.features' | transloco }}
        </a>
        <a
          [routerLink]="['/about']"
          routerLinkActive="text-white font-semibold"
          class="text-sm font-medium text-slate-200 transition hover:text-white"
        >
          {{ 'public.nav.about' | transloco }}
        </a>
        <a
          [routerLink]="['/contribute']"
          routerLinkActive="text-white font-semibold"
          class="text-sm font-medium text-slate-200 transition hover:text-white"
        >
          {{ 'public.nav.contribute' | transloco }}
        </a>
      </nav>
```

**Mobile dropdown** — same idea, add About between Features and Contribute (note: mobile links use a slightly different class — `text-gray-700` since the dropdown panel itself is white).

Use Edit with `old_string`:
```html
          <a
            [routerLink]="['/features']"
            routerLinkActive="text-indigo-700 font-semibold"
            class="text-sm font-medium text-gray-700"
            (click)="closeMobileMenu()"
          >
            {{ 'public.nav.features' | transloco }}
          </a>
          <a
            [routerLink]="['/contribute']"
            routerLinkActive="text-indigo-700 font-semibold"
            class="text-sm font-medium text-gray-700"
            (click)="closeMobileMenu()"
          >
            {{ 'public.nav.contribute' | transloco }}
          </a>
```

…and `new_string`:
```html
          <a
            [routerLink]="['/features']"
            routerLinkActive="text-indigo-700 font-semibold"
            class="text-sm font-medium text-gray-700"
            (click)="closeMobileMenu()"
          >
            {{ 'public.nav.features' | transloco }}
          </a>
          <a
            [routerLink]="['/about']"
            routerLinkActive="text-indigo-700 font-semibold"
            class="text-sm font-medium text-gray-700"
            (click)="closeMobileMenu()"
          >
            {{ 'public.nav.about' | transloco }}
          </a>
          <a
            [routerLink]="['/contribute']"
            routerLinkActive="text-indigo-700 font-semibold"
            class="text-sm font-medium text-gray-700"
            (click)="closeMobileMenu()"
          >
            {{ 'public.nav.contribute' | transloco }}
          </a>
```

### Step 3.9 — Update the public-layout spec to assert the About link

In `src/app/core/layout/public-layout/public-layout.component.spec.ts`, locate the `nav links use routerLinks…` test (around line 102) and:

Use Edit with `old_string`:
```ts
    it('nav links use routerLinks for /, /features, /contribute (no #-anchors)', () => {
      const html = fixture.nativeElement.innerHTML as string;
      expect(html).toContain('public.nav.home');
      expect(html).toContain('public.nav.features');
      expect(html).toContain('public.nav.contribute');
      // No legacy #-anchors leak
      expect(html).not.toContain('href="#hero"');
      expect(html).not.toContain('href="#features"');
      expect(html).not.toContain('href="#contribute"');
    });
```

…and `new_string`:
```ts
    it('nav links use routerLinks for /, /features, /about, /contribute (no #-anchors)', () => {
      const html = fixture.nativeElement.innerHTML as string;
      expect(html).toContain('public.nav.home');
      expect(html).toContain('public.nav.features');
      expect(html).toContain('public.nav.about');
      expect(html).toContain('public.nav.contribute');
      // No legacy #-anchors leak
      expect(html).not.toContain('href="#hero"');
      expect(html).not.toContain('href="#features"');
      expect(html).not.toContain('href="#contribute"');
    });
```

Also update the footer-minimal test to include `about`:

Use Edit with `old_string`:
```ts
      expect(footerHtml).not.toContain('public.nav.home');
      expect(footerHtml).not.toContain('public.nav.features');
      expect(footerHtml).not.toContain('public.nav.contribute');
```

…and `new_string`:
```ts
      expect(footerHtml).not.toContain('public.nav.home');
      expect(footerHtml).not.toContain('public.nav.features');
      expect(footerHtml).not.toContain('public.nav.about');
      expect(footerHtml).not.toContain('public.nav.contribute');
```

### Step 3.10 — Add `about_page.*` and `public.nav.about` to all 5 catalogs

For each `public/i18n/{fr,nl,en,it,es}.json`:

**a)** Add `"about": "<label>"` inside the existing `"public": { "nav": { … } }` object, after `"features"` and before `"contribute"`.

**b)** Add a top-level `"about_page": { … }` block. Place it after `"contribute_page": { … }` for consistency with the existing alphabetical-ish grouping.

**`fr.json` — values:**
- `public.nav.about` = `"À propos"`
- `about_page` block:

```json
"about_page": {
  "eyebrow": "À propos du projet",
  "title": "Training Manager",
  "lead": "Plateforme de gestion d'équipes, programmes et entraînements pour les coachs : planification, présences, suivi et génération assistée par IA des séances.",
  "view_repo": "Voir le dépôt",
  "legal": {
    "tab": "Mentions légales",
    "section_title": "Mentions légales et protection des données",
    "section_intro": "Training Manager respecte les réglementations européennes en matière de protection des données personnelles.",
    "controller": {
      "title": "Responsable du traitement",
      "item_1": "Le responsable du traitement est l'administrateur de l'instance Training Manager déployée.",
      "item_2": "Pour toute question sur vos données personnelles, contactez l'administrateur de votre instance."
    },
    "collected": {
      "title": "Données collectées",
      "item_1": "Données d'identification : nom d'utilisateur, adresse email, prénom, nom.",
      "item_2": "Données d'activité : équipes, programmes, séances, présences, préférences de langue.",
      "item_3": "Données techniques : journaux de connexion strictement nécessaires à la sécurité."
    },
    "basis": {
      "title": "Base légale et finalités (RGPD art. 6)",
      "item_1": "Exécution d'un contrat : gestion de votre compte, organisation de vos équipes et suivi de vos séances.",
      "item_2": "Intérêt légitime : sécurité de la plateforme, prévention des abus, amélioration du service.",
      "item_3": "Consentement : envoi de notifications optionnelles (révocable à tout moment)."
    },
    "rights": {
      "title": "Vos droits (RGPD art. 15-22)",
      "item_1": "Droit d'accès : obtenir une copie de vos données personnelles.",
      "item_2": "Droit de rectification : corriger des données inexactes ou incomplètes.",
      "item_3": "Droit à l'effacement : demander la suppression de vos données.",
      "item_4": "Droit à la portabilité : recevoir vos données dans un format structuré et lisible.",
      "item_5": "Droit d'opposition : vous opposer au traitement dans certains cas.",
      "item_6": "Droit de réclamation : déposer une plainte auprès de votre autorité de contrôle nationale."
    },
    "retention": {
      "title": "Conservation des données",
      "item_1": "Les données de compte sont conservées pendant la durée de votre inscription.",
      "item_2": "Les données d'équipes et de séances sont conservées tant que l'équipe est active.",
      "item_3": "Lors de la suppression d'un compte, vos données personnelles sont supprimées ou anonymisées sous 30 jours."
    },
    "security": {
      "title": "Sécurité",
      "item_1": "Les communications sont chiffrées via HTTPS/TLS.",
      "item_2": "Les mots de passe sont hachés à l'aide d'un algorithme irréversible (PBKDF2).",
      "item_3": "L'authentification repose sur des jetons JWT à durée de vie courte."
    },
    "cookies": {
      "title": "Cookies",
      "item_1": "Training Manager n'utilise pas de cookies de pistage ni de cookies publicitaires.",
      "item_2": "Seuls les cookies techniques strictement nécessaires (session, préférence de langue) sont utilisés."
    }
  },
  "technical": {
    "tab": "Technique",
    "section_title": "Détails techniques",
    "section_intro": "Le projet est composé d'un frontend Angular et d'un backend Django partageant un contrat OpenAPI.",
    "repo": {
      "title": "Dépôt",
      "intro": "Code source, CI et artefacts de contrat sont hébergés sur GitHub."
    },
    "backend": {
      "title": "Backend",
      "intro": "API REST, règles métier et sécurité applicative."
    },
    "frontend": {
      "title": "Frontend",
      "intro": "Single-page app pour l'administration et l'accès aux séances."
    }
  }
},
```

**`en.json` — values:**
- `public.nav.about` = `"About"`
- `about_page` block:

```json
"about_page": {
  "eyebrow": "About the project",
  "title": "Training Manager",
  "lead": "Team, program and training session management for coaches: scheduling, attendance, tracking, and AI-assisted session generation.",
  "view_repo": "View repository",
  "legal": {
    "tab": "Legal notice",
    "section_title": "Legal notice & data protection",
    "section_intro": "Training Manager complies with European regulations on personal data protection.",
    "controller": {
      "title": "Data controller",
      "item_1": "The data controller is the administrator of the deployed Training Manager instance.",
      "item_2": "For any question regarding your personal data, contact the administrator of your instance."
    },
    "collected": {
      "title": "Data collected",
      "item_1": "Identification data: username, email address, first name, last name.",
      "item_2": "Activity data: teams, programs, sessions, attendance, language preferences.",
      "item_3": "Technical data: connection logs strictly necessary for security."
    },
    "basis": {
      "title": "Legal basis and purposes (GDPR Art. 6)",
      "item_1": "Performance of a contract: managing your account, organizing your teams and tracking your sessions.",
      "item_2": "Legitimate interest: platform security, abuse prevention, service improvement.",
      "item_3": "Consent: sending optional notifications (revocable at any time)."
    },
    "rights": {
      "title": "Your rights (GDPR Art. 15-22)",
      "item_1": "Right of access: obtain a copy of your personal data.",
      "item_2": "Right to rectification: correct inaccurate or incomplete data.",
      "item_3": "Right to erasure: request the deletion of your data.",
      "item_4": "Right to data portability: receive your data in a structured, readable format.",
      "item_5": "Right to object: object to processing in certain cases.",
      "item_6": "Right to lodge a complaint: file a complaint with your national supervisory authority."
    },
    "retention": {
      "title": "Data retention",
      "item_1": "Account data is retained for the duration of your registration.",
      "item_2": "Team and session data is retained as long as the team is active.",
      "item_3": "Upon account deletion, your personal data is deleted or anonymized within 30 days."
    },
    "security": {
      "title": "Security",
      "item_1": "Communications are encrypted via HTTPS/TLS.",
      "item_2": "Passwords are hashed using an irreversible algorithm (PBKDF2).",
      "item_3": "Authentication relies on short-lived JWT tokens."
    },
    "cookies": {
      "title": "Cookies",
      "item_1": "Training Manager does not use tracking cookies or advertising cookies.",
      "item_2": "Only strictly necessary technical cookies (session, language preference) are used."
    }
  },
  "technical": {
    "tab": "Technical",
    "section_title": "Technical details",
    "section_intro": "The project consists of an Angular frontend and a Django backend sharing an OpenAPI contract.",
    "repo": {
      "title": "Repository",
      "intro": "Source code, CI and contract artifacts are hosted on GitHub."
    },
    "backend": {
      "title": "Backend",
      "intro": "REST API, business rules and application security."
    },
    "frontend": {
      "title": "Frontend",
      "intro": "Single-page app for administration and session access."
    }
  }
},
```

**`nl.json` — values:**
- `public.nav.about` = `"Over"`
- `about_page` block:

```json
"about_page": {
  "eyebrow": "Over het project",
  "title": "Training Manager",
  "lead": "Beheer van teams, programma's en trainingen voor coaches: planning, aanwezigheden, opvolging en AI-ondersteunde sessieaanmaak.",
  "view_repo": "Repository bekijken",
  "legal": {
    "tab": "Juridische vermeldingen",
    "section_title": "Juridische vermeldingen en gegevensbescherming",
    "section_intro": "Training Manager voldoet aan de Europese regelgeving inzake bescherming van persoonsgegevens.",
    "controller": {
      "title": "Verwerkingsverantwoordelijke",
      "item_1": "De verwerkingsverantwoordelijke is de beheerder van de ingezette Training Manager-instantie.",
      "item_2": "Voor vragen over je persoonsgegevens, neem contact op met de beheerder van je instantie."
    },
    "collected": {
      "title": "Verzamelde gegevens",
      "item_1": "Identificatiegegevens: gebruikersnaam, e-mailadres, voornaam, achternaam.",
      "item_2": "Activiteitsgegevens: teams, programma's, sessies, aanwezigheden, taalvoorkeuren.",
      "item_3": "Technische gegevens: verbindingslogs die strikt noodzakelijk zijn voor de beveiliging."
    },
    "basis": {
      "title": "Rechtsgrond en doeleinden (AVG art. 6)",
      "item_1": "Uitvoering van een overeenkomst: beheer van je account, organisatie van je teams en opvolging van je sessies.",
      "item_2": "Gerechtvaardigd belang: beveiliging van het platform, misbruikpreventie, verbetering van de dienst.",
      "item_3": "Toestemming: verzenden van optionele meldingen (op elk moment intrekbaar)."
    },
    "rights": {
      "title": "Je rechten (AVG art. 15-22)",
      "item_1": "Recht op inzage: een kopie van je persoonsgegevens verkrijgen.",
      "item_2": "Recht op rectificatie: onjuiste of onvolledige gegevens corrigeren.",
      "item_3": "Recht op wissing: verzoeken om verwijdering van je gegevens.",
      "item_4": "Recht op gegevensoverdraagbaarheid: je gegevens ontvangen in een gestructureerd, leesbaar formaat.",
      "item_5": "Recht van bezwaar: bezwaar maken tegen verwerking in bepaalde gevallen.",
      "item_6": "Recht om een klacht in te dienen: een klacht indienen bij je nationale toezichthoudende autoriteit."
    },
    "retention": {
      "title": "Bewaring van gegevens",
      "item_1": "Accountgegevens worden bewaard voor de duur van je inschrijving.",
      "item_2": "Team- en sessiegegevens worden bewaard zolang het team actief is.",
      "item_3": "Bij verwijdering van een account worden je persoonsgegevens binnen 30 dagen verwijderd of geanonimiseerd."
    },
    "security": {
      "title": "Beveiliging",
      "item_1": "Communicatie is versleuteld via HTTPS/TLS.",
      "item_2": "Wachtwoorden worden gehasht met een onomkeerbaar algoritme (PBKDF2).",
      "item_3": "Authenticatie is gebaseerd op kortlevende JWT-tokens."
    },
    "cookies": {
      "title": "Cookies",
      "item_1": "Training Manager gebruikt geen tracking- of advertentiecookies.",
      "item_2": "Alleen strikt noodzakelijke technische cookies (sessie, taalvoorkeur) worden gebruikt."
    }
  },
  "technical": {
    "tab": "Technisch",
    "section_title": "Technische details",
    "section_intro": "Het project bestaat uit een Angular-frontend en een Django-backend die een OpenAPI-contract delen.",
    "repo": {
      "title": "Repository",
      "intro": "Broncode, CI en contractartefacten worden gehost op GitHub."
    },
    "backend": {
      "title": "Backend",
      "intro": "REST-API, businessregels en applicatiebeveiliging."
    },
    "frontend": {
      "title": "Frontend",
      "intro": "Single-page app voor administratie en toegang tot sessies."
    }
  }
},
```

**`it.json` — values:**
- `public.nav.about` = `"Informazioni"`
- `about_page` block:

```json
"about_page": {
  "eyebrow": "Informazioni sul progetto",
  "title": "Training Manager",
  "lead": "Gestione di squadre, programmi e sessioni di allenamento per coach: pianificazione, presenze, monitoraggio e generazione assistita da IA delle sessioni.",
  "view_repo": "Vedi il repository",
  "legal": {
    "tab": "Note legali",
    "section_title": "Note legali e protezione dei dati",
    "section_intro": "Training Manager rispetta le normative europee in materia di protezione dei dati personali.",
    "controller": {
      "title": "Titolare del trattamento",
      "item_1": "Il titolare del trattamento è l'amministratore dell'istanza Training Manager distribuita.",
      "item_2": "Per qualsiasi domanda sui tuoi dati personali, contatta l'amministratore della tua istanza."
    },
    "collected": {
      "title": "Dati raccolti",
      "item_1": "Dati di identificazione: nome utente, indirizzo email, nome, cognome.",
      "item_2": "Dati di attività: squadre, programmi, sessioni, presenze, preferenze di lingua.",
      "item_3": "Dati tecnici: log di connessione strettamente necessari per la sicurezza."
    },
    "basis": {
      "title": "Base giuridica e finalità (GDPR art. 6)",
      "item_1": "Esecuzione di un contratto: gestione del tuo account, organizzazione delle squadre e monitoraggio delle sessioni.",
      "item_2": "Interesse legittimo: sicurezza della piattaforma, prevenzione degli abusi, miglioramento del servizio.",
      "item_3": "Consenso: invio di notifiche opzionali (revocabile in qualsiasi momento)."
    },
    "rights": {
      "title": "I tuoi diritti (GDPR art. 15-22)",
      "item_1": "Diritto di accesso: ottenere una copia dei tuoi dati personali.",
      "item_2": "Diritto di rettifica: correggere dati inesatti o incompleti.",
      "item_3": "Diritto alla cancellazione: richiedere la cancellazione dei tuoi dati.",
      "item_4": "Diritto alla portabilità: ricevere i tuoi dati in un formato strutturato e leggibile.",
      "item_5": "Diritto di opposizione: opporti al trattamento in determinati casi.",
      "item_6": "Diritto di reclamo: presentare un reclamo all'autorità di controllo nazionale."
    },
    "retention": {
      "title": "Conservazione dei dati",
      "item_1": "I dati dell'account sono conservati per la durata della tua iscrizione.",
      "item_2": "I dati di squadre e sessioni sono conservati finché la squadra è attiva.",
      "item_3": "Alla cancellazione di un account, i tuoi dati personali vengono eliminati o anonimizzati entro 30 giorni."
    },
    "security": {
      "title": "Sicurezza",
      "item_1": "Le comunicazioni sono cifrate tramite HTTPS/TLS.",
      "item_2": "Le password sono sottoposte a hashing con un algoritmo irreversibile (PBKDF2).",
      "item_3": "L'autenticazione si basa su token JWT a breve durata."
    },
    "cookies": {
      "title": "Cookie",
      "item_1": "Training Manager non utilizza cookie di tracciamento o pubblicitari.",
      "item_2": "Vengono utilizzati solo cookie tecnici strettamente necessari (sessione, preferenza di lingua)."
    }
  },
  "technical": {
    "tab": "Tecnico",
    "section_title": "Dettagli tecnici",
    "section_intro": "Il progetto è composto da un frontend Angular e un backend Django che condividono un contratto OpenAPI.",
    "repo": {
      "title": "Repository",
      "intro": "Codice sorgente, CI e artefatti del contratto sono ospitati su GitHub."
    },
    "backend": {
      "title": "Backend",
      "intro": "API REST, regole di business e sicurezza applicativa."
    },
    "frontend": {
      "title": "Frontend",
      "intro": "Single-page app per l'amministrazione e l'accesso alle sessioni."
    }
  }
},
```

**`es.json` — values:**
- `public.nav.about` = `"Acerca de"`
- `about_page` block:

```json
"about_page": {
  "eyebrow": "Acerca del proyecto",
  "title": "Training Manager",
  "lead": "Gestión de equipos, programas y sesiones de entrenamiento para coaches: planificación, asistencias, seguimiento y generación de sesiones asistida por IA.",
  "view_repo": "Ver el repositorio",
  "legal": {
    "tab": "Aviso legal",
    "section_title": "Aviso legal y protección de datos",
    "section_intro": "Training Manager cumple con las normativas europeas en materia de protección de datos personales.",
    "controller": {
      "title": "Responsable del tratamiento",
      "item_1": "El responsable del tratamiento es el administrador de la instancia desplegada de Training Manager.",
      "item_2": "Para cualquier consulta sobre tus datos personales, ponte en contacto con el administrador de tu instancia."
    },
    "collected": {
      "title": "Datos recopilados",
      "item_1": "Datos de identificación: nombre de usuario, dirección de correo electrónico, nombre, apellidos.",
      "item_2": "Datos de actividad: equipos, programas, sesiones, asistencias, preferencias de idioma.",
      "item_3": "Datos técnicos: registros de conexión estrictamente necesarios para la seguridad."
    },
    "basis": {
      "title": "Base legal y finalidades (RGPD art. 6)",
      "item_1": "Ejecución de un contrato: gestión de tu cuenta, organización de tus equipos y seguimiento de tus sesiones.",
      "item_2": "Interés legítimo: seguridad de la plataforma, prevención de abusos, mejora del servicio.",
      "item_3": "Consentimiento: envío de notificaciones opcionales (revocable en cualquier momento)."
    },
    "rights": {
      "title": "Tus derechos (RGPD art. 15-22)",
      "item_1": "Derecho de acceso: obtener una copia de tus datos personales.",
      "item_2": "Derecho de rectificación: corregir datos inexactos o incompletos.",
      "item_3": "Derecho de supresión: solicitar la eliminación de tus datos.",
      "item_4": "Derecho a la portabilidad: recibir tus datos en un formato estructurado y legible.",
      "item_5": "Derecho de oposición: oponerte al tratamiento en determinados casos.",
      "item_6": "Derecho de reclamación: presentar una reclamación ante tu autoridad de control nacional."
    },
    "retention": {
      "title": "Conservación de datos",
      "item_1": "Los datos de cuenta se conservan durante la duración de tu inscripción.",
      "item_2": "Los datos de equipos y sesiones se conservan mientras el equipo esté activo.",
      "item_3": "Al eliminar una cuenta, tus datos personales se eliminan o anonimizan en un plazo de 30 días."
    },
    "security": {
      "title": "Seguridad",
      "item_1": "Las comunicaciones están cifradas mediante HTTPS/TLS.",
      "item_2": "Las contraseñas se cifran con un algoritmo irreversible (PBKDF2).",
      "item_3": "La autenticación se basa en tokens JWT de corta duración."
    },
    "cookies": {
      "title": "Cookies",
      "item_1": "Training Manager no utiliza cookies de seguimiento ni publicitarias.",
      "item_2": "Solo se utilizan cookies técnicas estrictamente necesarias (sesión, preferencia de idioma)."
    }
  },
  "technical": {
    "tab": "Técnico",
    "section_title": "Detalles técnicos",
    "section_intro": "El proyecto consta de un frontend Angular y un backend Django que comparten un contrato OpenAPI.",
    "repo": {
      "title": "Repositorio",
      "intro": "Código fuente, CI y artefactos del contrato se alojan en GitHub."
    },
    "backend": {
      "title": "Backend",
      "intro": "API REST, reglas de negocio y seguridad de la aplicación."
    },
    "frontend": {
      "title": "Frontend",
      "intro": "Single-page app para la administración y el acceso a las sesiones."
    }
  }
},
```

### Step 3.11 — Run the public-layout spec; confirm it passes

- [ ] Run: `npm test -- src/app/core/layout/public-layout/public-layout.component.spec.ts`
- Expected: PASS, all 5 tests green.

### Step 3.12 — Commit

- [ ] Run:

```bash
git add src/app/features/about-page src/app/app.routes.ts src/app/core/layout/public-layout public/i18n
git commit -m "feat(about): new /about page with Legal + Technical tabs

Adds AboutPageComponent (hero + p-tabs with 2 panels), wires the route
under PublicLayoutComponent, and exposes an About link in the public nav
(desktop + mobile). Seeds about_page.* and public.nav.about across the
5 locales.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Final verification

**Goal:** Ensure all tests pass, the production build is under budget, and a manual smoke matches the references.

### Step 4.1 — Run the full test suite

- [ ] Run: `npm test -- --run`
- Expected: PASS, no regressions.

If any unrelated suite fails, read the failure carefully — the only files this branch touched are listed in the file map. A failure outside that scope likely points to a stale test in another file you haven't touched; leave it alone unless directly related.

### Step 4.2 — Build for production

- [ ] Run: `npm run build`
- Expected: SUCCESS, initial-bundle within the 1 MB warning / 1.5 MB error budget configured in `angular.json`. Note any size delta from before the branch (the new `<p-tabs>` are already in other features, so net cost should be the new About template only — a few kB).

If the warning threshold is crossed, check whether the new About template imports something heavy by mistake (e.g., a chart library). It shouldn't.

### Step 4.3 — Manual smoke test

- [ ] Run: `npm start`
- [ ] Visit `http://localhost:4200/`. Verify:
  - The dark gradient topbar still has the new globe-trigger language switcher (round white/10 button, "🌐 FR ▾").
  - Click the language button — a white dropdown opens listing FR/NL/EN/IT/ES with the FR row highlighted indigo and a checkmark.
  - Click outside — the dropdown closes.
  - Press `Esc` while open — the dropdown closes.
  - Pick another language — interface translates instantly; toast shows on failure (cannot test failure locally without forcing 500).
- [ ] Visit `/contribute`. Verify:
  - Eyebrow uppercase rose, big title, intro lead.
  - 4 reason cards (sky/emerald/amber/rose icon pills).
  - Centered card with the rose-pink gradient CTA "Soutenir sur GitHub Sponsors", new tab on click.
  - "Merci !" section at the bottom.
  - No more repo or issues links.
- [ ] Visit `/about`. Verify:
  - Hero with eyebrow indigo + title "Training Manager" + lead + outline button "Voir le dépôt".
  - Card with 2 tabs: "Mentions légales" (active) and "Technique".
  - Legal tab shows 7 sub-headings (Responsable / Données collectées / Base légale / Vos droits / Conservation / Sécurité / Cookies), each with bullets.
  - Switch to Technique tab: 3 sub-sections (Dépôt with link / Backend with stack list / Frontend with stack list).
  - About link is visible in the desktop topbar between "Fonctionnalités" and "Contribuer".
  - On mobile width (resize browser to <768px), the burger menu lists Home / Features / About / Contribute.

### Step 4.4 — End

If anything looks off in the smoke test, open a follow-up task — do not silently patch in this PR.

---

## Self-review checklist (run AFTER writing the plan, before handing off)

- **Spec coverage:**
  - `/contribute` revamp → Task 2 ✓
  - `/about` page (hero + 2 tabs without Features) → Task 3 ✓
  - Lang switcher (globe + code, popup with native names + check) → Task 1 ✓
  - About link in PublicLayout (desktop + mobile) → Task 3.8 ✓
  - i18n in 5 locales for everything → Steps 1.5, 2.4, 3.10 ✓
  - Tests for each component + public-layout assertion → Steps 1.1, 2.1, 3.1, 3.9 ✓
  - Manual visual check vs. references → Step 4.3 ✓
- **Placeholder scan:** none.
- **Type consistency:**
  - `LanguageSwitcherComponent` exposes `open()` / `toggle()` / `close()` / `select(code)` / `current()` / `languages` — same identifiers in spec, component, and template. ✓
  - `AboutPageComponent` exposes `frontendRepoUrl: string` and `activeTab: WritableSignal<'legal'|'technical'>` — used consistently in template. ✓
  - `ContributePageComponent` keeps only `sponsorsUrl: string` — referenced once in the template. ✓
- **i18n key consistency:**
  - All keys in templates (`contribute_page.eyebrow`, `contribute_page.reasons.*`, `contribute_page.donate.*`, `contribute_page.thanks.*`, `about_page.*`, `common.language_switcher.aria`, `public.nav.about`) appear in all 5 locale Edit blocks. ✓
- **Commits:** 4 (lang switcher → contribute → about → none for Task 4 unless adjustments are needed).
