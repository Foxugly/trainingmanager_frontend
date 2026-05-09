# Public navigation revamp v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `app-topmenu` + `app-footer` components, ship `shared/contact.ts` anti-spam util, refactor language switcher, and revamp `/contribute` + create `/about` (3 tabs incl. Company) — all aligned with the QuizOnline-style conventions adopted on 2026-05-09.

**Architecture:** Six implementation steps + verification, each shipping its own commit. The flow is bottom-up: util → leaf component (footer) → shell component (topmenu) → embedded component (lang switcher) → consumer pages (contribute, about). Each later step consumes earlier ones; no cyclic dependencies.

**Tech Stack:** Angular 21 (standalone, signals, `inject()`, `input()`/`output()`), PrimeNG 21 (`Tabs`, `Button`), Tailwind 4 (utilities for layout), Vitest 4 (specs mirror existing patterns: TestBed + `nativeElement.innerHTML` assertions or signal-state checks), TypeScript 5.9 strict.

**Spec:** `docs/superpowers/specs/2026-05-09-public-nav-revamp-v2.md` (commit `4fb7000`).

**Supersedes:** v1 plan `2026-05-09-public-nav-revamp.md` (never executed).

---

## File map

### Created
- `src/app/shared/contact.ts`
- `src/app/shared/contact.spec.ts`
- `src/app/shared/app-version.ts`
- `src/app/core/layout/footer/footer.component.{ts,html,scss,spec.ts}`
- `src/app/core/layout/topmenu/topmenu.component.{ts,html,scss,spec.ts}`
- `src/app/features/contribute-page/contribute-page.text.ts`
- `src/app/features/about-page/about-page.component.{ts,html,scss,spec.ts}`
- `src/app/features/about-page/about-page.text.ts`

### Modified
- `src/app/core/i18n/language-switcher/language-switcher.component.{ts,html,scss,spec.ts}` — full rewrite (compact globe trigger).
- `src/app/features/contribute-page/contribute-page.component.{ts,html,spec.ts}` — full rewrite (no hero, sections, ui()-i18n).
- `src/app/core/layout/main-layout/main-layout.component.{html,spec.ts}` — collapse to `<app-topmenu mode="authenticated">` + `<router-outlet>` + `<p-toast>`.
- `src/app/core/layout/public-layout/public-layout.component.{ts,html,spec.ts}` — collapse to `<app-topmenu mode="public">` + `<router-outlet>` + `<app-footer>`. Remove `mobileMenuOpen` signal (moved to topmenu).
- `src/app/app.routes.ts` — add `/about` route.
- `public/i18n/fr.json`, `nl.json`, `en.json`, `it.json`, `es.json` — add `common.language_switcher.aria` and `public.nav.about` and `topmenu.open`/`topmenu.close` and `footer.author`/`footer.version_label`/`app.tagline`. Remove `contribute_page.*` block.

---

## Task 1 — `shared/contact.ts` anti-spam util

**Files:**
- Create: `src/app/shared/contact.ts`
- Create: `src/app/shared/contact.spec.ts`

### Step 1.1 — Write the spec

Create `src/app/shared/contact.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMAIL_USER,
  EMAIL_HOST,
  EMAIL_TLD,
  PHONE_COUNTRY,
  PHONE_PARTS,
  WEBSITE_URL,
  WEBSITE_DISPLAY,
  emailDisplay,
  phoneDisplay,
  openContactEmail,
} from './contact';

describe('contact util', () => {
  it('exposes the email parts as separate constants (no full email string at rest)', () => {
    expect(EMAIL_USER).toBe('rvilain');
    expect(EMAIL_HOST).toBe('foxugly');
    expect(EMAIL_TLD).toBe('com');
  });

  it('exposes phone country + parts and website constants', () => {
    expect(PHONE_COUNTRY).toBe('+32');
    expect(PHONE_PARTS).toEqual(['478', '811988']);
    expect(WEBSITE_URL).toBe('https://www.foxugly.com');
    expect(WEBSITE_DISPLAY).toBe('www.foxugly.com');
  });

  it('emailDisplay() obfuscates the @ and . to defeat naive crawlers', () => {
    const out = emailDisplay();
    expect(out).toBe('rvilain [at] foxugly [dot] com');
    expect(out).not.toContain('@');
    expect(out).not.toMatch(/rvilain\.foxugly/);
  });

  it('phoneDisplay() returns parts joined by spaces with country prefix', () => {
    expect(phoneDisplay()).toBe('+32 478 811988');
  });

  describe('openContactEmail()', () => {
    let originalLocation: Location;
    let assignSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      originalLocation = window.location;
      assignSpy = vi.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, set href(v: string) { assignSpy(v); } },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    });

    it('builds a mailto: URL with the reconstructed address and url-encoded subject', () => {
      openContactEmail('Training Manager');
      expect(assignSpy).toHaveBeenCalledTimes(1);
      const url = assignSpy.mock.calls[0][0] as string;
      expect(url).toMatch(/^mailto:rvilain@foxugly\.com\?/);
      expect(url).toContain('subject=Training+Manager');
    });

    it('encodes special characters in the subject', () => {
      openContactEmail('Help! ñ & symbols');
      const url = assignSpy.mock.calls[0][0] as string;
      expect(url).toContain('subject=Help%21+%C3%B1+%26+symbols');
    });
  });
});
```

- [ ] **Step 1.1.1 — Run the spec to confirm it fails**

Run: `npm test -- src/app/shared/contact.spec.ts`
Expected: FAIL — module `'./contact'` does not exist.

### Step 1.2 — Implement the util

Create `src/app/shared/contact.ts`:

```ts
export const EMAIL_USER = 'rvilain';
export const EMAIL_HOST = 'foxugly';
export const EMAIL_TLD = 'com';

export const PHONE_COUNTRY = '+32';
export const PHONE_PARTS = ['478', '811988'] as const;

export const WEBSITE_URL = 'https://www.foxugly.com';
export const WEBSITE_DISPLAY = 'www.foxugly.com';

export function emailDisplay(): string {
  return `${EMAIL_USER} [at] ${EMAIL_HOST} [dot] ${EMAIL_TLD}`;
}

export function phoneDisplay(): string {
  return `${PHONE_COUNTRY} ${PHONE_PARTS.join(' ')}`;
}

export function openContactEmail(subject: string): void {
  const address = `${EMAIL_USER}@${EMAIL_HOST}.${EMAIL_TLD}`;
  const params = new URLSearchParams({ subject });
  window.location.href = `mailto:${address}?${params.toString()}`;
}
```

- [ ] **Step 1.3 — Run the spec; confirm it passes**

Run: `npm test -- src/app/shared/contact.spec.ts`
Expected: PASS, 5 tests green.

- [ ] **Step 1.4 — Commit**

```bash
git add src/app/shared/contact.ts src/app/shared/contact.spec.ts
git commit -m "feat(shared): anti-spam contact util (email/phone/website + mailto launcher)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — `app-footer` component

**Files:**
- Create: `src/app/shared/app-version.ts`
- Create: `src/app/core/layout/footer/footer.component.ts`
- Create: `src/app/core/layout/footer/footer.component.html`
- Create: `src/app/core/layout/footer/footer.component.scss`
- Create: `src/app/core/layout/footer/footer.component.spec.ts`
- Modify: `public/i18n/{fr,nl,en,it,es}.json` — add `app.tagline`, `footer.author`, `footer.version_label`.

### Step 2.1 — Create the version constant

Create `src/app/shared/app-version.ts`:

```ts
export const APP_VERSION = '0.1.0';
```

### Step 2.2 — Add the i18n keys

For each catalog `public/i18n/{fr,nl,en,it,es}.json`:

**a)** Inside the existing `"app"` object (it already has `"title"` etc.), add `"tagline"`.
**b)** Add a new top-level `"footer"` object with `"author"` and `"version_label"`.

`fr.json` — add inside `"app"`:
```json
"tagline": "Gestion d'équipes, programmes et entraînements pour coachs."
```
`fr.json` — add as a new top-level block (place it next to `"public": { … }`):
```json
"footer": {
  "author": "Foxugly",
  "version_label": "Version"
},
```

`en.json`:
- `app.tagline` = `"Team, program and training session management for coaches."`
- `footer.author` = `"Foxugly"`, `footer.version_label` = `"Version"`

`nl.json`:
- `app.tagline` = `"Beheer van teams, programma's en trainingen voor coaches."`
- `footer.author` = `"Foxugly"`, `footer.version_label` = `"Versie"`

`it.json`:
- `app.tagline` = `"Gestione di squadre, programmi e sessioni di allenamento per coach."`
- `footer.author` = `"Foxugly"`, `footer.version_label` = `"Versione"`

`es.json`:
- `app.tagline` = `"Gestión de equipos, programas y sesiones de entrenamiento para coaches."`
- `footer.author` = `"Foxugly"`, `footer.version_label` = `"Versión"`

### Step 2.3 — Write the component spec (TDD)

Create `src/app/core/layout/footer/footer.component.spec.ts`:

```ts
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
    expect(text).toContain('0.1.0');
  });

  it('renders 4 separator dots between the 5 segments', () => {
    const seps = fixture.nativeElement.querySelectorAll('.footer-sep');
    expect(seps.length).toBe(4);
  });
});
```

- [ ] **Step 2.3.1 — Run; confirm failure**

Run: `npm test -- src/app/core/layout/footer/footer.component.spec.ts`
Expected: FAIL — `FooterComponent` doesn't exist.

### Step 2.4 — Implement the component

Create `src/app/core/layout/footer/footer.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { APP_VERSION } from '../../../shared/app-version';

@Component({
  selector: 'app-footer',
  imports: [TranslocoPipe],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  protected readonly version = APP_VERSION;
  protected readonly year = new Date().getFullYear();
}
```

Create `src/app/core/layout/footer/footer.component.html`:

```html
<footer class="footer">
  <div class="footer-inner">
    <span class="footer-brand">{{ 'app.title' | transloco }}</span>
    <span class="footer-sep">·</span>
    <span class="footer-tagline">{{ 'app.tagline' | transloco }}</span>
    <span class="footer-fill"></span>
    <span class="footer-meta">{{ 'footer.version_label' | transloco }}&nbsp;{{ version }}</span>
    <span class="footer-sep">·</span>
    <span class="footer-meta">{{ 'footer.author' | transloco }}</span>
    <span class="footer-sep">·</span>
    <span class="footer-meta">© {{ year }}</span>
  </div>
</footer>
```

Note: 4 separator spans (the 5 segments are: brand / tagline / [fill] / version / author / year — between which 4 dots sit).

Create `src/app/core/layout/footer/footer.component.scss`:

```scss
:host {
  display: block;
}

.footer {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
}

.footer-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  max-width: 80rem;
  margin: 0 auto;
}

.footer-brand {
  font-weight: 600;
  color: #0f172a;
}

.footer-tagline {
  color: #475569;
}

