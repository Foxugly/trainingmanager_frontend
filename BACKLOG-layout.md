# Backlog — harmonisation layout · trainingmanager_frontend

> **Cible :** `STANDARD-frontend-layout.md` (repo `foxugly-ops`).
> TM est la **référence** de plusieurs briques (langue, user, cloches, shell, footer,
> page-header, About) — l'écart est surtout **thème + retrait Tailwind**.
> **Statut :** à faire (audit 2026-07-10). Bon **point d'entrée** de l'harmonisation.

## ✅ Déjà conforme (souvent la réf)
- `app-topmenu` · `core/layout/topmenu/` · `[mode]` public/authenticated.
- Cloches msg + notif ; `app-language-switcher` (Transloco, 5 langues) ; `app-user-menu` + login « Login ».
- Shell `main`/`public`/`admin-layout` + **skip-link** ; `app-footer` (version runtime, dark).
- `app-page-header` 3 colonnes (slots) ; About en `p-tabs` ; `app-empty-state` + skeletons.

## Phase 1 — structurel
- [ ] **Thème** : ajouter le **toggle + `ThemeService`** (aujourd'hui `.dark-mode` configuré mais **aucune UI**) → `localStorage['theme']`, `.dark-mode`, **anti-FOUC** inline. Placer le bouton avant la langue.
- [ ] **Classes topmenu** : `.topbar/.nav/.actions` (plat) → **BEM `topbar__*`**.
- [ ] **Breakpoints** : 960/480 → échelle `sm 640 / md 768 / lg 1024 / xl 1280` ; topmenu drawer à **1024**.
- [ ] **Largeur** : unifier le double 1280/1440 → **`--content-max: 80rem`** partout (topbar/page/footer alignés).
- [ ] **Page-header** : **supprimer le `detail-header`** résiduel → migrer les pages de détail vers `app-page-header`.
- [ ] **Login** : libellé « Login » → **« Se connecter »**.
- [ ] **Bouton login** : garder l'intégration dans `app-user-menu` (déjà OK).

## Phase 2 — CSS (le gros morceau de TM)
- [ ] **Retirer Tailwind** (~879 usages) → SCSS/BEM + CSS moderne. Commencer par la page **Features** (Tailwind) → grille CSS-grid native.
- [ ] Désinstaller `tailwindcss` quand le dernier usage a disparu.

## i18n
- [ ] ✅ Déjà Transloco 5 langues — rien à migrer.
