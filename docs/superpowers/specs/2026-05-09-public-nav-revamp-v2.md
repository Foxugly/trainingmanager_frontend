# Public navigation revamp — Topmenu, Footer, /about, /contribute, Lang switcher (v2)

**Date:** 2026-05-09
**Supersedes:** `2026-05-09-contribute-about-langswitcher-design.md` (v1) and its plan `2026-05-09-public-nav-revamp.md`. The earlier plan was not executed; v2 absorbs every requirement from v1 and refits it on the QuizOnline-style conventions adopted on the same day.

## Why v2

Mid-execution of v1, the user adopted a set of layout conventions inherited from QuizOnline (saved as `feedback_layout_conventions.md` in auto-memory). They invalidate v1's assumptions:

- The topbar must live in a dedicated `app-topmenu` component (sticky on `:host`, hamburger ≤ 960 px), not inline in each layout.
- A new `app-footer` component (~35 px line) replaces the inline footer in `PublicLayoutComponent`.
- Public pages (other than the landing `/`) skip the styled hero — content sections start directly.
- Multi-section pages factor i18n into TS `SECTION_DEFS` + per-language `XX_CONTENT` + `getXxxUiText(lang)` getter (with EN fallback), not Transloco JSON.
- Tabs use `[(value)]="activeTab"` (2-way), not `[value]` + `(valueChange)`.
- Live demo at `localhost:4200/about` revealed a 3-tab structure (Company / Legal / Technical) with a contact-information `<dl>`. v2 embeds the same.

## 1. `shared/contact.ts` — anti-spam contact util

**Path:** `src/app/shared/contact.ts` (new file).

**Purpose:** Centralize the company's email/phone/website so the address never appears as raw `<a href="mailto:…">` or `user@host` in the DOM (anti-spam crawler hardening).

**API:**

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