.footer-meta {
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.footer-sep {
  color: #cbd5e1;
  user-select: none;
}

.footer-fill {
  flex: 1 1 auto;
}
```

### Step 2.5 — Run; confirm pass

- [ ] Run: `npm test -- src/app/core/layout/footer/footer.component.spec.ts`
- Expected: PASS, 4 tests green.

### Step 2.6 — Commit

```bash
git add src/app/shared/app-version.ts src/app/core/layout/footer public/i18n
git commit -m "feat(layout): app-footer component (~35px single line, neutral palette)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — `app-topmenu` component

**Goal:** Extract the inline header from both layouts into a reusable `app-topmenu` with `mode` input and ≤960px hamburger drawer.

**Files:**
- Create: `src/app/core/layout/topmenu/topmenu.component.{ts,html,scss,spec.ts}`
- Modify: `src/app/core/layout/main-layout/main-layout.component.html` — collapse to `<app-topmenu mode="authenticated">` + `<main>` + `<p-toast>`.
- Modify: `src/app/core/layout/main-layout/main-layout.component.ts` — drop unused imports (RouterLinkActive, etc.), keep `RouterOutlet`, `Toast`, `TopmenuComponent`.
- Modify: `src/app/core/layout/public-layout/public-layout.component.html` — collapse to `<app-topmenu mode="public">` + `<main>` + `<app-footer>`.
- Modify: `src/app/core/layout/public-layout/public-layout.component.ts` — drop `mobileMenuOpen`, drop unused imports.
- Modify: `src/app/core/layout/public-layout/public-layout.component.spec.ts` — simplify (the inline-header tests move to topmenu spec).
- Modify: `public/i18n/{fr,nl,en,it,es}.json` — add `topmenu.open`/`topmenu.close` keys.

### Step 3.1 — Add i18n keys

In each `public/i18n/{fr,nl,en,it,es}.json`, add a top-level `"topmenu"` block:

`fr.json`:
```json
"topmenu": {
  "open": "Ouvrir le menu",
  "close": "Fermer le menu"
},
```

`en.json`: `"open": "Open menu"`, `"close": "Close menu"`.
`nl.json`: `"open": "Menu openen"`, `"close": "Menu sluiten"`.
`it.json`: `"open": "Apri menu"`, `"close": "Chiudi menu"`.
`es.json`: `"open": "Abrir menú"`, `"close": "Cerrar menú"`.

### Step 3.2 — Write the topmenu spec (TDD)

Create `src/app/core/layout/topmenu/topmenu.component.spec.ts`:

```ts
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, NavigationEnd, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Me } from '../../../api/model/me';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../i18n/language.service';
import { TopmenuComponent } from './topmenu.component';

interface ProtectedFields {
  mobileMenuOpen(): boolean;
  toggleMobile(): void;
  closeMobile(): void;
  onDocumentClick(event: MouseEvent): void;
}

const baseUser: Me = {
  id: 1, username: 'coach', first_name: 'R', last_name: 'V',
  email: 'r@example.com', language: 'fr', is_staff: false,
} as unknown as Me;

const staffUser: Me = { ...baseUser, is_staff: true } as Me;

describe('TopmenuComponent', () => {
  let fixture: ComponentFixture<TopmenuComponent>;
  let userSig: ReturnType<typeof signal<Me | null>>;
  let routerEvents: Subject<unknown>;
  const access = (c: TopmenuComponent) => c as unknown as ProtectedFields;

  async function setup(opts: {
    mode?: 'public' | 'authenticated';
    user?: Me | null;
  } = {}) {
    TestBed.resetTestingModule();
    userSig = signal<Me | null>(opts.user ?? null);
    routerEvents = new Subject<unknown>();

    await TestBed.configureTestingModule({
      imports: [
        TopmenuComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly(), logout: () => undefined } },
        { provide: LanguageService, useValue: { activeLang: signal('fr').asReadonly(), switchLanguage: () => ({ subscribe: () => undefined }) } },
        { provide: Router, useValue: { events: routerEvents.asObservable() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TopmenuComponent);
    fixture.componentRef.setInput('mode', opts.mode ?? 'public');
    fixture.detectChanges();
    return fixture;
  }

  it('public mode renders the 4 public nav keys', async () => {
    await setup({ mode: 'public' });
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('public.nav.home');
    expect(html).toContain('public.nav.features');
    expect(html).toContain('public.nav.about');
    expect(html).toContain('public.nav.contribute');
    expect(html).not.toContain('nav.dashboard');
  });

  it('authenticated mode renders the app nav keys', async () => {
    await setup({ mode: 'authenticated', user: baseUser });
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('nav.dashboard');
    expect(html).toContain('nav.teams');
    expect(html).toContain('nav.programs');
    expect(html).toContain('nav.calendar');
    expect(html).not.toContain('public.nav.contribute');
  });

  it('authenticated mode shows Admin link only to staff', async () => {
    await setup({ mode: 'authenticated', user: baseUser });
    expect(fixture.nativeElement.innerHTML).not.toContain('nav.admin');

    await setup({ mode: 'authenticated', user: staffUser });
    expect(fixture.nativeElement.innerHTML).toContain('nav.admin');
  });

  it('mobile menu starts closed; toggle/close mutate the signal', async () => {
    await setup();
    expect(access(fixture.componentInstance).mobileMenuOpen()).toBe(false);
    access(fixture.componentInstance).toggleMobile();
    expect(access(fixture.componentInstance).mobileMenuOpen()).toBe(true);
    access(fixture.componentInstance).closeMobile();
    expect(access(fixture.componentInstance).mobileMenuOpen()).toBe(false);
  });

  it('clicks outside the host close the mobile menu', async () => {
    await setup();
    const c = access(fixture.componentInstance);
    c.toggleMobile();
    expect(c.mobileMenuOpen()).toBe(true);

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    c.onDocumentClick({ target: outside } as unknown as MouseEvent);
    expect(c.mobileMenuOpen()).toBe(false);

    outside.remove();
  });

  it('clicks inside the host do NOT close the mobile menu', async () => {
    await setup();
    const c = access(fixture.componentInstance);
    c.toggleMobile();
    const inside = fixture.nativeElement.querySelector('button')!;
    c.onDocumentClick({ target: inside } as unknown as MouseEvent);
    expect(c.mobileMenuOpen()).toBe(true);
  });

  it('closes the mobile menu on Router NavigationEnd', async () => {
    await setup();
    const c = access(fixture.componentInstance);
    c.toggleMobile();
    expect(c.mobileMenuOpen()).toBe(true);

    routerEvents.next(new NavigationEnd(1, '/foo', '/foo'));
    expect(c.mobileMenuOpen()).toBe(false);
  });
});
```

- [ ] **Step 3.2.1 — Run the spec; confirm failure**

Run: `npm test -- src/app/core/layout/topmenu/topmenu.component.spec.ts`
Expected: FAIL — `TopmenuComponent` doesn't exist.

### Step 3.3 — Create the component class

Create `src/app/core/layout/topmenu/topmenu.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher/language-switcher.component';
import { UserMenuComponent } from '../../../shared/ui/user-menu/user-menu.component';

export type TopmenuMode = 'public' | 'authenticated';

@Component({
  selector: 'app-topmenu',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, LanguageSwitcherComponent, UserMenuComponent],
  templateUrl: './topmenu.component.html',
  styleUrl: './topmenu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeMobile()',
  },
})
export class TopmenuComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = input<TopmenuMode>('public');
  protected readonly isStaff = computed(() => this.authService.currentUser()?.is_staff === true);
  protected readonly mobileMenuOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.closeMobile());
  }

  protected toggleMobile(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  protected closeMobile(): void {
    this.mobileMenuOpen.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.mobileMenuOpen()) return;
    const root = this.elementRef.nativeElement;
    if (!root.contains(event.target as Node)) {
      this.closeMobile();
    }
  }
}
```

### Step 3.4 — Create the template

Create `src/app/core/layout/topmenu/topmenu.component.html`:

```html
<header class="topbar">
  <a [routerLink]="['/']" class="brand" (click)="closeMobile()">
    <span class="brand-mark" aria-hidden="true">
      <i class="pi pi-bolt"></i>
    </span>
    <span class="brand-label">{{ 'app.title' | transloco }}</span>
  </a>

  <nav class="nav nav--desktop" [attr.aria-label]="'app.title' | transloco">
    @if (mode() === 'public') {
      <a [routerLink]="['/']" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
        {{ 'public.nav.home' | transloco }}
      </a>
      <a [routerLink]="['/features']" routerLinkActive="active">
        {{ 'public.nav.features' | transloco }}
      </a>
      <a [routerLink]="['/about']" routerLinkActive="active">
        {{ 'public.nav.about' | transloco }}
      </a>
      <a [routerLink]="['/contribute']" routerLinkActive="active">
        {{ 'public.nav.contribute' | transloco }}
      </a>
    } @else {
      <a [routerLink]="['/dashboard']" routerLinkActive="active">
        {{ 'nav.dashboard' | transloco }}
      </a>
      <a [routerLink]="['/teams']" routerLinkActive="active">
        {{ 'nav.teams' | transloco }}
      </a>
      <a [routerLink]="['/programs']" routerLinkActive="active">
        {{ 'nav.programs' | transloco }}
      </a>
      <a [routerLink]="['/events']" routerLinkActive="active">
        {{ 'nav.calendar' | transloco }}
      </a>
      @if (isStaff()) {
        <a [routerLink]="['/admin']" routerLinkActive="active">
          {{ 'nav.admin' | transloco }}
        </a>
      }
    }
  </nav>

  <div class="actions actions--desktop">
    <app-language-switcher />
    <app-user-menu />
  </div>

  <button
    type="button"
    class="hamburger"
    [attr.aria-expanded]="mobileMenuOpen()"
    [attr.aria-label]="(mobileMenuOpen() ? 'topmenu.close' : 'topmenu.open') | transloco"
    (click)="toggleMobile()"
  >
    <i class="pi" [class.pi-bars]="!mobileMenuOpen()" [class.pi-times]="mobileMenuOpen()" aria-hidden="true"></i>
  </button>

  @if (mobileMenuOpen()) {
    <div class="drawer">
      <nav class="nav nav--mobile" [attr.aria-label]="'app.title' | transloco">
        @if (mode() === 'public') {
          <a [routerLink]="['/']" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="closeMobile()">
            {{ 'public.nav.home' | transloco }}
          </a>
          <a [routerLink]="['/features']" routerLinkActive="active" (click)="closeMobile()">
            {{ 'public.nav.features' | transloco }}
          </a>
          <a [routerLink]="['/about']" routerLinkActive="active" (click)="closeMobile()">
            {{ 'public.nav.about' | transloco }}
          </a>
          <a [routerLink]="['/contribute']" routerLinkActive="active" (click)="closeMobile()">
            {{ 'public.nav.contribute' | transloco }}
          </a>
        } @else {
          <a [routerLink]="['/dashboard']" routerLinkActive="active" (click)="closeMobile()">
            {{ 'nav.dashboard' | transloco }}
          </a>
          <a [routerLink]="['/teams']" routerLinkActive="active" (click)="closeMobile()">
            {{ 'nav.teams' | transloco }}
          </a>
          <a [routerLink]="['/programs']" routerLinkActive="active" (click)="closeMobile()">
            {{ 'nav.programs' | transloco }}
          </a>
          <a [routerLink]="['/events']" routerLinkActive="active" (click)="closeMobile()">
            {{ 'nav.calendar' | transloco }}
          </a>
          @if (isStaff()) {
            <a [routerLink]="['/admin']" routerLinkActive="active" (click)="closeMobile()">
              {{ 'nav.admin' | transloco }}
            </a>
          }
        }
      </nav>
      <div class="actions actions--mobile">
        <app-language-switcher />
        <app-user-menu />
      </div>
    </div>
  }
</header>
```

### Step 3.5 — Create the SCSS

Create `src/app/core/layout/topmenu/topmenu.component.scss`:

```scss
:host {
  display: block;
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.45rem 1.1rem;
  min-height: 60px;
  background:
    linear-gradient(135deg, #082f49fa, #0f172af5),
    linear-gradient(90deg, #38bdf82e, #10b9811f);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  position: relative;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  color: inherit;
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 0.85rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
}

.nav--desktop {
  display: flex;
  flex: 1;
  justify-content: center;
  gap: 0.1rem;
}

.nav a {
  padding: 0.45rem 0.7rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: #cbd5e1;
  text-decoration: none;
  border-radius: 0.4rem;
  transition: color 0.15s ease, background 0.15s ease;
}

.nav a:hover { color: #fff; }
.nav a.active { color: #fff; font-weight: 600; }

.actions--desktop {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.hamburger {
  display: none;
  background: transparent;
  border: 0;
  color: #cbd5e1;
  width: 40px;
  height: 40px;
  border-radius: 0.5rem;
  cursor: pointer;
}

.hamburger:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }

.drawer {
  display: none;
}

@media (max-width: 960px) {
  .topbar {
    padding: 0.4rem 0.85rem;
    min-height: 56px;
  }
  .nav--desktop, .actions--desktop { display: none; }
  .hamburger { display: inline-flex; align-items: center; justify-content: center; margin-left: auto; }

  .drawer {
    display: block;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
    padding: 0.75rem 1rem;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  }

  .drawer .nav--mobile {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .drawer .nav--mobile a {
    color: #475569;
    padding: 0.6rem 0.5rem;
    border-radius: 0.4rem;
  }

  .drawer .nav--mobile a:hover { background: #f1f5f9; color: #0f172a; }
  .drawer .nav--mobile a.active { color: #4f46e5; font-weight: 600; }

  .drawer .actions--mobile {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-top: 0.75rem;
    margin-top: 0.5rem;
    border-top: 1px solid #f1f5f9;
  }
}

@media (max-width: 480px) {
  .topbar {
    padding: 0.35rem 0.7rem;
  }
  .brand-mark { width: 36px; height: 36px; }
}
```

### Step 3.6 — Run the spec; confirm pass

- [ ] Run: `npm test -- src/app/core/layout/topmenu/topmenu.component.spec.ts`
- Expected: PASS, 7 tests green.

### Step 3.7 — Migrate `MainLayoutComponent`

Replace `src/app/core/layout/main-layout/main-layout.component.html` with:

```html
<app-topmenu mode="authenticated" />

<main class="main-container">
  <router-outlet />
</main>

<p-toast />
```

Update `src/app/core/layout/main-layout/main-layout.component.ts` imports — replace existing imports with:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from 'primeng/toast';
import { TopmenuComponent } from '../topmenu/topmenu.component';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, Toast, TopmenuComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {}
```

If `main-layout.component.scss` declared `.main-container` styles, verify it still has the 1.5rem padding. If not, append:

```scss
.main-container {
  padding: 1.5rem;
  max-width: 80rem;
  margin: 0 auto;
}
```

### Step 3.8 — Migrate `PublicLayoutComponent`

Replace `src/app/core/layout/public-layout/public-layout.component.html` with:

```html
<div class="public-shell">
  <app-topmenu mode="public" />
  <main class="main-container">
    <router-outlet />
  </main>
  <app-footer />
</div>
```

Update `src/app/core/layout/public-layout/public-layout.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FooterComponent } from '../footer/footer.component';
import { TopmenuComponent } from '../topmenu/topmenu.component';

