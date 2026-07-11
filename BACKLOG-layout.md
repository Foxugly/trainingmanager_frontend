# Backlog — harmonisation layout · trainingmanager_frontend (A21)

> **Cible :** `STANDARD-frontend-layout.md` (repo `foxugly-ops`) ; réf = `FoxRunner_frontend`.
> **Statut : ~25-30 % conforme** (audit exhaustif 2026-07-11) — **le plus lourd de la flotte** (Tailwind massif).
> Travailler sur branche dédiée — **jamais `main`** (auto-deploy).

## ✅ Déjà conforme
- **i18n Transloco 5 langues** (fr/nl/en/it/es, `public/i18n/*.json`) — systématique.
- `app-page-header` (3-col + slots), About (p-tabs Company/Legal/Technical, SCSS sémantique), skeletons (`p-skeleton`).
- Chrome présent : `app-topmenu` (core/layout, `[mode]`, 3 zones, drawer, CTA Soutenir), `app-user-menu`, `app-footer` (core/layout, version runtime, dark), `app-language-switcher` (a11y) — **mais couleurs en dur + breakpoints/BEM à corriger**.
- Turnstile sur register ✓ ; severities correctes sur les pages admin ; `p-table` (rows=20) sur le CRUD admin.

## Lot 1 — Fondation CSS (safe, indépendant du look)
- [ ] **`_tokens.scss`** : noms non-canoniques → canonique (`--text`→`--ink`, `--text-strong`→`--ink-soft`/`--ink`, `--surface-soft`→`--surface-2`, ajouter `--accent*`, `--chrome-*`, `--success/--warn/--danger`, `--content-max`/`--content-pad`) + `.dark-mode` complet.
- [ ] **`_breakpoints.scss`** : 640/768/1024/1280 + mixin `below()` ; corriger **960→1024** et **480** (`topmenu.scss:111/168`).
- [ ] **Largeur unique** : `max-width: 1440px` → `var(--content-max)` (topmenu/main-layout/footer) + `padding-inline: var(--content-pad)`.
- [ ] **ThemeService + dark toggle + anti-FOUC** (ABSENT — copie FoxRunner) ; toggle rectangulaire ; ordre cloches→**thème**→langue→user.
- [ ] Tokeniser les couleurs en dur du chrome (topmenu/footer/language-switcher/user-menu : `#cbd5e1`, `#fff`, `#f8fafc`, `#334155`…) → `--chrome-*`/`--surface-2`/`--ink*`.

## Lot 2 — Retrait Tailwind (TRÈS gros : ~2242 classes, 78/85 fichiers HTML)
- [ ] Dépréciation immédiate (pas de nouvel usage) ; retrait **opportuniste** en réécrivant chaque zone en SCSS/BEM + tokens ; désinstaller `tailwindcss`/`@tailwindcss/postcss` + `@import "tailwindcss"` (`styles.scss:7`) **quand le dernier usage a disparu**.
- [ ] Prioriser : skip-link (`main-layout`/`public-layout`), pages publiques (home/features/contribute), pages auth, `app-empty-state`, listes (`grid grid-cols-*`→`repeat(auto-fit,minmax(16rem,1fr))`).

## Lot 3 — Auth + composant partagé
- [ ] Créer **`app-auth-card`** (ABSENT — copie FoxRunner : `[icon]`+`[title]` centrés, ~420px, slot) ; l'appliquer à login/register/forgot (dé-dupliquer la chrome Tailwind).
- [ ] Ajouter la page **`/privacy`** (ABSENTE — réutiliser le légal de `/about`).

## Lot 4 — Pages détail / admin
- [ ] Migrer **`detail-header` → `app-page-header`** partout puis **supprimer** `shared/ui/detail-header/`.
- [ ] Severities cohérentes aussi sur public/auth (aujourd'hui gradient Tailwind en dur).

_Effort estimé (audit) : ~150-170 j·p au total — TM est le plus gros chantier._
