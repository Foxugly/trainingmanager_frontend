# Backlog — harmonisation layout · trainingmanager_frontend

> **Cible :** `STANDARD-frontend-layout.md` (repo `foxugly-ops`) ; réf complète = **`FoxRunner_frontend`**
> (+ app runnable `foxugly-ops/frontend-reference/foo-app`).
> Travail sur **`feat/scss-standard`** → **`feat/tailwind-removal`** (PR #9). **Jamais `main`** (auto-deploy prod).
> **PR #9 n'est PAS déployée** : gros reskin (78 fichiers) sur produit live → **revue visuelle humaine requise**
> (clair + sombre) avant merge.

## ✅ Fait (branche feat/tailwind-removal, PR #9) — build + 834 tests + 5 e2e verts
- `app-topmenu` (`core/layout/`, `[mode]`), cloches, `app-language-switcher` (Transloco 5 langues), `app-user-menu`.
- Shell `main`/`public`/`admin` + skip-link ; `app-page-header` (slots) ; About `p-tabs` ; `app-empty-state` + skeletons.
- **`ThemeService` + `app-theme-toggle` borderless + dark mode + anti-FOUC** (toggle placé avant la langue).
- **Footer `Privacy` + page `/privacy`** ; `footer.privacy` i18n 5 langues.
- `user-menu` relocalisé → `core/layout/` ; tokenisation chrome (exact-match) ; breakpoints canoniques.
- **Tailwind → SCSS/BEM (tokens)** sur ~68 templates feature/shared.

## Reste — conformité restante
- [ ] **Largeur topmenu/footer `1440px` → `var(--content-max)`** (encore `1440` : `footer.component.scss:18`,
      `topmenu.component.scss:21`) pour aligner topbar/page/footer.
- [ ] **`detail-header` → `app-page-header`** : le composant `shared/ui/detail-header/` + **4 templates** l'utilisent
      encore → migrer puis supprimer le composant.

## Reste — retrait Tailwind (le `@import "tailwindcss"` est encore là, `styles.scss:7`)
- [ ] **Convertir les 14 derniers fichiers Tailwind** :
  - **8 HTML** : `styleClass="w-full"` (passthrough PrimeNG) — `login`, `register`, `reset-password`,
    `forgot-password`, `invitation-accept`, `check-your-email`, `team-templates`, `equipment-select`
    → règle partagée / `::ng-deep`.
  - **6 TS** : maps de classes couleur renvoyant du Tailwind — `features-page`, `programs-list` (`cardClass`),
    `teams-list` (`roleClasses`), `teams-detail`, `team-stats`, `rsvp-reliability`.
- [ ] **Retirer `@import "tailwindcss"`** + désinstaller `tailwindcss`/`@tailwindcss/postcss` une fois les 14 faits.

## Reste — dark mode complet (des éléments restent clairs en sombre)
- [ ] **Tokeniser les couleurs littérales hors-token** (pas d'équivalent flotte → ne s'adaptent pas au sombre) :
      chips indigo/violet présence & IA (`teams-detail`, `team-stats`), cartes admin bleues, stats RSVP rose/ambre
      (`event-rsvp`, `event-debrief`), chips d'événement du calendrier, **stop teal** des dégradés CTA auth/home.
- [ ] **Convertir les maps de classes couleur TS** (`roleClasses`/`cardClass`/`toneClasses`/`rsvp-reliability`)
      en classes token-based pour qu'elles **se recolorent en sombre** (aujourd'hui light-only).

## Revue avant merge/deploy (PR #9)
- [ ] **Regarder en clair ET sombre** : `dashboard`, `teams-detail`, `programs-detail`, `team-stats`, `events-detail`
      (le plus de règles converties) + les zones couleur ci-dessus.

## i18n
- ✅ Déjà Transloco 5 langues — rien à migrer.