@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, TopmenuComponent, FooterComponent],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {}
```

Append to `public-layout.component.scss` if not already present:

```scss
.public-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-container {
  flex: 1;
  padding: 1.5rem;
  max-width: 80rem;
  margin: 0 auto;
  width: 100%;
}
```

### Step 3.9 — Replace the public-layout spec

Replace `src/app/core/layout/public-layout/public-layout.component.spec.ts` with:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../i18n/language.service';
import { PublicLayoutComponent } from './public-layout.component';

describe('PublicLayoutComponent', () => {
  let fixture: ComponentFixture<PublicLayoutComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        PublicLayoutComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: AuthService, useValue: { currentUser: signal(null).asReadonly(), logout: () => undefined } },
        { provide: LanguageService, useValue: { activeLang: signal('fr').asReadonly(), switchLanguage: () => ({ subscribe: () => undefined }) } },
        { provide: Router, useValue: { events: new Subject().asObservable() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PublicLayoutComponent);
    fixture.detectChanges();
  });

  it('renders <app-topmenu mode="public"> + <router-outlet> + <app-footer>', () => {
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('<app-topmenu');
    expect(html).toContain('<app-footer');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
```

(The detailed assertions about specific nav links live in `topmenu.component.spec.ts` now.)

### Step 3.10 — Run all impacted specs

- [ ] Run: `npm test -- src/app/core/layout`
- Expected: all PASS — topmenu, footer, public-layout, main-layout (if it has a spec).

### Step 3.11 — Commit

```bash
git add src/app/core/layout/topmenu src/app/core/layout/main-layout src/app/core/layout/public-layout public/i18n
git commit -m "feat(layout): extract app-topmenu (sticky :host, hamburger ≤960px)

Layouts collapse to <app-topmenu mode=...> + <router-outlet> (+ <app-footer>
for public). Topmenu owns mobileMenuOpen signal, closes on NavigationEnd,
clicks outside, and Escape. mode='public'|'authenticated' drives nav links.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Refactor `app-language-switcher` (compact globe trigger)

**Files:**
- Modify: `src/app/core/i18n/language-switcher/language-switcher.component.{ts,html,scss,spec.ts}`
- Modify: `public/i18n/{fr,nl,en,it,es}.json` — add `common.language_switcher.aria`.

### Step 4.1 — Add the aria i18n key

For each `public/i18n/{fr,nl,en,it,es}.json`, inside the existing `"common"` object, append:

`fr.json`:
```json
"language_switcher": { "aria": "Choisir la langue" }
```
`nl.json`: `"Taal kiezen"`. `en.json`: `"Choose language"`. `it.json`: `"Scegli la lingua"`. `es.json`: `"Elegir idioma"`.

### Step 4.2 — Replace the spec

Replace `src/app/core/i18n/language-switcher/language-switcher.component.spec.ts` with:

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
```

- [ ] **Step 4.2.1 — Run; confirm failure**

Run: `npm test -- src/app/core/i18n/language-switcher/language-switcher.component.spec.ts`
Expected: FAIL — current component lacks the new methods.

### Step 4.3 — Replace the component class

Replace `src/app/core/i18n/language-switcher/language-switcher.component.ts` with:

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

  protected toggle(): void { this.open.update((v) => !v); }
  protected close(): void { this.open.set(false); }

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

### Step 4.4 — Replace the template

Replace `src/app/core/i18n/language-switcher/language-switcher.component.html` with:

```html
<div class="ls-root">
  <button
    type="button"
    class="ls-trigger"
    [attr.aria-label]="'common.language_switcher.aria' | transloco"
    [attr.aria-haspopup]="'menu'"
    [attr.aria-expanded]="open()"
    (click)="toggle()"
  >
    <i class="pi pi-globe" aria-hidden="true"></i>
    <span class="ls-code">{{ current() | uppercase }}</span>
    <i class="pi pi-chevron-down ls-caret" aria-hidden="true"></i>
  </button>

  @if (open()) {
    <div role="menu" class="ls-menu">
      @for (lang of languages; track lang.code) {
        <button
          type="button"
          role="menuitem"
          class="ls-item"
          [class.is-active]="lang.code === current()"
          [attr.aria-current]="lang.code === current() ? 'true' : null"
          (click)="select(lang.code)"
        >
          <span class="ls-chip">{{ lang.code }}</span>
          <span class="ls-name">{{ lang.nativeName }}</span>
          @if (lang.code === current()) {
            <i class="pi pi-check ls-check" aria-hidden="true"></i>
          }
        </button>
      }
    </div>
  }
</div>
```

### Step 4.5 — Replace the SCSS

Replace `src/app/core/i18n/language-switcher/language-switcher.component.scss` with:

```scss
:host { display: inline-block; }

.ls-root { position: relative; display: inline-block; }

.ls-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  height: 36px;
  padding: 0 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.10);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover { background: rgba(255, 255, 255, 0.15); }

  &:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.4);
    outline-offset: 2px;
  }
}

.ls-code { font-weight: 700; letter-spacing: 0.05em; }
.ls-caret { font-size: 0.65rem; }

.ls-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  min-width: 12rem;
  background: #fff;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  padding: 0.25rem;
  z-index: 60;
  display: flex;
  flex-direction: column;
}

.ls-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.6rem;
  border-radius: 0.5rem;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 0.85rem;
  color: #374151;

  &:hover { background: #f3f4f6; }
  &.is-active { background: #eef2ff; color: #4338ca; }
}

.ls-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.25rem;
  border-radius: 0.35rem;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  .is-active & { background: #e0e7ff; color: #3730a3; }
}

.ls-name { flex: 1; }
.ls-check { color: #4f46e5; font-size: 0.8rem; }
```

### Step 4.6 — Run; confirm pass

- [ ] Run: `npm test -- src/app/core/i18n/language-switcher/language-switcher.component.spec.ts`
- Expected: PASS, 8 tests green.

### Step 4.7 — Commit

```bash
git add src/app/core/i18n/language-switcher public/i18n
git commit -m "refactor(i18n): compact globe-trigger language switcher

Replace the full-width <p-select> with a globe + uppercase code button
opening a custom dropdown (chip + native name + check on active).
Closes on outside click and Escape. Adds common.language_switcher.aria
across the 5 locales.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Refactor `/contribute` (no hero, sections, ui()-i18n)

**Files:**
- Create: `src/app/features/contribute-page/contribute-page.text.ts`
- Modify: `src/app/features/contribute-page/contribute-page.component.{ts,html,scss,spec.ts}`
- Modify: `public/i18n/{fr,nl,en,it,es}.json` — remove the `contribute_page.*` block (orphan).

### Step 5.1 — Create the text module

Create `src/app/features/contribute-page/contribute-page.text.ts`:

```ts
import { LanguageCode } from '../../core/i18n/available-languages';

export interface ContributeReason {
  slug: 'oss' | 'hosting' | 'maintenance' | 'features';
  icon: string;
  title: string;
  body: string;
}

export interface ContributePageUiText {
  intro: { title: string; lead: string };
  reasons: { title: string; items: ReadonlyArray<ContributeReason> };
  donate: { title: string; intro: string; cta: string; redirect_note: string };
  thanks: { title: string; body: string };
}

const REASON_DEFS = [
  { slug: 'oss', icon: 'pi-code' },
  { slug: 'hosting', icon: 'pi-server' },
  { slug: 'maintenance', icon: 'pi-shield' },
  { slug: 'features', icon: 'pi-sparkles' },
] as const;

type ReasonSlug = typeof REASON_DEFS[number]['slug'];

interface ReasonContent { title: string; body: string }

interface ContributeContent {
  intro: { title: string; lead: string };
  reasons: { title: string; items: Record<ReasonSlug, ReasonContent> };
  donate: { title: string; intro: string; cta: string; redirect_note: string };
  thanks: { title: string; body: string };
}

