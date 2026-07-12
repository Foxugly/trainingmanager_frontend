# Backlog — harmonisation layout · trainingmanager_frontend

> **Cible :** `STANDARD-frontend-layout.md` (repo `foxugly-ops`) ; réf complète = **`FoxRunner_frontend`**
> (+ app runnable `foxugly-ops/frontend-reference/foo-app`).
> **Statut : ✅ CONFORME — mergé sur `main` (auto-deploy prod).**

## ✅ Fait — build + 832 tests + 5 e2e verts
- `app-topmenu` (`core/layout/`, `[mode]`), cloches, `app-language-switcher` (Transloco 5 langues), `app-user-menu`.
- Shell `main`/`public`/`admin` + skip-link ; `app-empty-state` + skeletons ; About `p-tabs`.
- **`ThemeService` + `app-theme-toggle` borderless + dark mode complet + anti-FOUC** (toggle avant la langue).
- **Footer `Privacy` + page `/privacy`** ; `footer.privacy` i18n 5 langues.
- `user-menu` relocalisé → `core/layout/` ; tokenisation chrome ; breakpoints canoniques.
- **Tailwind entièrement retiré** (import + dépendances) ; tous les templates en SCSS/BEM tokenisé.
- **Largeur topbar/footer** : `1440px` en dur → `var(--content-max)` (grille de contenu unique).
- **Couleurs dark-safe** : tous les littéraux off-palette (violet présence/IA, indigo, ambre, rose CTA)
  remplacés par les tokens sémantiques flotte (`--info`/`--warn`/`--danger`/`--accent`), qui portent
  déjà leurs overrides `.dark-mode`.
- **`app-page-header` unique** (fleet : un seul en-tête liste/form/détail/admin) : `detail-header`
  **supprimé** et remplacé par `app-page-header` (gagne un input `icon` optionnel, aligné FoxRunner)
  sur les 4 pages détail (events/programs/teams/athlete) ; back → `slot=left`, badges → `slot=title-after`,
  actions → `slot=right`, sous-titre/meta/bannière dans le corps.

## i18n
- ✅ Déjà Transloco 5 langues — rien à migrer.

## Hors périmètre layout (suivi ailleurs)
- **Turnstile** register/forgot : déjà LIVE en prod (rollout flotte 2026-06-05) — inchangé par le reskin.
