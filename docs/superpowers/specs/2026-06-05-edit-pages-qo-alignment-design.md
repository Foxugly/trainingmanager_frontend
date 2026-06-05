# Design — Alignement des pages *edit* de TrainingManager sur le template QuizOnline

**Date :** 2026-06-05
**Repo :** `trainingmanager_frontend` (Angular 21.2 / PrimeNG 21 / Tailwind 4 / Transloco 8)
**Branche :** `feature/edit-pages-qo-alignment`

## Objectif

Uniformiser **toutes les pages d'édition (forms)** de TM sur le pattern visuel de
QuizOnline (`quizonline-frontend`), pour une cohérence de flotte :

- Header de form façon QO : **bouton back à gauche (outlined)**, **titre centré**,
  **actions outlined colorées à droite** dont **en premier un toggle « active »**, plus
  un **badge actif/inactif** à côté du titre.
- **Onglets + regroupements logiques** des champs.
- Forms « sexy » (cards + meta-grids).
- **Bons widgets** PrimeNG (toggle, inputNumber spinner, editor Quill, select filtrables…).
- **Maximiser l'héritage SCSS** : tout ce qui peut être remonté en styles globaux /
  composants partagés l'est, pour ne **rien coder deux fois**.

## Principe directeur (non négociable)

> **DRY par composants + héritage SCSS.** Aucune duplication de markup ou de CSS entre
> les forms. Toute structure répétée devient soit une **classe SCSS globale**, soit un
> **composant partagé**. Une page edit consomme ces briques et ne porte presque plus de
> style local.

---

## 1. Briques partagées (à créer en premier)

### 1a. Styles globaux SCSS

- Convertir `src/styles.css` → `src/styles.scss` ; mettre à jour `angular.json`
  (`"styles": ["src/styles.scss"]`).