function build(content: ContributeContent): ContributePageUiText {
  return {
    intro: content.intro,
    reasons: {
      title: content.reasons.title,
      items: REASON_DEFS.map((def) => ({
        slug: def.slug,
        icon: def.icon,
        title: content.reasons.items[def.slug].title,
        body: content.reasons.items[def.slug].body,
      })),
    },
    donate: content.donate,
    thanks: content.thanks,
  };
}

const FR_CONTENT: ContributeContent = {
  intro: {
    title: 'Aidez Training Manager à grandir',
    lead: "Training Manager est un projet libre et open source. Votre soutien permet de maintenir la plateforme, corriger les bugs et développer de nouvelles fonctionnalités.",
  },
  reasons: {
    title: 'Pourquoi soutenir Training Manager ?',
    items: {
      oss: { title: 'Open source et gratuit', body: "Pas d'abonnement, pas de publicité. Le code est libre et le restera." },
      hosting: { title: 'Hébergement et infrastructure', body: "Serveurs, certificats SSL et envoi d'emails ont un coût bien réel." },
      maintenance: { title: 'Maintenance continue', body: 'Mises à jour de sécurité, correctifs et compatibilité avec les nouvelles versions.' },
      features: { title: 'Nouvelles fonctionnalités', body: 'Chaque contribution accélère le développement des fonctionnalités demandées par la communauté.' },
    },
  },
  donate: {
    title: 'Faire un don',
    intro: 'Les dons sont gérés via GitHub Sponsors. Vous pouvez faire un don ponctuel ou mettre en place un soutien récurrent.',
    cta: 'Soutenir sur GitHub Sponsors',
    redirect_note: 'Vous serez redirigé vers GitHub Sponsors dans un nouvel onglet.',
  },
  thanks: { title: 'Merci !', body: 'Chaque contribution, aussi petite soit-elle, fait une différence. Merci de croire en ce projet.' },
};

const EN_CONTENT: ContributeContent = {
  intro: {
    title: 'Help Training Manager grow',
    lead: 'Training Manager is a free, open-source project. Your support helps maintain the platform, fix bugs and develop new features.',
  },
  reasons: {
    title: 'Why support Training Manager?',
    items: {
      oss: { title: 'Open-source and free', body: 'No subscription, no ads. The code is free and will remain so.' },
      hosting: { title: 'Hosting and infrastructure', body: 'Servers, SSL certificates and email delivery have a real cost.' },
      maintenance: { title: 'Ongoing maintenance', body: 'Security updates, bug fixes and compatibility with new releases.' },
      features: { title: 'New features', body: 'Every contribution accelerates the development of community-requested features.' },
    },
  },
  donate: {
    title: 'Make a donation',
    intro: 'Donations are handled through GitHub Sponsors. You can make a one-time donation or set up recurring support.',
    cta: 'Support on GitHub Sponsors',
    redirect_note: 'You will be redirected to GitHub Sponsors in a new tab.',
  },
  thanks: { title: 'Thank you!', body: 'Every contribution, however small, makes a difference. Thank you for believing in this project.' },
};

const NL_CONTENT: ContributeContent = {
  intro: {
    title: 'Help Training Manager groeien',
    lead: 'Training Manager is een vrij, open-source project. Jouw steun helpt het platform te onderhouden, bugs op te lossen en nieuwe functies te ontwikkelen.',
  },
  reasons: {
    title: 'Waarom Training Manager steunen?',
    items: {
      oss: { title: 'Open source en gratis', body: 'Geen abonnement, geen reclame. De code is vrij en blijft dat.' },
      hosting: { title: 'Hosting en infrastructuur', body: 'Servers, SSL-certificaten en e-maillevering hebben een reële kost.' },
      maintenance: { title: 'Doorlopend onderhoud', body: 'Beveiligingsupdates, foutoplossingen en compatibiliteit met nieuwe versies.' },
      features: { title: 'Nieuwe functies', body: 'Elke bijdrage versnelt de ontwikkeling van door de community gevraagde functies.' },
    },
  },
  donate: {
    title: 'Een donatie doen',
    intro: 'Donaties worden afgehandeld via GitHub Sponsors. Je kunt een eenmalige donatie doen of terugkerende steun instellen.',
    cta: 'Steunen op GitHub Sponsors',
    redirect_note: 'Je wordt doorverwezen naar GitHub Sponsors in een nieuw tabblad.',
  },
  thanks: { title: 'Bedankt!', body: 'Elke bijdrage, hoe klein ook, maakt een verschil. Bedankt om in dit project te geloven.' },
};

const IT_CONTENT: ContributeContent = {
  intro: {
    title: 'Aiuta Training Manager a crescere',
    lead: 'Training Manager è un progetto libero e open source. Il tuo sostegno aiuta a mantenere la piattaforma, correggere bug e sviluppare nuove funzionalità.',
  },
  reasons: {
    title: 'Perché sostenere Training Manager?',
    items: {
      oss: { title: 'Open source e gratuito', body: 'Nessun abbonamento, nessuna pubblicità. Il codice è libero e tale rimarrà.' },
      hosting: { title: 'Hosting e infrastruttura', body: 'Server, certificati SSL e invio email hanno un costo reale.' },
      maintenance: { title: 'Manutenzione continua', body: 'Aggiornamenti di sicurezza, correzioni di bug e compatibilità con le nuove versioni.' },
      features: { title: 'Nuove funzionalità', body: 'Ogni contributo accelera lo sviluppo delle funzionalità richieste dalla community.' },
    },
  },
  donate: {
    title: 'Fai una donazione',
    intro: 'Le donazioni sono gestite tramite GitHub Sponsors. Puoi fare una donazione una tantum o impostare un sostegno ricorrente.',
    cta: 'Sostieni su GitHub Sponsors',
    redirect_note: 'Sarai reindirizzato a GitHub Sponsors in una nuova scheda.',
  },
  thanks: { title: 'Grazie!', body: 'Ogni contributo, per quanto piccolo, fa la differenza. Grazie per credere in questo progetto.' },
};

const ES_CONTENT: ContributeContent = {
  intro: {
    title: 'Ayuda a Training Manager a crecer',
    lead: 'Training Manager es un proyecto libre y de código abierto. Tu apoyo ayuda a mantener la plataforma, corregir errores y desarrollar nuevas funciones.',
  },
  reasons: {
    title: '¿Por qué apoyar a Training Manager?',
    items: {
      oss: { title: 'Código abierto y gratuito', body: 'Sin suscripción, sin anuncios. El código es libre y lo seguirá siendo.' },
      hosting: { title: 'Alojamiento e infraestructura', body: 'Servidores, certificados SSL y envío de correos tienen un coste real.' },
      maintenance: { title: 'Mantenimiento continuo', body: 'Actualizaciones de seguridad, correcciones y compatibilidad con nuevas versiones.' },
      features: { title: 'Nuevas funciones', body: 'Cada contribución acelera el desarrollo de las funciones solicitadas por la comunidad.' },
    },
  },
  donate: {
    title: 'Hacer una donación',
    intro: 'Las donaciones se gestionan a través de GitHub Sponsors. Puedes hacer una donación única o configurar un apoyo recurrente.',
    cta: 'Apoyar en GitHub Sponsors',
    redirect_note: 'Serás redirigido a GitHub Sponsors en una nueva pestaña.',
  },
  thanks: { title: '¡Gracias!', body: 'Cada contribución, por pequeña que sea, marca la diferencia. Gracias por creer en este proyecto.' },
};

const FR = build(FR_CONTENT);
const EN = build(EN_CONTENT);
const NL = build(NL_CONTENT);
const IT = build(IT_CONTENT);
const ES = build(ES_CONTENT);

const UI_TEXT: Record<LanguageCode, ContributePageUiText> = { fr: FR, en: EN, nl: NL, it: IT, es: ES };

export function getContributePageUiText(lang: LanguageCode): ContributePageUiText {
  return UI_TEXT[lang] ?? EN;
}
```

### Step 5.2 — Replace the component spec

Replace `src/app/features/contribute-page/contribute-page.component.spec.ts` with:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageService } from '../../core/i18n/language.service';
import { ContributePageComponent } from './contribute-page.component';

describe('ContributePageComponent', () => {
  let fixture: ComponentFixture<ContributePageComponent>;
  let langSig: ReturnType<typeof signal<'fr' | 'en' | 'nl' | 'it' | 'es'>>;

  async function setup(initialLang: 'fr' | 'en' | 'nl' | 'it' | 'es' = 'fr') {
    TestBed.resetTestingModule();
    langSig = signal(initialLang);
    await TestBed.configureTestingModule({
      imports: [ContributePageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: LanguageService, useValue: { activeLang: langSig.asReadonly() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ContributePageComponent);
    fixture.detectChanges();
  }

  it('renders 4 sections with their data-slug attributes (intro, reasons, donate, thanks)', async () => {
    await setup();
    const slugs = Array.from(fixture.nativeElement.querySelectorAll('section.contribute-section'))
      .map((s) => (s as HTMLElement).getAttribute('data-slug'));
    expect(slugs).toEqual(['intro', 'reasons', 'donate', 'thanks']);
  });

  it('renders 4 reason cards in REASON_DEFS order (oss, hosting, maintenance, features)', async () => {
    await setup();
    const cards = fixture.nativeElement.querySelectorAll('.contribute-card');
    expect(cards.length).toBe(4);
    const slugs = Array.from(cards).map((c) => (c as HTMLElement).getAttribute('data-slug'));
    expect(slugs).toEqual(['oss', 'hosting', 'maintenance', 'features']);
  });

  it('renders Sponsors CTA with target=_blank, rel=noopener noreferrer, correct href', async () => {
    await setup();
    const link = fixture.nativeElement.querySelector('a.donate-cta') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://github.com/sponsors/Foxugly');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders FR strings when activeLang is fr', async () => {
    await setup('fr');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Aidez Training Manager à grandir');
    expect(text).toContain('Faire un don');
  });

  it('switches to EN strings when activeLang flips', async () => {
    await setup('fr');
    langSig.set('en');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Help Training Manager grow');
    expect(text).toContain('Make a donation');
  });

  it('does not reference the legacy Transloco contribute_page.* keys', async () => {
    await setup();
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).not.toContain('contribute_page.title');
    expect(html).not.toContain('contribute_page.oss.title');
  });
});
```

### Step 5.3 — Replace the component class

Replace `src/app/features/contribute-page/contribute-page.component.ts` with:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { getContributePageUiText } from './contribute-page.text';