**Tests** (`shared/contact.spec.ts`):
- `emailDisplay()` returns `'rvilain [at] foxugly [dot] com'`.
- `phoneDisplay()` returns `'+32 478 811988'`.
- `openContactEmail('Training Manager')` sets `window.location.href` to `'mailto:rvilain@foxugly.com?subject=Training+Manager'`. Stub `window.location` (vitest's `vi.spyOn` on a getter or assign a writable mock).

## 2. `app-topmenu` — extracted topbar component

**Path:** `src/app/core/layout/topmenu/topmenu.component.{ts,html,scss,spec.ts}` (new).

### Surface

- Standalone Angular component, OnPush, signals.
- One `mode` input controlling which nav links to render: `mode = input<'public' | 'authenticated'>('public')`.
- Hosts `app-language-switcher` and `app-user-menu` on the right side, regardless of mode.
- Sticky via `:host { position: sticky; top: 0; z-index: 50; }` — the convention is explicit that sticky must NOT be on the inner `<header>`/`.topbar` wrapper.
- Background gradient kept identical to the current inline topbar:
  `background: linear-gradient(135deg,#082f49fa,#0f172af5),linear-gradient(90deg,#38bdf82e,#10b9811f);`
- Padding: desktop `0.45rem 1.1rem`, `min-height: 60px`. ≤ 960 px → `0.4rem 0.85rem` / `min-height: 56px`. ≤ 480 px → `0.35rem 0.7rem`.
- Brand mark size: 42×42 desktop, 36×36 ≤ 480 px.
- Nav links: `gap: 0.1rem`, link padding `0.45rem 0.7rem`, font `0.9rem`.

### Mode → links

- `mode === 'public'` → links: Home (`/`), Features (`/features`), About (`/about`), Contribute (`/contribute`).
- `mode === 'authenticated'` → links: Dashboard, Teams, Programs, Events, plus Admin if `is_staff`.

The active-link styling is the same in both modes: `text-white font-semibold` on `routerLinkActive`, `text-slate-200 hover:text-white` otherwise.

### Hamburger drawer ≤ 960 px

- Convention: 960 px breakpoint via CSS media query — **not** Tailwind's `md:` (768 px) — because we need to override Tailwind's defaults locally.
- State: `mobileMenuOpen = signal(false)`.
- Toggle button (replaces the desktop nav row) with dynamic `aria-expanded` and `aria-label` (i18n keys `topmenu.open` / `topmenu.close`).
- **Closes on**:
  - `NavigationEnd` — subscribe to `Router.events` in the constructor with `takeUntilDestroyed()`.
  - Click outside the host header — `host: { '(document:click)': 'onDocumentClick($event)' }` checks `!this.elementRef.nativeElement.contains(target)`.
  - `Escape` keypress — `host: { '(document:keydown.escape)': 'closeMobile()' }`.
- Drawer contents: nav links + actions (lang switcher + user menu) stacked vertically inside a white panel.

### Consumers

- `MainLayoutComponent` renders `<app-topmenu mode="authenticated" />`.
- `PublicLayoutComponent` renders `<app-topmenu mode="public" />`.

Both layouts shrink to the bare minimum: `<app-topmenu>`, `<router-outlet>`, plus `<app-footer>` (PublicLayout only) and `<p-toast>` (MainLayout only).

### Tests

- `topmenu.component.spec.ts`:
  - Default `mode` is `'public'`.
  - When `mode === 'public'`, renders the 4 public nav keys (`public.nav.home`, `…features`, `…about`, `…contribute`).
  - When `mode === 'authenticated'`, renders the dashboard/teams/programs/events keys; renders Admin only when `AuthService.currentUser()?.is_staff` is true.
  - `mobileMenuOpen` starts `false`; `toggleMobile()` flips it; `closeMobile()` forces `false`.
  - `onDocumentClick` with a target outside `elementRef.nativeElement` while open → closes; while closed → no-op.
  - `NavigationEnd` from a stubbed `Router.events` subject → closes if open.
  - The host element styles include `position: sticky; top: 0` (assert via `getComputedStyle`).

## 3. `app-footer` — extracted footer component

**Path:** `src/app/core/layout/footer/footer.component.{ts,html,scss,spec.ts}` (new).

### Surface

- Single-line `flex flex-wrap`: `Brand · baseline · version · author · ©year`.
- Brand text bold; baseline gray; version/author/year light gray; separators `·` in `#cbd5e1`.
- Background `#f8fafc`; `border-top: 1px solid #e2e8f0`.
- Target height ~ 35 px (`padding: 0.5rem 1rem`).
- No PrimeNG, just Tailwind utilities + a tiny SCSS file for the separator color and the version layout.
- Version comes from a single hard-coded const for now (`APP_VERSION = '0.1.0'`) in `app/shared/app-version.ts` (new) — TODO future: wire to `package.json` via build-time injection.

### i18n

Reuses existing keys plus 2 new:
- `app.title` (existing).
- `app.tagline` (existing in `home.hero.subtitle`? — to verify. If not, create `app.tagline`).
- `footer.author` = `"Foxugly"` (untranslated, but key used for consistency).
- `footer.version_label` = `"Version"` (translated).

### Tests

- Renders brand, tagline, version, author, year.
- Year resolves to `new Date().getFullYear()` (compute in the component to avoid the template-globals anti-pattern from CLAUDE.md).
- Has the `border-top` style.

## 4. Language switcher — compact globe trigger (already in v1, embedded in topmenu)

Same as v1:
- Trigger: `pi-globe` + uppercase active code (`FR` / `EN` / …) + `pi-chevron-down`.
- Dropdown: 5 rows, each `code chip + native name + check on active`.
- Closes on outside click (`document:click`) and Escape.
- `select(code)` calls `LanguageService.switchLanguage(code)`; error toast on failure.
- `select()` is a no-op when picking the active language.

Now embedded inside `<app-topmenu>` (right side of the header).

i18n key added: `common.language_switcher.aria` in 5 locales.

## 5. `/contribute` revamp — no hero, sections

**Path:** `src/app/features/contribute-page/contribute-page.component.{ts,html,scss,spec.ts}` (modified) + `src/app/features/contribute-page/contribute-page.text.ts` (new).

### Layout

```html
<article class="contribute-page">
  <section class="contribute-section" data-slug="intro">
    <h1>{{ ui().intro.title }}</h1>
    <p>{{ ui().intro.lead }}</p>
  </section>

  <section class="contribute-section" data-slug="reasons">
    <h2>{{ ui().reasons.title }}</h2>
    <div class="contribute-grid">
      @for (reason of ui().reasons.items; track reason.slug) {
        <article class="contribute-card" [attr.data-slug]="reason.slug">
          <i class="pi" [ngClass]="reason.icon"></i>
          <h3>{{ reason.title }}</h3>
          <p>{{ reason.body }}</p>
        </article>
      }
    </div>
  </section>

  <section class="contribute-section" data-slug="donate">
    <h2>{{ ui().donate.title }}</h2>
    <p>{{ ui().donate.intro }}</p>
    <a [href]="sponsorsUrl" target="_blank" rel="noopener noreferrer" class="donate-cta">
      <i class="pi pi-heart-fill"></i>
      {{ ui().donate.cta }}
      <i class="pi pi-external-link"></i>
    </a>
    <p class="donate-redirect-note">{{ ui().donate.redirect_note }}</p>
  </section>

  <section class="contribute-section" data-slug="thanks">
    <h2>{{ ui().thanks.title }}</h2>
    <p>{{ ui().thanks.body }}</p>
  </section>
</article>
```

### Styling

- `<article class="contribute-page">` with `margin: -1.5rem` to escape the parent `.main-container` 24 px padding (matches the convention).
- Sections alternate `nth-of-type(odd)` white / `nth-of-type(even)` `#f8fafc` background.
- Per-section accent via `:host { --badge-bg / --badge-color }` selected by `.contribute-section[data-slug='reasons']`, etc.
- Reason grid: `grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr))`.
- Donate CTA: gradient `from-rose-500 to-pink-500` button (kept from v1).

### TS

```ts
@Component({
  selector: 'app-contribute-page',
  imports: [NgClass],
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

### `contribute-page.text.ts`

```ts
import { LanguageCode } from '../../core/i18n/available-languages';

export interface ContributePageUiText {
  intro: { title: string; lead: string };
  reasons: {
    title: string;
    items: ReadonlyArray<{ slug: string; icon: string; title: string; body: string }>;
  };
  donate: { title: string; intro: string; cta: string; redirect_note: string };
  thanks: { title: string; body: string };
}

const REASON_DEFS = [
  { slug: 'oss', icon: 'pi-code' },
  { slug: 'hosting', icon: 'pi-server' },
  { slug: 'maintenance', icon: 'pi-shield' },
  { slug: 'features', icon: 'pi-sparkles' },
] as const;

interface ReasonContent { title: string; body: string }
type ReasonsContent = Record<typeof REASON_DEFS[number]['slug'], ReasonContent>;

interface ContributeContent {
  intro: { title: string; lead: string };
  reasons: { title: string; items: ReasonsContent };
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

const FR_CONTENT: ContributeContent = { /* … cf. v1 keys traduction par langue … */ };
const EN_CONTENT: ContributeContent = { /* … */ };
const NL_CONTENT: ContributeContent = { /* … */ };
const IT_CONTENT: ContributeContent = { /* … */ };
const ES_CONTENT: ContributeContent = { /* … */ };

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

(Translations come from v1's catalog patches — the actual strings are reused verbatim. The implementation plan will spell out each `_CONTENT` const in full.)

### i18n cleanup

After migration, remove the `contribute_page.*` block from each of `public/i18n/{fr,nl,en,it,es}.json` (they become orphan keys per the cleanup discipline rule).

### Tests

`contribute-page.component.spec.ts`:
- 4 sections rendered in order with their `data-slug`.
- 4 reason cards rendered, in `REASON_DEFS` order.
- Sponsors CTA: `target="_blank"`, `rel="noopener noreferrer"`, href is `https://github.com/sponsors/Foxugly`.
- The component reads from `LanguageService.activeLang()` — when the signal flips from `fr` to `en` (provider stub), the rendered title changes accordingly (smoke test of the language reactivity).
- No `contribute_page.*` Transloco key is referenced anywhere in the rendered HTML.

## 6. `/about` — new page, 3 tabs, no hero

**Path:** `src/app/features/about-page/about-page.component.{ts,html,scss,spec.ts}` (new) + `src/app/features/about-page/about-page.text.ts` (new).

### Layout

```html
<article class="about-page">
  <section class="about-section" data-slug="intro">
    <h1>{{ ui().intro.title }}</h1>
    <p>{{ ui().intro.lead }}</p>
    <a [href]="frontendRepoUrl" target="_blank" rel="noopener noreferrer" class="about-repo">
      <i class="pi pi-github"></i>
      {{ ui().intro.view_repo }}
      <i class="pi pi-external-link"></i>
    </a>
  </section>

  <section class="about-section" data-slug="content">
    <p-tabs [(value)]="activeTab">
      <p-tablist>
        <p-tab value="company">
          <i class="pi pi-building" aria-hidden="true"></i>
          {{ ui().tabs.company }}
        </p-tab>
        <p-tab value="legal">
          <i class="pi pi-shield" aria-hidden="true"></i>
          {{ ui().tabs.legal }}
        </p-tab>
        <p-tab value="technical">
          <i class="pi pi-code" aria-hidden="true"></i>
          {{ ui().tabs.technical }}
        </p-tab>
      </p-tablist>

      <p-tabpanels>
        <p-tabpanel value="company">
          <article class="tab-content">
            <h2>{{ ui().company.title }}</h2>
            <p>{{ ui().company.lead }}</p>
            <dl class="about-dl">
              @for (row of ui().company.rows; track row.key) {
                <dt>{{ row.label }}</dt>
                <dd>
                  @switch (row.kind) {
                    @case ('text') { {{ row.value }} }
                    @case ('multiline') {
                      @for (line of row.lines; track $index) {
                        <span>{{ line }}</span>
                      }
                    }
                    @case ('email') {
                      <span class="email-display">{{ emailDisplay() }}</span>
                      <button type="button" class="email-cta" (click)="onEmailClick()">
                        <i class="pi pi-envelope"></i>
                        {{ ui().company.email_cta }}
                      </button>
                    }
                    @case ('phone') { {{ phoneDisplay() }} }
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
          <article class="tab-content">…</article>
        </p-tabpanel>

        <p-tabpanel value="technical">
          <article class="tab-content">…</article>
        </p-tabpanel>
      </p-tabpanels>
    </p-tabs>
  </section>
</article>
```

### TS

```ts
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
  protected readonly activeTab = signal<'company' | 'legal' | 'technical'>('company');
  protected readonly ui = computed(() => getAboutPageUiText(this.languageService.activeLang()));

  protected onEmailClick(): void {
    openContactEmail('Training Manager');
  }
}
```

### Company tab — `<dl>` rows

7 rows, all from i18n labels except the values themselves which come from `shared/contact.ts` constants (or hard-coded i18n strings):

| key | label (i18n) | value source |
|---|---|---|
| `contact` | `company.contact` (« Contact ») | i18n value: `"Renaud Vilain"` |
| `company` | `company.company` (« Société ») | i18n value: `"Foxugly SRL"` |
| `vat` | `company.vat` (« TVA / BCE ») | i18n value: `"BE 1004.770.045"` |
| `address` | `company.address` (« Adresse ») | i18n multiline: `["rue Nicolas Defrêcheux 22", "1030 Schaerbeek", "Belgique"]` |
| `email` | `company.email` (« Email ») | `emailDisplay()` + button calling `openContactEmail('Training Manager')` |
| `phone` | `company.phone` (« Téléphone ») | `phoneDisplay()` |
| `website` | `company.website` (« Site ») | `<a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer">{WEBSITE_DISPLAY}</a>` |

The text constants for the `multiline` address (which arguably *could* be language-independent — `Belgique` vs `Belgium` differs) live in each `_CONTENT` to support translating "Belgique" / "Belgium" / "België" / "Belgio" / "Bélgica".

### Legal & Technical tabs

Same content blocks as v1 spec — 7 sub-sections under Legal (RGPD-style) and 3 sub-sections under Technical (Repo, Backend, Frontend stacks). Strings absorbed verbatim from v1's i18n patches into the new `_CONTENT` consts.

### Styling

- `<article class="about-page">` with `margin: -1.5rem`.
- `intro` section: simple title + lead + outline repo button. No backdrop gradient.
- `content` section alternates background per the convention. p-tabs lives inside a white card.
- `<dl>` styling: 2-column on `≥ 640 px` (term left, definition right via `grid-template-columns: 8rem 1fr`), stacked below.
- Term style: `font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #475569;`.
- Email CTA button: dark pill (`bg-slate-900 text-white rounded-full px-3 py-1`).

### Tests

`about-page.component.spec.ts`:
- Renders 2 sections (intro + content) with `data-slug`.
- 3 tabs: company / legal / technical, in that order.
- Default active tab is `'company'`.
- Company tab: 7 `<dt>` elements, with the email displayed via `emailDisplay()` (assertion: `'rvilain [at] foxugly [dot] com'` appears, raw `'@'` + email does NOT appear).
- Email CTA button click → `openContactEmail('Training Manager')` is called (spy on the imported function).
- Phone displayed via `phoneDisplay()` (assertion: `'+32 478 811988'`).
- Website link present, `target="_blank"`, `rel="noopener noreferrer"`, href = `WEBSITE_URL`.
- Switch tab to legal → renders the 7 RGPD sub-sections.
- Switch tab to technical → renders the 3 stack sections.
- View-repo link target/rel correct, href = `frontendRepoUrl`.

### Route

`src/app/app.routes.ts` — add under the `PublicLayoutComponent` children, between `features` and `contribute`:

```ts
{
  path: 'about',
  loadComponent: () =>
    import('./features/about-page/about-page.component').then((m) => m.AboutPageComponent),
},
```

### Topmenu nav addition

`app-topmenu` must include the About link in its `mode === 'public'` nav (between Features and Contribute). The link key is `public.nav.about` (already provisioned in v1 i18n; reused).

## 7. Tests inventory

- `shared/contact.spec.ts` (new) — util tests.
- `topmenu.component.spec.ts` (new) — sticky :host, mode-driven nav, hamburger, NavigationEnd close, click-outside close.
- `footer.component.spec.ts` (new) — single line + style + year.
- `language-switcher.component.spec.ts` (modified — same as v1).
- `contribute-page.component.spec.ts` (modified) — sections + reasons items + sponsors CTA + ui-i18n reactivity.
- `about-page.component.spec.ts` (new) — 3 tabs + company `<dl>` + email anti-spam + repo link.
- `public-layout.component.spec.ts` (modified) — now just asserts `<app-topmenu mode="public">` and `<app-footer>` are rendered (the inline header/footer assertions move to the new component specs).
- `main-layout.component.spec.ts` (existing — verify; modify if needed) — assert `<app-topmenu mode="authenticated">`.

## 8. Build sequence (single PR, multiple commits)

1. `shared/contact.ts` (+ spec).
2. `app-footer` component (no dependencies; ships value first, simplest).
3. `app-topmenu` component (extracts current inline topbars from the two layouts; embeds the *current* `app-language-switcher` unchanged for now).
4. Refactor `app-language-switcher` to the compact globe-trigger contract + add `common.language_switcher.aria` i18n key in 5 locales.
5. Refactor `/contribute` to no-hero + sections + ui()-i18n; remove `contribute_page.*` from Transloco JSON catalogs.
6. Create `/about` page + `about-page.text.ts` + route + nav link in `app-topmenu`.
7. Final verification: `npm test`, `npm run build`, manual smoke at `/`, `/contribute`, `/about` (incl. mobile width ≤ 960 px to test hamburger + NavigationEnd close + Esc + click-outside).

Each step ends with its own commit. Tests are written before or alongside implementation per TDD discipline where useful (clearly so for `shared/contact` and the new components).

## 9. Out-of-scope

- Refactor of `/features`, `/home`, auth pages.
- App version wiring from `package.json` (use a hard-coded const for now).
- Authenticated-layout footer (none — only `PublicLayoutComponent` gets `app-footer`).
- Internationalizing the company address beyond the `Belgium` translation.
- Replacing PrimeNG components with Tailwind-only equivalents.

## 10. Self-review

- **Placeholder scan:** the `_CONTENT` consts in `contribute-page.text.ts` and `about-page.text.ts` are referenced as ellipsed in this spec. The implementation plan must spell each out fully — no `…`, no TBD.
- **Internal consistency:** `app-topmenu` is the single home of nav links. v2 explicitly removes the duplicate `<header>` markup from `MainLayoutComponent` and `PublicLayoutComponent`. The `mobileMenuOpen` signal owned by `PublicLayoutComponent` in v1 moves to `app-topmenu`.
- **Scope check:** 6 implementation steps + 1 verification step. Each ships an independently-reviewable commit.
- **Ambiguity:** the `address` row's tag/label in i18n is multiline — clarified in the spec (`row.kind === 'multiline'`).