- Conserver `@import "tailwindcss";` et `@import "primeicons/primeicons.css";`
  (coexistence : Tailwind reste dispo pour les one-offs ; les classes globales portent
  l'uniformité).
- Créer `src/styles/` (calqué sur QO), importé via `@use` depuis `styles.scss` :

| Partial | Classes / contenu remontés |
|---|---|
| `_tokens.scss` | `--radius` (12px), `--radius-sm/lg`, `--shadow-card`, échelle d'espacement, rôles `--surface / --surface-strong / --border / --muted / --text / --text-strong`. Valeurs alignées sur le primary **emerald** de TM. **Variantes `.dark-mode` pour chaque token.** |
| `_layout.scss` | `.page` (colonne, gap, max-width 1280px), `.page--narrow` (forms, max-width ~48rem, centré) |
| `_cards.scss` | `.card`, `.form-card`, `.card-head`, `.card-title`, `.footer-actions` |
| `_forms-meta.scss` | `.meta-grid` (2 cols, 1 col ≤768px), `.meta-item`, `.meta-item--full`, `.meta-label`, `.meta-value`, `.meta-hint`, `.meta-hint--error` |
| `_builder.scss` | `.builder-stack`, `.builder-pane`, `.builder-tabs` (panneaux p-tab transparents), `.tab-icon` |

Toutes les surfaces nouvelles incluent un override `:host-context(.dark-mode)` /
`.dark-mode &` (parité dark-mode — TM a un dark mode, QO non : on va au-delà de QO).

### 1b. Composants partagés (`src/app/shared/ui/`)

| Composant | Rôle | API (entrées / slots) |
|---|---|---|
| `app-page-header` | Header 3-colonnes `1fr auto 1fr`, `<h1>` centré, repli ≤640px. **Copie fidèle du QO.** Coexiste avec `DetailHeaderComponent` (qui reste sur les pages *detail*). | `title` (required) ; slots `[slot=left]`, `[slot=title-after]`, `[slot=right]` |
| `app-status-badge` | Badge sémantique via `p-tag`. **Obligatoire** dans `[slot=title-after]` de chaque header edit. | `kind: 'active' \| 'inactive'` (extensible), `label` |
| `app-active-toggle` | `p-toggleswitch` + logique **optimiste** : PATCH immédiat de `is_active`, set optimiste, rollback + **toast** d'erreur, **confirm** quand on désactive. Affiché **mode édition seulement** (entité existante). | `entityId`, `value`, `patch: (id, value) => Observable`, `confirmOnDisable = true`, `labels` |
| `app-meta-field` | Enveloppe un champ : `.meta-item` + `.meta-label` + `.meta-value` (ng-content) + `.meta-hint`. Évite de répéter le markup `meta-item`. | `label`, `for`, `hint`, `error`, `full = false` ; ng-content = le widget |
| `app-form-footer` | `.footer-actions` : bouton **Cancel** (secondary outlined) + **Save** (primary, loading). | `saving`, `disabled`, `cancelLink` ; output `cancel`/`save` (ou ng-content pour cas spéciaux) |

### 1c. Helper erreurs → toast

- Util partagé `notifyError(messageService, error)` (ou extension de `applyServerError`) :
  les erreurs **globales/submit** sont poussées en **toast** PrimeNG (`MessageService`,
  déjà global ; `<p-toast />` présent dans `MainLayout`).
- Les erreurs **par champ** (validation DRF mappée) restent **inline** sous le champ via
  `app-meta-field [error]` (`.meta-hint--error`).

### 1d. Dépendance Quill

- Ajouter `quill` (peer dep de `p-editor` PrimeNG) à `package.json` ; importer le CSS Quill
  requis. Utilisé pour les **descriptions riches** (cf. §4).
- **Budget bundle** : les pages edit sont en routes *lazy* → Quill atterrit dans les chunks
  lazy, pas dans l'initial bundle (budget 1MB warn / 1.5MB error). Vérifier `npm run build`
  après ajout ; si l'initial déborde, confirmer le lazy-load du chunk editor.

---

## 2. Gabarit appliqué à chaque page *edit*

```html
<div class="page page--narrow">
  <app-page-header [title]="pageTitle()">
    <p-button slot="left" severity="secondary" [outlined]="true"
              icon="pi pi-arrow-left" [label]="back" (onClick)="back()" />

    <app-status-badge slot="title-after"
              [kind]="entity()?.is_active ? 'active' : 'inactive'" [label]="…" />

    <!-- mode édition uniquement -->
    <app-active-toggle slot="right" [entityId]="id()" [value]="entity()?.is_active"
              [patch]="patchActive" />
    <!-- + actions outlined colorées éventuelles (clone, lien…), delete via toggle off -->
  </app-page-header>

  <div class="card form-card builder-stack">
    <p-tabs value="…" class="builder-tabs">
      <p-tablist>
        <p-tab value="…"><i class="pi pi-… tab-icon"></i> {{ label }}</p-tab>
        …
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel value="…">
          <div class="builder-pane">
            <form [formGroup]="form">
              <div class="meta-grid">
                <app-meta-field [label]="…" [for]="…" [error]="…">
                  <!-- widget PrimeNG -->
                </app-meta-field>
                …
              </div>
            </form>
          </div>
        </p-tabpanel>
        …
      </p-tabpanels>
    </p-tabs>

    <app-form-footer [saving]="saving()" [disabled]="form.invalid"
                     [cancelLink]="cancelLink()" (save)="submit()" />
  </div>
</div>
```

Forms **trop petits** (admin modality/energy-*) : on omet `p-tabs` externe et on garde un
seul `.card.form-card` + `.meta-grid` (le « regroupement logique » = une carte).

---

## 3. Regroupements en onglets (par page)

| Page | Toggle `is_active` | Onglets / regroupements |
|---|:--:|---|
| **events-form** | non (pas de champ) | `Infos` (name, program, goal) · `Planning` (date, hour_start, hour_end) · `Détails` (total/distance, color) |
| **teams-form** | oui | `Infos` (name, sport, language, **is_public**) · `Encadrement` (managers) [edit] · `Présences` (picklist statuts) [edit] · `Inscriptions` (auto_accept_policy, notify_managers) [edit]. **Danger-zone « désactiver » fusionnée dans le toggle header** (off + confirm) → suppression de la section rouge dédiée. Le bloc quota-dépassé reste inline. |
| **programs-form** | oui | `Infos` (name, team) · `Planning` (date_start, date_end, frequency) · `Description` (**Quill**) |
| **sports-form** | oui | Un `.card.form-card` : `.meta-grid` (slug, energy_systems) + **onglets de langue** pour `name` (déjà présents, conservés). Lien « gérer modalités » → header `[slot=right]` (secondary outlined, `pi-tags`). |
| **modalities-form** | oui | Un seul `.card.form-card` + `.meta-grid` (+ onglets langue `name`). Pas d'onglets externes. |
| **energy-systems-form** | oui | idem modalities |
| **energy-segments-form** | oui | idem modalities |
| **profile** | non (compte perso) | `Compte` (username, email, prénom/nom) · `Préférences` (langue) · `Sécurité` (changement mot de passe). Champs exacts finalisés au plan (lecture du composant profile requise). |
| **exercise-form-dialog** | n/a (dialog) | Reste dans `p-dialog` (pas de page-header). Applique `.meta-grid` + `app-meta-field` + `app-form-footer`. |
| **round-form-dialog** | n/a (dialog) | idem exercise-form-dialog |

---

## 4. Revue des widgets (« bons widgets »)

| Champ / cas | Avant | Après |
|---|---|---|
| `is_active` | `p-checkbox` inline | **`p-toggleswitch`** dans `app-active-toggle` (header) |
| `is_public` | `p-checkbox` | **`p-toggleswitch`** (mode de visibilité) |
| numériques (total, frequency) | `p-inputNumber` simple | `p-inputNumber` **spinner horizontal `±`** (style QO) |
| description (program) | `pTextarea` | **`p-editor` (Quill)** |
| select / multiselect | `p-select` / `p-multiSelect` filtrables | inchangé (déjà bon) |
| dates / heures | `p-datepicker` | inchangé |
| couleur (event) | `p-colorpicker` + input | inchangé |
| picklist statuts (team) | `p-pickList` | inchangé |
| erreurs globales / submit | `p-message` inline | **toast** (`MessageService`) |
| erreurs par champ | `p-message` listés | inline `app-meta-field [error]` (`.meta-hint--error`) |
| état loading | textes variés | `.card` + message muted standardisé |

---

## 5. Hors périmètre (non touché)

Pages *list*, *detail*, *dashboard*, pages marketing, layouts / topmenu / footer, et le
**backend**. Périmètre = uniquement les 10 forms listés au §3 + les briques partagées §1.

---

## 6. Critères d'acceptation

1. Les 8 pages edit (events, teams, programs, sports, modalities, energy-systems,
   energy-segments, profile) utilisent `app-page-header` (back outlined gauche, titre
   centré, badge actif/inactif, toggle active en tête du slot right en mode édition).
2. Les 2 dialogs (exercise, round) utilisent `.meta-grid` + `app-meta-field` +
   `app-form-footer`.
3. Zéro markup `meta-item` / footer dupliqué : tout passe par les composants partagés.
4. Aucune classe CSS de layout/card/form dupliquée dans un composant : tout vient de
   `src/styles/`.
5. Erreurs globales en toast ; erreurs champ inline.
6. `is_active` / `is_public` en `p-toggleswitch` ; description program en Quill.
7. Parité dark-mode sur toutes les nouvelles surfaces.
8. `npm run build` passe (budget respecté ou lazy-chunk confirmé) ; `npm test` vert ;
   nouvelles clés i18n présentes dans les 5 langues.

---

## 7. Alternatives écartées

- **A2** — garder Tailwind inline + un simple wrapper `app-edit-shell` : moins d'héritage
  SCSS, contraire à la demande « remonter tout ce qu'on peut ».
- **A3** — étendre `DetailHeaderComponent` pour servir aussi les forms : layouts
  incompatibles (titre centré vs aligné-gauche) ; QO sépare aussi header detail / edit.