@Component({
  selector: 'app-contribute-page',
  imports: [],
  templateUrl: './contribute-page.component.html',
  styleUrl: './contribute-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributePageComponent {
  private readonly languageService = inject(LanguageService);

  protected readonly sponsorsUrl = 'https://github.com/sponsors/Foxugly';
  protected readonly ui = computed(() => getContributePageUiText(this.languageService.activeLang()));
}
```

### Step 5.4 — Replace the template

Replace `src/app/features/contribute-page/contribute-page.component.html` with:

```html
<article class="contribute-page">
  <section class="contribute-section" data-slug="intro">
    <div class="contribute-section-inner">
      <h1>{{ ui().intro.title }}</h1>
      <p class="lead">{{ ui().intro.lead }}</p>
    </div>
  </section>

  <section class="contribute-section" data-slug="reasons">
    <div class="contribute-section-inner">
      <h2>{{ ui().reasons.title }}</h2>
      <div class="contribute-grid">
        @for (reason of ui().reasons.items; track reason.slug) {
          <article class="contribute-card" [attr.data-slug]="reason.slug">
            <div class="contribute-icon" aria-hidden="true">
              <i class="pi" [class]="reason.icon"></i>
            </div>
            <h3>{{ reason.title }}</h3>
            <p>{{ reason.body }}</p>
          </article>
        }
      </div>
    </div>
  </section>

  <section class="contribute-section" data-slug="donate">
    <div class="contribute-section-inner contribute-section-inner--center">
      <h2>{{ ui().donate.title }}</h2>
      <p class="lead">{{ ui().donate.intro }}</p>
      <a [href]="sponsorsUrl" target="_blank" rel="noopener noreferrer" class="donate-cta">
        <i class="pi pi-heart-fill" aria-hidden="true"></i>
        {{ ui().donate.cta }}
        <i class="pi pi-external-link" aria-hidden="true"></i>
      </a>
      <p class="donate-redirect-note">{{ ui().donate.redirect_note }}</p>
    </div>
  </section>

  <section class="contribute-section" data-slug="thanks">
    <div class="contribute-section-inner contribute-section-inner--center">
      <h2>{{ ui().thanks.title }}</h2>
      <p>{{ ui().thanks.body }}</p>
    </div>
  </section>
</article>
```

### Step 5.5 — Replace the SCSS

Replace `src/app/features/contribute-page/contribute-page.component.scss` with:

```scss
:host {
  display: block;
}

.contribute-page {
  margin: -1.5rem;
}

.contribute-section {
  padding: 3rem 1.5rem;

  &:nth-of-type(odd) { background: #ffffff; }
  &:nth-of-type(even) { background: #f8fafc; }
}

.contribute-section-inner {
  max-width: 64rem;
  margin: 0 auto;

  &--center {
    text-align: center;
    max-width: 36rem;
  }
}

.contribute-section[data-slug='intro'] h1 {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #0f172a;
}

.contribute-section h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #0f172a;
  text-align: center;
  margin-bottom: 1.5rem;
}

.lead {
  color: #475569;
  font-size: 1rem;
  line-height: 1.6;
  margin-top: 0.75rem;
}

.contribute-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
  gap: 1rem;
}

.contribute-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);

  h3 { font-size: 1rem; font-weight: 600; color: #0f172a; margin: 0; }
  p { font-size: 0.85rem; color: #475569; line-height: 1.5; margin: 0; }
}

.contribute-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
}

