# Public navigation revamp — Contribute, About, Language switcher

**Date:** 2026-05-09
**Scope:** PublicLayout (and MainLayout where the language switcher is shared).

## Context

Inspired by [quizonline.foxugly.com](https://quizonline.foxugly.com/) screens fetched on 2026-05-09:

- `/donate` → drives the `/contribute` revamp.
- `/about` → drives a new `/about` page (without the *Features* tab).
- Header → drives the new compact language switcher.

The dark-gradient topbar (added previously) is the deployment context for the trigger styling.

## 1. `/contribute` revamp

### Goal

Single-purpose donation page. Topbar already has a `Contribute` link pointing to `/contribute` — only the page contents change.

### Page structure

1. **Hero** (centered, `max-w-2xl`)
   - Eyebrow uppercase: `contribute_page.eyebrow` (« Soutenir le projet »).
   - `h1`: `contribute_page.title` (« Aidez TrainingManager à grandir »).
   - Lead `p`: `contribute_page.intro` (« TrainingManager est un projet libre. Votre soutien… »).
   - Backdrop: subtle `bg-gradient-to-b from-rose-50/60 to-transparent` block behind the hero only (light tone, contrasts with the dark topbar above).

2. **« Pourquoi soutenir TrainingManager ? »** (`h2` + 4-card grid `md:grid-cols-2`)
   Each card: rounded `rounded-2xl border border-gray-200 bg-white p-6 shadow-sm`, with a colored icon pill (40 px) top-left.
   Cards (i18n keys under `contribute_page.reasons.*`):
   - **Open-source & gratuit** — `pi-code`, sky tone.
   - **Hébergement & infrastructure** — `pi-server`, emerald tone.
   - **Maintenance continue** — `pi-shield`, amber tone.
   - **Nouvelles fonctionnalités** — `pi-sparkles`, rose tone.

3. **« Faire un don »** (`h2` + paragraph + CTA)
   - Centered card on `bg-white` with `rounded-2xl border` and a soft inner highlight.
   - `p`: `contribute_page.donate.intro` (« Les dons sont gérés via GitHub Sponsors… »).
   - Big CTA button: gradient `from-rose-500 to-pink-500`, icon `pi-heart-fill`, label `contribute_page.donate.cta`, `target="_blank" rel="noopener noreferrer"` to `https://github.com/sponsors/Foxugly`.
   - Note `p`: small italic gray-600 — `contribute_page.donate.redirect_note` (« Vous serez redirigé vers GitHub Sponsors dans un nouvel onglet »).

4. **« Merci ! »** — `h2` + small paragraph (`contribute_page.thanks.title` / `contribute_page.thanks.body`).

### Files

- **Modify** `src/app/features/contribute-page/contribute-page.component.html` — full rewrite.
- **Modify** `src/app/features/contribute-page/contribute-page.component.ts` — keep only `sponsorsUrl`; drop the unused `frontendRepoUrl` / `backendRepoUrl` / `issuesUrl` constants.
- **Modify** `src/app/features/contribute-page/contribute-page.component.spec.ts` — drop assertions on the removed links.
- **i18n catalogs** `public/i18n/{fr,nl,en,it,es}.json` — drop `contribute_page.oss.*` and `contribute_page.financial.*` (orphans), add the new keys listed above.

### YAGNI

No donation tiers, no payment provider integration, no testimonials carousel.

## 2. `/about` — new page

### Goal

Project info + legal/RGPD notice + technical stack details. **No** *Features* tab (already covered by `/features`).

### Route

```ts
{
  path: 'about',
  loadComponent: () =>
    import('./features/about-page/about-page.component').then((m) => m.AboutPageComponent),
}
```
Inserted in `app.routes.ts` under the `PublicLayoutComponent` children, alphabetically after `auth/*` and before `check-your-email`.

### Page structure

1. **Hero** (left-aligned, `max-w-3xl`)
   - Eyebrow: `about_page.eyebrow` (« À propos du projet »).
   - `h1`: « TrainingManager ».
   - Lead `p`: `about_page.lead` (description app).
   - Outline button « Voir le dépôt » → `https://github.com/Foxugly/trainingmanager_frontend` (icon `pi-github`, `target="_blank"`).
   - Backdrop: same soft gradient idiom as `/contribute` for visual coherence (`from-indigo-50/40 to-transparent`).

2. **Card with PrimeNG `p-tabs`** — 2 tabs. Convention confirmed in `events-detail.component.html`: `<p-tabs>` + `<p-tablist>` + `<p-tab>` for the headers, `<p-tabpanels>` + `<p-tabpanel>` for the content; `[value]` binding + `valueChange` event for state.
   - **Onglet « Mentions légales & RGPD »** (`pi-shield` icon)
     6 sub-sections (`h3` + `ul`):
     - Responsable du traitement
     - Données collectées
     - Base légale & finalités (RGPD art. 6)
     - Vos droits (RGPD art. 15-22)
     - Conservation des données
     - Sécurité
     - Cookies
   - **Onglet « Technique »** (`pi-cog` icon)
     3 sub-sections (`h3` + intro + `ul`):
     - **Dépôt** — repo URL + 2 bullets (mono-repo? non — frontend + backend séparés ; CI GitHub Actions ; OpenAPI client codegen).
     - **Backend** — Django + DRF + drf-spectacular + Simple JWT + django-filter + django-parler + Celery.
     - **Frontend** — Angular 21 (TS 5.9 strict) + PrimeNG 21 + Tailwind 4 + Transloco 8 + Vitest 4 + openapi-generator-cli.

### Files

- **Create** `src/app/features/about-page/about-page.component.{ts,html,scss,spec.ts}`.
- **Modify** `src/app/app.routes.ts` — add the route.
- **Modify** `src/app/core/layout/public-layout/public-layout.component.html` — add an "About" link in both desktop nav and mobile dropdown (between `Features` and `Contribute`).
- **i18n catalogs** — add `about_page.*` keys + new `public.nav.about` label.

### YAGNI

No team page, no roadmap, no changelog feed, no contributors list.

## 3. Language switcher — refonte compacte

### Goal

A compact `pi-globe` + uppercase code button styled for dark backgrounds; opens a popup menu with code + native name + active-state highlight. Keeps the existing API of `LanguageSwitcherComponent` (no consumer changes — the layout templates do not need to be touched on this account).

### Trigger

```html
<button
  type="button"
  class="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 text-sm font-medium text-white transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
  [attr.aria-label]="'common.language_switcher.aria' | transloco"
  [attr.aria-haspopup]="'menu'"
  [attr.aria-expanded]="menu.visible"
  (click)="menu.toggle($event)"
>
  <i class="pi pi-globe text-sm" aria-hidden="true"></i>
  <span class="font-semibold tracking-wide">{{ current() | uppercase }}</span>
  <i class="pi pi-chevron-down text-[10px]" aria-hidden="true"></i>
</button>
<p-menu #menu [model]="menuItems()" [popup]="true" appendTo="body" />
```

### Menu items

Built as a `computed<MenuItem[]>` from `AVAILABLE_LANGUAGES` (`fr | nl | en | it | es`), each:

```text
[ FR ]  Français   ✓   ← uppercase code in a chip + native name + check on active
```

Implementation: each `MenuItem.label` rendered through a custom template (PrimeNG `pTemplate="item"`) so we can show:
- Left chip with the uppercase code on a slate-100 background (or indigo-100 + border for the active item).
- Middle: native name in slate-700.
- Right: `pi-check` (visible only when item matches `current()`).

`command` calls the existing `switchLanguage` flow (already on the service). Errors keep the existing toast.

### Variant

Single component, no `variant` input. The current call sites are:
- `PublicLayoutComponent` (header) → dark gradient → trigger uses light text on translucent white.
- `MainLayoutComponent` (header) → dark gradient → idem.
- (The component is **not** used inside `app-user-menu`. Verified.)

If a future light-bg use-case appears, add a `variant` input then; YAGNI for now.

### Files

- **Modify** `src/app/core/i18n/language-switcher/language-switcher.component.{html,ts,scss}` — full rewrite.
- **Modify** `src/app/core/i18n/language-switcher/language-switcher.component.spec.ts` — replace `<p-select>` assertions with `<p-menu>` ones.
- **i18n catalogs** — add `common.language_switcher.aria` ("Choisir la langue" / "Choose language" / etc.).

### Accessibility

- `aria-haspopup="menu"`, `aria-expanded` reflecting popup state.
- `aria-label` translated (icon-only context aside from the code).
- Active item: `aria-current="true"`.
- Keyboard: PrimeNG `p-menu` already handles arrow + Enter; verified.

## Cross-cutting

### i18n discipline

All new strings written into all five catalogs (`fr`, `nl`, `en`, `it`, `es`) per project convention. The PR description must list the new keys explicitly so reviewers can spot any missing locale.

### Tests (Vitest)

- `contribute-page.component.spec.ts` — assert hero + 4 reason cards rendered + sponsors CTA href + `target="_blank"`.
- `about-page.component.spec.ts` (new) — assert hero + 2 tabs + at least one item from each section.
- `language-switcher.component.spec.ts` — assert trigger renders current code uppercase, popup contains 5 items, active item has `aria-current`, click invokes service.
- `public-layout.component.spec.ts` — assert About link present in desktop nav and mobile dropdown.

### Bundle impact

Negligible. PrimeNG `Menu` is already imported by `app-user-menu`. Removing `Select` from `language-switcher` saves ~6-8 kB gzip; the new About + Contribute templates add markup but no new dependencies.

### Out-of-scope

- Backend changes (none required).
- `/features` page revamp.
- Authentication-protected pages.

## Build sequence (high-level)

1. Language switcher refactor (smallest, independent — ships value first).
2. `/contribute` revamp.
3. `/about` page + nav link + route.
4. i18n seeding for all 5 locales.
5. Tests.
6. Manual visual check at `/`, `/contribute`, `/about` against the references.