.contribute-card[data-slug='oss'] .contribute-icon { background: #e0f2fe; color: #0369a1; }
.contribute-card[data-slug='hosting'] .contribute-icon { background: #d1fae5; color: #047857; }
.contribute-card[data-slug='maintenance'] .contribute-icon { background: #fef3c7; color: #b45309; }
.contribute-card[data-slug='features'] .contribute-icon { background: #ffe4e6; color: #be123c; }

.donate-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  margin-top: 1.5rem;
  background: linear-gradient(to right, #f43f5e, #ec4899);
  color: #fff;
  font-weight: 600;
  font-size: 0.9rem;
  border-radius: 0.5rem;
  text-decoration: none;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
  transition: opacity 0.15s ease;

  &:hover { opacity: 0.92; }
  &:focus-visible {
    outline: 2px solid #f43f5e;
    outline-offset: 2px;
  }
}

.donate-redirect-note {
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
  font-style: italic;
}
```

### Step 5.6 — Remove the orphan i18n keys

In each `public/i18n/{fr,nl,en,it,es}.json`, locate the entire `"contribute_page": { … }` block (including its trailing comma) and remove it. The keys are no longer referenced by any template.

### Step 5.7 — Run the spec; confirm pass

- [ ] Run: `npm test -- src/app/features/contribute-page/contribute-page.component.spec.ts`
- Expected: PASS, 6 tests green.

### Step 5.8 — Commit

```bash
git add src/app/features/contribute-page public/i18n
git commit -m "feat(contribute): no-hero sections + ui()-based i18n

Replace the hero + dual-card layout with 4 sections (intro, reasons,
donate, thanks) using the features-page convention. Migrate i18n from
Transloco JSON to TS const factorization (REASON_DEFS + per-language
content + EN fallback). Remove the orphaned contribute_page.* keys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — Create `/about` (3 tabs incl. Company)

**Files:**
- Create: `src/app/features/about-page/about-page.text.ts`
- Create: `src/app/features/about-page/about-page.component.{ts,html,scss,spec.ts}`
- Modify: `src/app/app.routes.ts` — add `/about` route.
- Modify: `public/i18n/{fr,nl,en,it,es}.json` — add `public.nav.about`.

### Step 6.1 — Add the nav i18n key

For each catalog, inside `"public": { "nav": { … } }`, add `"about"` between `"features"` and `"contribute"`:

`fr.json`: `"about": "À propos"`.
`en.json`: `"about": "About"`.
`nl.json`: `"about": "Over"`.
`it.json`: `"about": "Informazioni"`.
`es.json`: `"about": "Acerca de"`.

### Step 6.2 — Create the text module

Create `src/app/features/about-page/about-page.text.ts`:

```ts
import { LanguageCode } from '../../core/i18n/available-languages';

export type AboutTab = 'company' | 'legal' | 'technical';

export interface CompanyRowText {
  key: 'contact' | 'company' | 'vat' | 'address' | 'email' | 'phone' | 'website';
  label: string;
  kind: 'text' | 'multiline' | 'email' | 'phone' | 'website';
  value?: string;
  lines?: string[];
}

export interface AboutPageUiText {
  intro: { title: string; lead: string; view_repo: string };
  tabs: { company: string; legal: string; technical: string };
  company: { title: string; lead: string; email_cta: string; rows: ReadonlyArray<CompanyRowText> };
  legal: {
    title: string; lead: string;
    sections: ReadonlyArray<{ slug: string; title: string; items: ReadonlyArray<string> }>;
  };
  technical: {
    title: string; lead: string;
    sections: ReadonlyArray<{ slug: string; title: string; intro: string; items: ReadonlyArray<string> }>;
  };
}

interface CompanyRowContent {
  contact: { label: string; value: string };
  company: { label: string; value: string };
  vat: { label: string; value: string };
  address: { label: string; lines: string[] };
  email: { label: string };
  phone: { label: string };
  website: { label: string };
}

interface AboutContent {
  intro: { title: string; lead: string; view_repo: string };
  tabs: { company: string; legal: string; technical: string };
  company: { title: string; lead: string; email_cta: string; rows: CompanyRowContent };
  legal: {
    title: string; lead: string;
    controller: { title: string; items: string[] };
    collected: { title: string; items: string[] };
    basis: { title: string; items: string[] };
    rights: { title: string; items: string[] };
    retention: { title: string; items: string[] };
    security: { title: string; items: string[] };
    cookies: { title: string; items: string[] };
  };
  technical: {
    title: string; lead: string;
    repo: { title: string; intro: string; items: string[] };
    backend: { title: string; intro: string; items: string[] };
    frontend: { title: string; intro: string; items: string[] };
  };
}

function build(c: AboutContent): AboutPageUiText {
  return {
    intro: c.intro,
    tabs: c.tabs,
    company: {
      title: c.company.title,
      lead: c.company.lead,
      email_cta: c.company.email_cta,
      rows: [
        { key: 'contact', label: c.company.rows.contact.label, kind: 'text', value: c.company.rows.contact.value },
        { key: 'company', label: c.company.rows.company.label, kind: 'text', value: c.company.rows.company.value },
        { key: 'vat', label: c.company.rows.vat.label, kind: 'text', value: c.company.rows.vat.value },
        { key: 'address', label: c.company.rows.address.label, kind: 'multiline', lines: c.company.rows.address.lines },
        { key: 'email', label: c.company.rows.email.label, kind: 'email' },
        { key: 'phone', label: c.company.rows.phone.label, kind: 'phone' },
        { key: 'website', label: c.company.rows.website.label, kind: 'website' },
      ],
    },
    legal: {
      title: c.legal.title,
      lead: c.legal.lead,
      sections: [
        { slug: 'controller', title: c.legal.controller.title, items: c.legal.controller.items },
        { slug: 'collected', title: c.legal.collected.title, items: c.legal.collected.items },
        { slug: 'basis', title: c.legal.basis.title, items: c.legal.basis.items },
        { slug: 'rights', title: c.legal.rights.title, items: c.legal.rights.items },
        { slug: 'retention', title: c.legal.retention.title, items: c.legal.retention.items },
        { slug: 'security', title: c.legal.security.title, items: c.legal.security.items },
        { slug: 'cookies', title: c.legal.cookies.title, items: c.legal.cookies.items },
      ],
    },
    technical: {
      title: c.technical.title,
      lead: c.technical.lead,
      sections: [
        { slug: 'repo', title: c.technical.repo.title, intro: c.technical.repo.intro, items: c.technical.repo.items },
        { slug: 'backend', title: c.technical.backend.title, intro: c.technical.backend.intro, items: c.technical.backend.items },
        { slug: 'frontend', title: c.technical.frontend.title, intro: c.technical.frontend.intro, items: c.technical.frontend.items },
      ],
    },
  };
}

const FR_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: "Plateforme de gestion d'équipes, programmes et entraînements pour les coachs : planification, présences, suivi et génération assistée par IA des séances.",
    view_repo: 'Voir le dépôt',
  },
  tabs: { company: 'Société', legal: 'Mentions légales', technical: 'Technique' },
  company: {
    title: 'Société',
    lead: 'Informations légales et coordonnées de la société qui édite Training Manager.',
    email_cta: 'Envoyez-moi un email',
    rows: {
      contact: { label: 'Contact', value: 'Renaud Vilain' },
      company: { label: 'Société', value: 'Foxugly SRL' },
      vat: { label: 'TVA / BCE', value: 'BE 1004.770.045' },
      address: { label: 'Adresse', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaerbeek', 'Belgique'] },
      email: { label: 'Email' },
      phone: { label: 'Téléphone' },
      website: { label: 'Site' },
    },
  },
  legal: {
    title: 'Mentions légales et protection des données',
    lead: 'Training Manager respecte les réglementations européennes en matière de protection des données personnelles.',
    controller: {
      title: 'Responsable du traitement',
      items: [
        "Le responsable du traitement est l'administrateur de l'instance Training Manager déployée.",
        "Pour toute question sur vos données personnelles, contactez l'administrateur de votre instance.",
      ],
    },
    collected: {
      title: 'Données collectées',
      items: [
        "Données d'identification : nom d'utilisateur, adresse email, prénom, nom.",
        "Données d'activité : équipes, programmes, séances, présences, préférences de langue.",
        'Données techniques : journaux de connexion strictement nécessaires à la sécurité.',
      ],
    },
    basis: {
      title: 'Base légale et finalités (RGPD art. 6)',
      items: [
        "Exécution d'un contrat : gestion de votre compte, organisation de vos équipes et suivi de vos séances.",
        'Intérêt légitime : sécurité de la plateforme, prévention des abus, amélioration du service.',
        'Consentement : envoi de notifications optionnelles (révocable à tout moment).',
      ],
    },
    rights: {
      title: 'Vos droits (RGPD art. 15-22)',
      items: [
        "Droit d'accès : obtenir une copie de vos données personnelles.",
        'Droit de rectification : corriger des données inexactes ou incomplètes.',
        "Droit à l'effacement : demander la suppression de vos données.",
        'Droit à la portabilité : recevoir vos données dans un format structuré et lisible.',
        "Droit d'opposition : vous opposer au traitement dans certains cas.",
        'Droit de réclamation : déposer une plainte auprès de votre autorité de contrôle nationale.',
      ],
    },
    retention: {
      title: 'Conservation des données',
      items: [
        'Les données de compte sont conservées pendant la durée de votre inscription.',
        "Les données d'équipes et de séances sont conservées tant que l'équipe est active.",
        "Lors de la suppression d'un compte, vos données personnelles sont supprimées ou anonymisées sous 30 jours.",
      ],
    },
    security: {
      title: 'Sécurité',
      items: [
        'Les communications sont chiffrées via HTTPS/TLS.',
        "Les mots de passe sont hachés à l'aide d'un algorithme irréversible (PBKDF2).",
        "L'authentification repose sur des jetons JWT à durée de vie courte.",
      ],
    },
    cookies: {
      title: 'Cookies',
      items: [
        "Training Manager n'utilise pas de cookies de pistage ni de cookies publicitaires.",
        'Seuls les cookies techniques strictement nécessaires (session, préférence de langue) sont utilisés.',
      ],
    },
  },
  technical: {
    title: 'Détails techniques',
    lead: "Le projet est composé d'un frontend Angular et d'un backend Django partageant un contrat OpenAPI.",
    repo: {
      title: 'Dépôt',
      intro: 'Code source, CI et artefacts de contrat sont hébergés sur GitHub.',
      items: ['Repos séparés : trainingmanager_frontend (Angular) et trainingmanager (Django).', 'CI GitHub Actions sur les deux côtés.'],
    },
    backend: {
      title: 'Backend',
      intro: 'API REST, règles métier et sécurité applicative.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: "Single-page app pour l'administration et l'accès aux séances.",
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const EN_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: 'Team, program and training session management for coaches: scheduling, attendance, tracking, and AI-assisted session generation.',
    view_repo: 'View repository',
  },
  tabs: { company: 'Company', legal: 'Legal notice', technical: 'Technical' },
  company: {
    title: 'Company',
    lead: 'Legal information and contact details of the company that operates Training Manager.',
    email_cta: 'Send me an email',
    rows: {
      contact: { label: 'Contact', value: 'Renaud Vilain' },
      company: { label: 'Company', value: 'Foxugly SRL' },
      vat: { label: 'VAT / BCE', value: 'BE 1004.770.045' },
      address: { label: 'Address', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaerbeek', 'Belgium'] },
      email: { label: 'Email' },
      phone: { label: 'Phone' },
      website: { label: 'Website' },
    },
  },
  legal: {
    title: 'Legal notice & data protection',
    lead: 'Training Manager complies with European regulations on personal data protection.',
    controller: {
      title: 'Data controller',
      items: [
        'The data controller is the administrator of the deployed Training Manager instance.',
        'For any question regarding your personal data, contact the administrator of your instance.',
      ],
    },
    collected: {
      title: 'Data collected',
      items: [
        'Identification data: username, email address, first name, last name.',
        'Activity data: teams, programs, sessions, attendance, language preferences.',
        'Technical data: connection logs strictly necessary for security.',
      ],
    },
    basis: {
      title: 'Legal basis and purposes (GDPR Art. 6)',
      items: [
        'Performance of a contract: managing your account, organizing your teams and tracking your sessions.',
        'Legitimate interest: platform security, abuse prevention, service improvement.',
        'Consent: sending optional notifications (revocable at any time).',
      ],
    },
    rights: {
      title: 'Your rights (GDPR Art. 15-22)',
      items: [
        'Right of access: obtain a copy of your personal data.',
        'Right to rectification: correct inaccurate or incomplete data.',
        'Right to erasure: request the deletion of your data.',
        'Right to data portability: receive your data in a structured, readable format.',
        'Right to object: object to processing in certain cases.',
        'Right to lodge a complaint: file a complaint with your national supervisory authority.',
      ],
    },
    retention: {
      title: 'Data retention',
      items: [
        'Account data is retained for the duration of your registration.',
        'Team and session data is retained as long as the team is active.',
        'Upon account deletion, your personal data is deleted or anonymized within 30 days.',
      ],
    },
    security: {
      title: 'Security',
      items: [
        'Communications are encrypted via HTTPS/TLS.',
        'Passwords are hashed using an irreversible algorithm (PBKDF2).',
        'Authentication relies on short-lived JWT tokens.',
      ],
    },
    cookies: {
      title: 'Cookies',
      items: [
        'Training Manager does not use tracking cookies or advertising cookies.',
        'Only strictly necessary technical cookies (session, language preference) are used.',
      ],
    },
  },
  technical: {
    title: 'Technical details',
    lead: 'The project consists of an Angular frontend and a Django backend sharing an OpenAPI contract.',
    repo: {
      title: 'Repository',
      intro: 'Source code, CI and contract artifacts are hosted on GitHub.',
      items: ['Separate repos: trainingmanager_frontend (Angular) and trainingmanager (Django).', 'GitHub Actions CI on both sides.'],
    },
    backend: {
      title: 'Backend',
      intro: 'REST API, business rules and application security.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: 'Single-page app for administration and session access.',
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const NL_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: "Beheer van teams, programma's en trainingen voor coaches: planning, aanwezigheden, opvolging en AI-ondersteunde sessieaanmaak.",
    view_repo: 'Repository bekijken',
  },
  tabs: { company: 'Bedrijf', legal: 'Juridische vermeldingen', technical: 'Technisch' },
  company: {
    title: 'Bedrijf',
    lead: 'Juridische informatie en contactgegevens van het bedrijf dat Training Manager beheert.',
    email_cta: 'Stuur me een e-mail',
    rows: {
      contact: { label: 'Contact', value: 'Renaud Vilain' },
      company: { label: 'Bedrijf', value: 'Foxugly SRL' },
      vat: { label: 'BTW / KBO', value: 'BE 1004.770.045' },
      address: { label: 'Adres', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaarbeek', 'België'] },
      email: { label: 'E-mail' },
      phone: { label: 'Telefoon' },
      website: { label: 'Website' },
    },
  },
  legal: {
    title: 'Juridische vermeldingen en gegevensbescherming',
    lead: 'Training Manager voldoet aan de Europese regelgeving inzake bescherming van persoonsgegevens.',
    controller: {
      title: 'Verwerkingsverantwoordelijke',
      items: [
        'De verwerkingsverantwoordelijke is de beheerder van de ingezette Training Manager-instantie.',
        'Voor vragen over je persoonsgegevens, neem contact op met de beheerder van je instantie.',
      ],
    },
    collected: {
      title: 'Verzamelde gegevens',
      items: [
        'Identificatiegegevens: gebruikersnaam, e-mailadres, voornaam, achternaam.',
        "Activiteitsgegevens: teams, programma's, sessies, aanwezigheden, taalvoorkeuren.",
        'Technische gegevens: verbindingslogs die strikt noodzakelijk zijn voor de beveiliging.',
      ],
    },
    basis: {
      title: 'Rechtsgrond en doeleinden (AVG art. 6)',
      items: [
        'Uitvoering van een overeenkomst: beheer van je account, organisatie van je teams en opvolging van je sessies.',
        'Gerechtvaardigd belang: beveiliging van het platform, misbruikpreventie, verbetering van de dienst.',
        'Toestemming: verzenden van optionele meldingen (op elk moment intrekbaar).',
      ],
    },
    rights: {
      title: 'Je rechten (AVG art. 15-22)',
      items: [
        'Recht op inzage: een kopie van je persoonsgegevens verkrijgen.',
        'Recht op rectificatie: onjuiste of onvolledige gegevens corrigeren.',
        'Recht op wissing: verzoeken om verwijdering van je gegevens.',
        'Recht op gegevensoverdraagbaarheid: je gegevens ontvangen in een gestructureerd, leesbaar formaat.',
        'Recht van bezwaar: bezwaar maken tegen verwerking in bepaalde gevallen.',
        'Recht om een klacht in te dienen: een klacht indienen bij je nationale toezichthoudende autoriteit.',
      ],
    },
    retention: {
      title: 'Bewaring van gegevens',
      items: [
        'Accountgegevens worden bewaard voor de duur van je inschrijving.',
        'Team- en sessiegegevens worden bewaard zolang het team actief is.',
        'Bij verwijdering van een account worden je persoonsgegevens binnen 30 dagen verwijderd of geanonimiseerd.',
      ],
    },
    security: {
      title: 'Beveiliging',
      items: [
        'Communicatie is versleuteld via HTTPS/TLS.',
        'Wachtwoorden worden gehasht met een onomkeerbaar algoritme (PBKDF2).',
        'Authenticatie is gebaseerd op kortlevende JWT-tokens.',
      ],
    },
    cookies: {
      title: 'Cookies',
      items: [
        'Training Manager gebruikt geen tracking- of advertentiecookies.',
        'Alleen strikt noodzakelijke technische cookies (sessie, taalvoorkeur) worden gebruikt.',
      ],
    },
  },
  technical: {
    title: 'Technische details',
    lead: 'Het project bestaat uit een Angular-frontend en een Django-backend die een OpenAPI-contract delen.',
    repo: {
      title: 'Repository',
      intro: 'Broncode, CI en contractartefacten worden gehost op GitHub.',
      items: ['Gescheiden repos: trainingmanager_frontend (Angular) en trainingmanager (Django).', 'GitHub Actions CI aan beide kanten.'],
    },
    backend: {
      title: 'Backend',
      intro: 'REST-API, businessregels en applicatiebeveiliging.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: 'Single-page app voor administratie en toegang tot sessies.',
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const IT_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: 'Gestione di squadre, programmi e sessioni di allenamento per coach: pianificazione, presenze, monitoraggio e generazione assistita da IA delle sessioni.',
    view_repo: 'Vedi il repository',
  },
  tabs: { company: 'Azienda', legal: 'Note legali', technical: 'Tecnico' },
  company: {
    title: 'Azienda',
    lead: 'Informazioni legali e dati di contatto della società che gestisce Training Manager.',
    email_cta: 'Inviami un email',
    rows: {
      contact: { label: 'Contatto', value: 'Renaud Vilain' },
      company: { label: 'Società', value: 'Foxugly SRL' },
      vat: { label: 'P.IVA / BCE', value: 'BE 1004.770.045' },
      address: { label: 'Indirizzo', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaerbeek', 'Belgio'] },
      email: { label: 'Email' },
      phone: { label: 'Telefono' },
      website: { label: 'Sito web' },
    },
  },
  legal: {
    title: 'Note legali e protezione dei dati',
    lead: 'Training Manager rispetta le normative europee in materia di protezione dei dati personali.',
    controller: {
      title: 'Titolare del trattamento',
      items: [
        "Il titolare del trattamento è l'amministratore dell'istanza Training Manager distribuita.",
        "Per qualsiasi domanda sui tuoi dati personali, contatta l'amministratore della tua istanza.",
      ],
    },
    collected: {
      title: 'Dati raccolti',
      items: [
        'Dati di identificazione: nome utente, indirizzo email, nome, cognome.',
        'Dati di attività: squadre, programmi, sessioni, presenze, preferenze di lingua.',
        'Dati tecnici: log di connessione strettamente necessari per la sicurezza.',
      ],
    },
    basis: {
      title: 'Base giuridica e finalità (GDPR art. 6)',
      items: [
        'Esecuzione di un contratto: gestione del tuo account, organizzazione delle squadre e monitoraggio delle sessioni.',
        'Interesse legittimo: sicurezza della piattaforma, prevenzione degli abusi, miglioramento del servizio.',
        'Consenso: invio di notifiche opzionali (revocabile in qualsiasi momento).',
      ],
    },
    rights: {
      title: 'I tuoi diritti (GDPR art. 15-22)',
      items: [
        'Diritto di accesso: ottenere una copia dei tuoi dati personali.',
        'Diritto di rettifica: correggere dati inesatti o incompleti.',
        'Diritto alla cancellazione: richiedere la cancellazione dei tuoi dati.',
        'Diritto alla portabilità: ricevere i tuoi dati in un formato strutturato e leggibile.',
        'Diritto di opposizione: opporti al trattamento in determinati casi.',
        "Diritto di reclamo: presentare un reclamo all'autorità di controllo nazionale.",
      ],
    },
    retention: {
      title: 'Conservazione dei dati',
      items: [
        "I dati dell'account sono conservati per la durata della tua iscrizione.",
        'I dati di squadre e sessioni sono conservati finché la squadra è attiva.',
        "Alla cancellazione di un account, i tuoi dati personali vengono eliminati o anonimizzati entro 30 giorni.",
      ],
    },
    security: {
      title: 'Sicurezza',
      items: [
        'Le comunicazioni sono cifrate tramite HTTPS/TLS.',
        'Le password sono sottoposte a hashing con un algoritmo irreversibile (PBKDF2).',
        "L'autenticazione si basa su token JWT a breve durata.",
      ],
    },
    cookies: {
      title: 'Cookie',
      items: [
        'Training Manager non utilizza cookie di tracciamento o pubblicitari.',
        'Vengono utilizzati solo cookie tecnici strettamente necessari (sessione, preferenza di lingua).',
      ],
    },
  },
  technical: {
    title: 'Dettagli tecnici',
    lead: 'Il progetto è composto da un frontend Angular e un backend Django che condividono un contratto OpenAPI.',
    repo: {
      title: 'Repository',
      intro: 'Codice sorgente, CI e artefatti del contratto sono ospitati su GitHub.',
      items: ['Repo separati: trainingmanager_frontend (Angular) e trainingmanager (Django).', 'CI GitHub Actions su entrambi i lati.'],
    },
    backend: {
      title: 'Backend',
      intro: 'API REST, regole di business e sicurezza applicativa.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: "Single-page app per l'amministrazione e l'accesso alle sessioni.",
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const ES_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: 'Gestión de equipos, programas y sesiones de entrenamiento para coaches: planificación, asistencias, seguimiento y generación de sesiones asistida por IA.',
    view_repo: 'Ver el repositorio',
  },
  tabs: { company: 'Empresa', legal: 'Aviso legal', technical: 'Técnico' },
  company: {
    title: 'Empresa',
    lead: 'Información legal y datos de contacto de la empresa que gestiona Training Manager.',
    email_cta: 'Enviarme un correo',
    rows: {
      contact: { label: 'Contacto', value: 'Renaud Vilain' },
      company: { label: 'Empresa', value: 'Foxugly SRL' },
      vat: { label: 'IVA / BCE', value: 'BE 1004.770.045' },
      address: { label: 'Dirección', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaerbeek', 'Bélgica'] },
      email: { label: 'Correo' },
      phone: { label: 'Teléfono' },
      website: { label: 'Sitio web' },
    },
  },
  legal: {
    title: 'Aviso legal y protección de datos',
    lead: 'Training Manager cumple con las normativas europeas en materia de protección de datos personales.',
    controller: {
      title: 'Responsable del tratamiento',
      items: [
        'El responsable del tratamiento es el administrador de la instancia desplegada de Training Manager.',
        'Para cualquier consulta sobre tus datos personales, ponte en contacto con el administrador de tu instancia.',
      ],
    },
    collected: {
      title: 'Datos recopilados',
      items: [
        'Datos de identificación: nombre de usuario, dirección de correo electrónico, nombre, apellidos.',
        'Datos de actividad: equipos, programas, sesiones, asistencias, preferencias de idioma.',
        'Datos técnicos: registros de conexión estrictamente necesarios para la seguridad.',
      ],
    },
    basis: {
      title: 'Base legal y finalidades (RGPD art. 6)',
      items: [
        'Ejecución de un contrato: gestión de tu cuenta, organización de tus equipos y seguimiento de tus sesiones.',
        'Interés legítimo: seguridad de la plataforma, prevención de abusos, mejora del servicio.',
        'Consentimiento: envío de notificaciones opcionales (revocable en cualquier momento).',
      ],
    },
    rights: {
      title: 'Tus derechos (RGPD art. 15-22)',
      items: [
        'Derecho de acceso: obtener una copia de tus datos personales.',
        'Derecho de rectificación: corregir datos inexactos o incompletos.',
        'Derecho de supresión: solicitar la eliminación de tus datos.',
        'Derecho a la portabilidad: recibir tus datos en un formato estructurado y legible.',
        'Derecho de oposición: oponerte al tratamiento en determinados casos.',
        'Derecho de reclamación: presentar una reclamación ante tu autoridad de control nacional.',
      ],
    },
    retention: {
      title: 'Conservación de datos',
      items: [
        'Los datos de cuenta se conservan durante la duración de tu inscripción.',
        'Los datos de equipos y sesiones se conservan mientras el equipo esté activo.',
        'Al eliminar una cuenta, tus datos personales se eliminan o anonimizan en un plazo de 30 días.',
      ],
    },
    security: {
      title: 'Seguridad',
      items: [
        'Las comunicaciones están cifradas mediante HTTPS/TLS.',
        'Las contraseñas se cifran con un algoritmo irreversible (PBKDF2).',
        'La autenticación se basa en tokens JWT de corta duración.',
      ],
    },
    cookies: {
      title: 'Cookies',
      items: [
        'Training Manager no utiliza cookies de seguimiento ni publicitarias.',
        'Solo se utilizan cookies técnicas estrictamente necesarias (sesión, preferencia de idioma).',
      ],
    },
  },
  technical: {
    title: 'Detalles técnicos',
    lead: 'El proyecto consta de un frontend Angular y un backend Django que comparten un contrato OpenAPI.',
    repo: {
      title: 'Repositorio',
      intro: 'Código fuente, CI y artefactos del contrato se alojan en GitHub.',
      items: ['Repos separados: trainingmanager_frontend (Angular) y trainingmanager (Django).', 'CI GitHub Actions en ambos lados.'],
    },
    backend: {
      title: 'Backend',
      intro: 'API REST, reglas de negocio y seguridad de la aplicación.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: 'Single-page app para la administración y el acceso a las sesiones.',
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const FR = build(FR_CONTENT);
const EN = build(EN_CONTENT);
const NL = build(NL_CONTENT);
const IT = build(IT_CONTENT);
const ES = build(ES_CONTENT);

const UI_TEXT: Record<LanguageCode, AboutPageUiText> = { fr: FR, en: EN, nl: NL, it: IT, es: ES };

export function getAboutPageUiText(lang: LanguageCode): AboutPageUiText {
  return UI_TEXT[lang] ?? EN;
}
```

### Step 6.3 — Write the about-page spec (TDD)

Create `src/app/features/about-page/about-page.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as contact from '../../shared/contact';
import { LanguageService } from '../../core/i18n/language.service';
import { AboutPageComponent } from './about-page.component';

describe('AboutPageComponent', () => {
  let fixture: ComponentFixture<AboutPageComponent>;

  async function setup(initialLang: 'fr' | 'en' | 'nl' | 'it' | 'es' = 'fr') {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AboutPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: LanguageService, useValue: { activeLang: signal(initialLang).asReadonly() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AboutPageComponent);
    fixture.detectChanges();
  }

  it('renders intro + content sections with their data-slug', async () => {
    await setup();
    const slugs = Array.from(fixture.nativeElement.querySelectorAll('section.about-section'))
      .map((s) => (s as HTMLElement).getAttribute('data-slug'));
    expect(slugs).toEqual(['intro', 'content']);
  });

  it('renders the view-repo link with target=_blank, rel=noopener noreferrer', async () => {
    await setup();
    const link = fixture.nativeElement.querySelector('a.about-repo') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://github.com/Foxugly/trainingmanager_frontend');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders 3 tabs in order: company / legal / technical', async () => {
    await setup();
    const tabHeaders = fixture.nativeElement.querySelectorAll('p-tab');
    expect(tabHeaders.length).toBe(3);
  });

  it('default active tab is "company"', async () => {
    await setup();
    const c = fixture.componentInstance as unknown as { activeTab: { (): string } };
    expect(c.activeTab()).toBe('company');
  });

  it('Company tab: displays the email obfuscated and never as raw "@"', async () => {
    await setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('rvilain [at] foxugly [dot] com');
    expect(text).not.toMatch(/rvilain@foxugly\.com/);
  });

  it('Company tab: clicking the email CTA invokes openContactEmail("Training Manager")', async () => {
    const spy = vi.spyOn(contact, 'openContactEmail').mockImplementation(() => undefined);
    await setup();
    const btn = fixture.nativeElement.querySelector('button.email-cta') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(spy).toHaveBeenCalledWith('Training Manager');
    spy.mockRestore();
  });

  it('Company tab: phone displayed as "+32 478 811988"', async () => {
    await setup();
    expect(fixture.nativeElement.textContent).toContain('+32 478 811988');
  });

  it('Company tab: website link with WEBSITE_URL, target=_blank, rel=noopener noreferrer', async () => {
    await setup();
    const links = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    const site = links.find((a) => a.getAttribute('href') === 'https://www.foxugly.com');
    expect(site).toBeDefined();
    expect(site?.getAttribute('target')).toBe('_blank');
    expect(site?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('Legal tab content appears after switching activeTab to "legal"', async () => {
    await setup();
    const c = fixture.componentInstance as unknown as { activeTab: { set: (v: 'company' | 'legal' | 'technical') => void } };
    c.activeTab.set('legal');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Responsable du traitement');
    expect(text).toContain('Données collectées');
    expect(text).toContain('Cookies');
  });

  it('Technical tab content appears after switching activeTab to "technical"', async () => {
    await setup();
    const c = fixture.componentInstance as unknown as { activeTab: { set: (v: 'company' | 'legal' | 'technical') => void } };
    c.activeTab.set('technical');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Dépôt');
    expect(text).toContain('Backend');
    expect(text).toContain('Frontend');
  });
});
```

- [ ] **Step 6.3.1 — Run; confirm failure**

Run: `npm test -- src/app/features/about-page/about-page.component.spec.ts`
Expected: FAIL — `AboutPageComponent` does not exist.

### Step 6.4 — Create the component class

Create `src/app/features/about-page/about-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { LanguageService } from '../../core/i18n/language.service';
import {
  WEBSITE_URL,
  WEBSITE_DISPLAY,
  emailDisplay,
  phoneDisplay,
  openContactEmail,
} from '../../shared/contact';
import { AboutTab, getAboutPageUiText } from './about-page.text';

@Component({
  selector: 'app-about-page',
  imports: [Tabs, TabList, Tab, TabPanels, TabPanel],
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPageComponent {
  private readonly languageService = inject(LanguageService);

  protected readonly frontendRepoUrl = 'https://github.com/Foxugly/trainingmanager_frontend';
  protected readonly websiteUrl = WEBSITE_URL;
  protected readonly websiteDisplay = WEBSITE_DISPLAY;
  protected readonly emailDisplay = emailDisplay;
  protected readonly phoneDisplay = phoneDisplay;
  protected readonly activeTab = signal<AboutTab>('company');
  protected readonly ui = computed(() => getAboutPageUiText(this.languageService.activeLang()));

  protected onEmailClick(): void {
    openContactEmail('Training Manager');
  }
}
```

### Step 6.5 — Create the template

Create `src/app/features/about-page/about-page.component.html`:

```html
<article class="about-page">
  <section class="about-section" data-slug="intro">
    <div class="about-section-inner">
      <h1>{{ ui().intro.title }}</h1>
      <p class="lead">{{ ui().intro.lead }}</p>
      <a [href]="frontendRepoUrl" target="_blank" rel="noopener noreferrer" class="about-repo">
        <i class="pi pi-github" aria-hidden="true"></i>
        {{ ui().intro.view_repo }}
        <i class="pi pi-external-link" aria-hidden="true"></i>
      </a>
    </div>
  </section>

  <section class="about-section" data-slug="content">
    <div class="about-section-inner">
      <p-tabs [(value)]="activeTab">
        <p-tablist>
          <p-tab value="company">
            <i class="pi pi-building" aria-hidden="true"></i>
            <span>{{ ui().tabs.company }}</span>
          </p-tab>
          <p-tab value="legal">
            <i class="pi pi-shield" aria-hidden="true"></i>
            <span>{{ ui().tabs.legal }}</span>
          </p-tab>
          <p-tab value="technical">
            <i class="pi pi-code" aria-hidden="true"></i>
            <span>{{ ui().tabs.technical }}</span>
          </p-tab>
        </p-tablist>

        <p-tabpanels>
          <p-tabpanel value="company">
            <article class="tab-content">
              <h2>{{ ui().company.title }}</h2>
              <p class="lead">{{ ui().company.lead }}</p>
              <dl class="about-dl">
                @for (row of ui().company.rows; track row.key) {
                  <dt>{{ row.label }}</dt>
                  <dd>
                    @switch (row.kind) {
                      @case ('text') { <span>{{ row.value }}</span> }
                      @case ('multiline') {
                        @for (line of row.lines; track $index) {
                          <span class="dd-line">{{ line }}</span>
                        }
                      }
                      @case ('email') {
                        <span class="email-display">{{ emailDisplay() }}</span>
                        <button type="button" class="email-cta" (click)="onEmailClick()">
                          <i class="pi pi-envelope" aria-hidden="true"></i>
                          <span>{{ ui().company.email_cta }}</span>
                        </button>
                      }
                      @case ('phone') { <span>{{ phoneDisplay() }}</span> }
                      @case ('website') {
                        <a [href]="websiteUrl" target="_blank" rel="noopener noreferrer">
                          {{ websiteDisplay }}
                        </a>
                      }
                    }
                  </dd>
                }
              </dl>
            </article>
          </p-tabpanel>

          <p-tabpanel value="legal">
            <article class="tab-content">
              <h2>{{ ui().legal.title }}</h2>
              <p class="lead">{{ ui().legal.lead }}</p>
              @for (sec of ui().legal.sections; track sec.slug) {
                <section class="sub-section">
                  <h3>{{ sec.title }}</h3>
                  <ul>
                    @for (item of sec.items; track $index) {
                      <li>{{ item }}</li>
                    }
                  </ul>
                </section>
              }
            </article>
          </p-tabpanel>

          <p-tabpanel value="technical">
            <article class="tab-content">
              <h2>{{ ui().technical.title }}</h2>
              <p class="lead">{{ ui().technical.lead }}</p>
              @for (sec of ui().technical.sections; track sec.slug) {
                <section class="sub-section">
                  <h3>{{ sec.title }}</h3>
                  <p>{{ sec.intro }}</p>
                  <ul>
                    @for (item of sec.items; track $index) {
                      <li>{{ item }}</li>
                    }
                  </ul>
                </section>
              }
            </article>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </div>
  </section>
</article>
```

### Step 6.6 — Create the SCSS

Create `src/app/features/about-page/about-page.component.scss`:

```scss
:host {
  display: block;
}

.about-page {
  margin: -1.5rem;
}

.about-section {
  padding: 3rem 1.5rem;

  &:nth-of-type(odd) { background: #ffffff; }
  &:nth-of-type(even) { background: #f8fafc; }
}

.about-section-inner {
  max-width: 64rem;
  margin: 0 auto;
}

.about-section[data-slug='intro'] h1 {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #0f172a;
}

.about-section h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #0f172a;
}

.lead {
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.6;
  margin-top: 0.5rem;
}

.about-repo {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding: 0.5rem 1rem;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  color: #374151;
  text-decoration: none;
  transition: border-color 0.15s ease, color 0.15s ease;

  &:hover { border-color: #818cf8; color: #4338ca; }
}

.tab-content {
  padding: 1.25rem 0.25rem;
}

.about-dl {
  display: grid;
  grid-template-columns: 1fr;
  row-gap: 0.75rem;
  margin-top: 1rem;

  dt {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
    padding-top: 0.25rem;
  }

  dd {
    color: #1e293b;
    margin: 0 0 0.5rem;
  }

  .dd-line {
    display: block;
  }

  @media (min-width: 640px) {
    grid-template-columns: 8rem 1fr;
    column-gap: 1.5rem;
    row-gap: 0.5rem;

    dd { margin-bottom: 0.25rem; }
  }
}

.email-display {
  font-family: ui-monospace, SFMono-Regular, monospace;
  margin-right: 0.75rem;
}

.email-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: #0f172a;
  color: #fff;
  border: 0;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover { background: #1e293b; }
}

.sub-section {
  margin-top: 1.5rem;

  h3 {
    font-size: 0.95rem;
    font-weight: 600;
    color: #0f172a;
    margin: 0 0 0.5rem;
  }

  p {
    color: #475569;
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }

  ul {
    margin: 0;
    padding-left: 1.25rem;
    color: #334155;
    font-size: 0.85rem;
    line-height: 1.6;
  }
}
```

### Step 6.7 — Wire the route

In `src/app/app.routes.ts`, locate the `PublicLayoutComponent` children block. Add the `/about` route between `features` and `contribute`:

Use Edit with `old_string`:
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

…and `new_string`:
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

### Step 6.8 — Run the spec; confirm pass

- [ ] Run: `npm test -- src/app/features/about-page/about-page.component.spec.ts`
- Expected: PASS, 10 tests green.

### Step 6.9 — Commit

```bash
git add src/app/features/about-page src/app/app.routes.ts public/i18n
git commit -m "feat(about): /about page with 3 tabs (Company / Legal / Technical)

Company tab consumes shared/contact.ts — emailDisplay() obfuscation,
mailto launched on click via openContactEmail(). Legal & Technical
sub-sections rendered from ui()-based factorized i18n. Default tab is
'company'. Topmenu nav already exposes /about; route wired here.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Final verification

### Step 7.1 — Run the full suite

- [ ] Run: `npm test -- --run`
- Expected: PASS, no regressions.

### Step 7.2 — Type-check

- [ ] Run: `npx tsc --noEmit -p tsconfig.json`
- Expected: exit 0.

### Step 7.3 — Production build

- [ ] Run: `npm run build`
- Expected: SUCCESS within the 1 MB warning / 1.5 MB error budget. The new components add a few kB of template + scoped SCSS; bundles `Tabs` already shipped (events-detail uses it).

### Step 7.4 — Manual smoke

- [ ] Run: `npm start`
- [ ] Visit `http://localhost:4200/`. Verify:
  - Topbar is the new `app-topmenu` (sticky on scroll, dark gradient kept).
  - Lang switcher: globe + uppercase code, opens dropdown with check on active.
  - Resize browser to ≤ 960 px → desktop nav + actions hide; hamburger appears; toggling reveals the white drawer.
  - Click a link in the drawer → drawer closes (NavigationEnd).
  - Esc key while drawer open → closes.
  - Click outside while drawer open → closes.
- [ ] Visit `/contribute`. Verify:
  - 4 sections (intro, reasons, donate, thanks), alternating white / `#f8fafc` background.
  - 4 reason cards, with the colored icon pills (sky/emerald/amber/rose).
  - Sponsors CTA opens `https://github.com/sponsors/Foxugly` in a new tab.
  - No remnant of the old hero/backdrop.
- [ ] Visit `/about`. Verify:
  - Intro section with title + lead + outline `Voir le dépôt` button.
  - 3 tabs visible: Société (active) / Mentions légales / Technique.
  - Société tab: 7 `<dl>` rows; email shown as `rvilain [at] foxugly [dot] com`; clicking « Envoyez-moi un email » opens the OS mail client (verify in browser network/dev console — `mailto:` triggered).
  - Phone shows `+32 478 811988`. Website is a clickable link to `www.foxugly.com` opening in a new tab.
  - Switching to Mentions légales → 7 RGPD sub-sections render. Switching to Technique → 3 stack sub-sections render.
- [ ] Visit `/dashboard` (logged-in mode if you have a test account, else just verify the layout renders the topmenu in `mode="authenticated"` via DevTools — nav links should be Dashboard/Teams/Programs/Events).

### Step 7.5 — End

If anything looks off, open follow-up tasks rather than silently patching. The branch is ready for PR.

---

## Self-review

**Spec coverage:**
- `shared/contact.ts` → Task 1 ✓
- `app-footer` → Task 2 ✓
- `app-topmenu` (mode-driven, hamburger 960 px, NavigationEnd close, click outside, Esc) → Task 3 ✓
- Lang switcher refactor → Task 4 ✓
- `/contribute` no-hero + sections + ui()-i18n → Task 5 ✓
- `/about` no-hero + sections + 3 tabs incl. Company `<dl>` consuming `shared/contact.ts` → Task 6 ✓
- Verification → Task 7 ✓

**Placeholder scan:** none. All `_CONTENT` consts spelled out for all 5 languages. All test bodies complete.

**Type consistency:**
- `LanguageSwitcherComponent`: `open()`, `toggle()`, `close()`, `select(code)`, `current()`, `languages` — same in component, template, spec.
- `TopmenuComponent`: `mode` (input), `mobileMenuOpen` (signal), `toggleMobile`, `closeMobile`, `onDocumentClick` — consistent across spec/component/template.
- `AboutPageComponent`: `activeTab: WritableSignal<AboutTab>`, `ui = computed(...)`, `frontendRepoUrl`, `websiteUrl`/`websiteDisplay`, `emailDisplay`/`phoneDisplay`, `onEmailClick()` — used as imported & assigned consistently.
- `ContributePageComponent`: `sponsorsUrl`, `ui = computed(...)` — consistent.

**i18n key consistency:**
- New Transloco keys: `common.language_switcher.aria`, `topmenu.open`, `topmenu.close`, `app.tagline`, `footer.author`, `footer.version_label`, `public.nav.about` — all added in 5 catalogs.
- Removed: `contribute_page.*` block (orphaned post-migration).
- ui()-factorized strings: `contribute-page.text.ts` and `about-page.text.ts` — full content in all 5 languages with `getXxxUiText(lang)` falling back to EN.

**Commits:** 6 (one per implementation task) + 0 for verification.
