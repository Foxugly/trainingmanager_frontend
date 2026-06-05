# Alignement des pages *edit* sur le template QuizOnline — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uniformiser les 8 pages d'édition + 2 dialogs de TrainingManager sur le pattern QuizOnline (header back/titre-centré/badge/toggle-active, forms en onglets, widgets PrimeNG soignés), en remontant tout le répétable en styles SCSS globaux + composants partagés.

**Architecture:** On crée d'abord la **fondation partagée** (styles SCSS globaux dans `src/styles/` + 5 composants `shared/ui/` + helper toast + dépendance Quill), puis on **refactore chaque form** pour consommer ces briques. Aucun markup/CSS de layout/card/form n'est dupliqué.

**Tech Stack:** Angular 21.2 (standalone, signals, OnPush), PrimeNG 21 (Aura+Emerald, `darkModeSelector: '.dark-mode'`), Tailwind 4, Transloco 8 (fr/nl/en/it/es), Vitest 4, Quill (via `p-editor`).

**Référence design :** `docs/superpowers/specs/2026-06-05-edit-pages-qo-alignment-design.md`

---

## Conventions (lire avant de commencer)

- **Standalone uniquement**, pas de `standalone: true` (défaut v20+). `ChangeDetectionStrategy.OnPush` partout. `inject()`, `input()`/`output()`, signals (`signal`/`computed`, jamais `mutate`).
- **Templates** : control-flow natif (`@if`/`@for`), bindings `class`/`style` (pas `ngClass`/`ngStyle`), `async` pipe.
- **Tests Vitest** : `import { beforeEach, describe, expect, it, vi } from 'vitest';`. Filtrer un spec : `npm test -- --include "src/app/.../x.spec.ts"`.
- **i18n** : toute nouvelle clé va dans **les 5** fichiers `public/i18n/{fr,nl,en,it,es}.json` (CI ne l'impose pas — discipline).
- **Commits fréquents** : un commit par tâche minimum. Messages en anglais, finis par
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Branche** : `feature/edit-pages-qo-alignment` (déjà créée).
- **Build** : `npm run build` (budget initial 1MB warn / 1.5MB error). **Test** : `npm test`.

---

## File Structure

**Créés :**
- `src/styles.scss` (remplace `src/styles.css`)
- `src/styles/_tokens.scss`, `_layout.scss`, `_cards.scss`, `_forms-meta.scss`, `_builder.scss`
- `src/app/shared/ui/page-header/page-header.component.ts` (+ `.spec.ts`)
- `src/app/shared/ui/status-badge/status-badge.component.ts` (+ `.spec.ts`)
- `src/app/shared/ui/meta-field/meta-field.component.ts` (+ `.html` + `.scss` n/a + `.spec.ts`)
- `src/app/shared/ui/form-footer/form-footer.component.ts` (+ `.spec.ts`)
- `src/app/shared/ui/active-toggle/active-toggle.component.ts` (+ `.spec.ts`)
- `src/app/shared/forms/notify-error.ts` (+ `.spec.ts`)

**Modifiés :**
- `angular.json` (styles entry), `package.json` (quill), `src/styles.css` → supprimé
- 8 forms : `features/{events/events-form, programs/programs-form, teams/teams-form, profile, admin/sports/sports-form, admin/modalities/modalities-form, admin/energy-systems/energy-systems-form, admin/energy-segments/energy-segments-form}/*.{html,ts}`
- 2 dialogs : `features/events/{round-form-dialog, exercise-form-dialog}/*.{html,ts}`
- `public/i18n/{fr,nl,en,it,es}.json`

---

# PHASE A — Fondation partagée

## Task 1 : Styles SCSS globaux

**Files:**
- Create: `src/styles.scss`, `src/styles/_tokens.scss`, `src/styles/_layout.scss`, `src/styles/_cards.scss`, `src/styles/_forms-meta.scss`, `src/styles/_builder.scss`
- Modify: `angular.json` (remplacer `"src/styles.css"` par `"src/styles.scss"`)
- Delete: `src/styles.css`

- [ ] **Step 1 : Créer `src/styles/_tokens.scss`**

```scss
:root {
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
  --shadow-card: 0 2px 10px rgba(0, 0, 0, 0.06);

  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-6: 24px;

  --surface: #ffffff;
  --surface-soft: #fafafa;
  --border: #e5e7eb;
  --muted: #6b7280;
  --text: #374151;
  --text-strong: #111827;
}

.dark-mode {
  --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.4);
  --surface: #1e293b;
  --surface-soft: #18243a;
  --border: #334155;
  --muted: #94a3b8;
  --text: #cbd5e1;
  --text-strong: #e2e8f0;
}
```

- [ ] **Step 2 : Créer `src/styles/_layout.scss`**

```scss
.page {
  max-width: 80rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.page--narrow {
  max-width: 48rem;
}
```

- [ ] **Step 3 : Créer `src/styles/_cards.scss`**

```scss
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  padding: 1rem;
}

.form-card {
  padding: 1rem 1rem 0.85rem;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.card-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
  color: var(--text-strong);
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 1rem;
}
```

- [ ] **Step 4 : Créer `src/styles/_forms-meta.scss`**

```scss
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-soft);

  &--full {
    grid-column: 1 / -1;
  }
}

.meta-label {
  font-size: 0.82rem;
  color: var(--muted);
}

.meta-value {
  width: 100%;
  font-size: 0.95rem;
  color: var(--text-strong);
  display: flex;
  align-items: center;
  gap: 0.5rem;

  // PrimeNG inputs/selects take the full width of the meta-item.
  ::ng-deep .p-inputtext,
  ::ng-deep .p-select,
  ::ng-deep .p-multiselect,
  ::ng-deep .p-datepicker,
  ::ng-deep .p-inputnumber,
  ::ng-deep .p-editor-container {
    width: 100%;
  }
}

.meta-hint {
  font-size: 0.8rem;
  color: var(--muted);

  &--error {
    color: #d14343;
  }
}
```

- [ ] **Step 5 : Créer `src/styles/_builder.scss`**

```scss
.builder-stack {
  display: grid;
  gap: 1.25rem;

  & > * {
    min-width: 0;
  }
}

.builder-pane {
  display: grid;
  gap: 1rem;
  padding: 0.25rem 0;
}

.builder-tabs {
  ::ng-deep .p-tabpanels,
  ::ng-deep .p-tabpanel {
    background: transparent;
    border: 0;
    box-shadow: none;
    padding: 0;
  }
}

.tab-icon {
  margin-right: 0.4rem;
}
```

- [ ] **Step 6 : Créer `src/styles.scss`** (remplace l'ancien `styles.css`)

```scss
@import "tailwindcss";
@import "primeicons/primeicons.css";

@use "styles/tokens";
@use "styles/layout";
@use "styles/cards";
@use "styles/forms-meta";
@use "styles/builder";
```

- [ ] **Step 7 : Pointer `angular.json` sur le `.scss` et supprimer `.css`**

Dans `angular.json`, remplacer `"src/styles.css"` par `"src/styles.scss"` (clés `architect.build.options.styles` et, si présent, `test`). Puis supprimer `src/styles.css`.

Run: `git rm src/styles.css`

- [ ] **Step 8 : Vérifier le build**

Run: `npm run build`
Expected: build OK (warnings LF/CRLF ignorables ; pas d'erreur SCSS).

- [ ] **Step 9 : Commit**

```bash
git add src/styles.scss src/styles/ angular.json
git commit -m "feat(ui): global SCSS foundation (tokens, layout, cards, meta, builder)"
```

---

## Task 2 : Composant `app-page-header`

**Files:**
- Create: `src/app/shared/ui/page-header/page-header.component.ts`
- Test: `src/app/shared/ui/page-header/page-header.component.spec.ts`

- [ ] **Step 1 : Écrire le test (échec attendu)**

```ts
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="Éditer">
      <button slot="left" data-testid="back">Back</button>
      <span slot="title-after" data-testid="badge">Actif</span>
      <button slot="right" data-testid="action">X</button>
    </app-page-header>
  `,
})
class HostComponent {}

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders the title and projects the three slots', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Éditer');
    expect(el.querySelector('[data-testid="back"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="badge"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="action"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- --include "src/app/shared/ui/page-header/page-header.component.spec.ts"`
Expected: FAIL (`Cannot find module './page-header.component'`).

- [ ] **Step 3 : Implémenter le composant** (copie fidèle du QO `PageHeader`, classe renommée)

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Three-column edit-page header: optional left slot (back button), centered
 * <h1> title with an optional [slot=title-after] (status badge), and an
 * optional right slot (active toggle + actions). Mirrors QuizOnline's
 * PageHeader. Distinct from DetailHeaderComponent (used on detail pages).
 */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="page-header">
      <div class="page-header__slot page-header__slot--left">
        <ng-content select="[slot=left]" />
      </div>
      <div class="page-header__title-row">
        <h1 class="page-header__title">{{ title() }}</h1>
        <ng-content select="[slot=title-after]" />
      </div>
      <div class="page-header__slot page-header__slot--right">
        <ng-content select="[slot=right]" />
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; }
    .page-header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .page-header__title-row {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      justify-self: center;
      min-width: 0;
    }
    .page-header__title {
      margin: 0;
      text-align: center;
      min-width: 0;
      font-size: 1.5rem;
      line-height: 1.2;
      color: var(--text-strong);
    }
    .page-header__slot {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .page-header__slot--left  { justify-self: start; }
    .page-header__slot--right { justify-self: end; }
    @media (max-width: 640px) {
      .page-header { grid-template-columns: 1fr; row-gap: 0.6rem; }
      .page-header__slot--left,
      .page-header__slot--right { justify-self: stretch; justify-content: flex-start; }
      .page-header__slot--right { justify-content: flex-end; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
}
```

- [ ] **Step 4 : Lancer le test → succès**

Run: `npm test -- --include "src/app/shared/ui/page-header/page-header.component.spec.ts"`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/app/shared/ui/page-header/
git commit -m "feat(ui): add app-page-header (centered 3-col edit header)"
```

---

## Task 3 : Composant `app-status-badge`

**Files:**
- Create: `src/app/shared/ui/status-badge/status-badge.component.ts`
- Test: `src/app/shared/ui/status-badge/status-badge.component.spec.ts`

- [ ] **Step 1 : Écrire le test (échec attendu)**

```ts
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StatusBadgeComponent } from './status-badge.component';

@Component({
  imports: [StatusBadgeComponent],
  template: `<app-status-badge [kind]="kind" label="State" />`,
})
class HostComponent {
  kind: 'active' | 'inactive' = 'active';
}

describe('StatusBadgeComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('maps active → success severity', () => {
    expect(fixture.componentInstance.kind).toBe('active');
    const cmp = fixture.debugElement.children[0].componentInstance as StatusBadgeComponent;
    expect(cmp.severity()).toBe('success');
  });

  it('maps inactive → secondary severity', () => {
    fixture.componentInstance.kind = 'inactive';
    fixture.detectChanges();
    const cmp = fixture.debugElement.children[0].componentInstance as StatusBadgeComponent;
    expect(cmp.severity()).toBe('secondary');
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- --include "src/app/shared/ui/status-badge/status-badge.component.spec.ts"`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter**

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tag } from 'primeng/tag';

export type StatusBadgeKind = 'active' | 'inactive';

@Component({
  selector: 'app-status-badge',
  imports: [Tag],
  template: `<p-tag [severity]="severity()" [value]="label()" [icon]="icon()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly kind = input.required<StatusBadgeKind>();
  readonly label = input.required<string>();

  readonly severity = computed<'success' | 'secondary'>(() =>
    this.kind() === 'active' ? 'success' : 'secondary',
  );
  readonly icon = computed(() => (this.kind() === 'active' ? 'pi pi-check-circle' : 'pi pi-ban'));
}
```

- [ ] **Step 4 : Lancer le test → succès**

Run: `npm test -- --include "src/app/shared/ui/status-badge/status-badge.component.spec.ts"`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/app/shared/ui/status-badge/
git commit -m "feat(ui): add app-status-badge (active/inactive p-tag)"
```

---

## Task 4 : Composant `app-meta-field`

**Files:**
- Create: `src/app/shared/ui/meta-field/meta-field.component.ts`
- Test: `src/app/shared/ui/meta-field/meta-field.component.spec.ts`

- [ ] **Step 1 : Écrire le test (échec attendu)**

```ts
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MetaFieldComponent } from './meta-field.component';

@Component({
  imports: [MetaFieldComponent],
  template: `
    <app-meta-field label="Nom" for="name" [hint]="hint" [error]="error" [full]="true">
      <input id="name" data-testid="ctrl" />
    </app-meta-field>
  `,
})
class HostComponent {
  hint = 'Aide';
  error: string | null = null;
}

describe('MetaFieldComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders label, projects the control, shows hint, applies --full', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('label.meta-label')?.textContent).toContain('Nom');
    expect(el.querySelector('label.meta-label')?.getAttribute('for')).toBe('name');
    expect(el.querySelector('[data-testid="ctrl"]')).not.toBeNull();
    expect(el.querySelector('.meta-hint')?.textContent).toContain('Aide');
    expect(el.querySelector('.meta-item--full')).not.toBeNull();
  });

  it('shows the error in place of the hint with the error modifier', () => {
    fixture.componentInstance.error = 'Requis';
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.meta-hint--error')?.textContent).toContain('Requis');
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- --include "src/app/shared/ui/meta-field/meta-field.component.spec.ts"`
Expected: FAIL.

- [ ] **Step 3 : Implémenter** (les classes `.meta-*` viennent des styles globaux — pas de style local ; le composant doit donc utiliser `ViewEncapsulation.None` n'est PAS nécessaire car les classes sont globales et l'élément hôte les porte)

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Wraps a form control in the shared `.meta-item` shell (label + value +
 * hint/error). The actual widget is projected via <ng-content>. All visual
 * styling comes from the global `src/styles/_forms-meta.scss`.
 */
@Component({
  selector: 'app-meta-field',
  template: `
    <div class="meta-item" [class.meta-item--full]="full()">
      <label class="meta-label" [attr.for]="for()">{{ label() }}</label>
      <div class="meta-value">
        <ng-content />
      </div>
      @if (error()) {
        <div class="meta-hint meta-hint--error">{{ error() }}</div>
      } @else if (hint()) {
        <div class="meta-hint">{{ hint() }}</div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetaFieldComponent {
  readonly label = input.required<string>();
  readonly for = input<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly full = input<boolean>(false);
}
```

> Note : le composant n'a pas de styles propres ; il s'appuie sur les classes globales. L'encapsulation par défaut (Emulated) n'empêche PAS l'application de classes globales définies dans `styles.scss` (elles sont globales, pas scopées au composant).

- [ ] **Step 4 : Lancer le test → succès**

Run: `npm test -- --include "src/app/shared/ui/meta-field/meta-field.component.spec.ts"`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/app/shared/ui/meta-field/
git commit -m "feat(ui): add app-meta-field (label/value/hint shell)"
```

---

## Task 5 : Composant `app-form-footer`

**Files:**
- Create: `src/app/shared/ui/form-footer/form-footer.component.ts`
- Test: `src/app/shared/ui/form-footer/form-footer.component.spec.ts`

- [ ] **Step 1 : Écrire le test (échec attendu)**

```ts
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormFooterComponent } from './form-footer.component';

@Component({
  imports: [FormFooterComponent],
  template: `
    <app-form-footer
      [saving]="false"
      [disabled]="false"
      cancelLabel="Annuler"
      saveLabel="Enregistrer"
      (cancel)="onCancel()"
      (save)="onSave()"
    />
  `,
})
class HostComponent {
  onCancel = vi.fn();
  onSave = vi.fn();
}

describe('FormFooterComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('emits save when the submit button is clicked', () => {
    const btns = fixture.nativeElement.querySelectorAll('button');
    (btns[btns.length - 1] as HTMLButtonElement).click();
    expect(fixture.componentInstance.onSave).toHaveBeenCalled();
  });

  it('emits cancel when the cancel button is clicked', () => {
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    btn.click();
    expect(fixture.componentInstance.onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- --include "src/app/shared/ui/form-footer/form-footer.component.spec.ts"`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from 'primeng/button';

/**
 * Shared form footer: Cancel (secondary outlined) + Save (primary, loading).
 * Layout from the global `.footer-actions` class. Parent owns submit logic.
 */
@Component({
  selector: 'app-form-footer',
  imports: [Button],
  template: `
    <div class="footer-actions">
      <p-button
        type="button"
        severity="secondary"
        [outlined]="true"
        [label]="cancelLabel()"
        [disabled]="saving()"
        (onClick)="cancel.emit()"
      />
      <p-button
        type="button"
        [label]="saveLabel()"
        [loading]="saving()"
        [disabled]="disabled() || saving()"
        (onClick)="save.emit()"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormFooterComponent {
  readonly saving = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly cancelLabel = input.required<string>();
  readonly saveLabel = input.required<string>();
  readonly cancel = output<void>();
  readonly save = output<void>();
}
```

> Note : le bouton Save est `type="button"` + `(onClick)="save.emit()"` (et non un submit natif) ; le parent appelle `submit()` sur l'event `save`. Cela évite d'imbriquer le footer dans le `<form>`.

- [ ] **Step 4 : Lancer le test → succès**

Run: `npm test -- --include "src/app/shared/ui/form-footer/form-footer.component.spec.ts"`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/app/shared/ui/form-footer/
git commit -m "feat(ui): add app-form-footer (cancel/save actions)"
```

---

## Task 6 : Composant `app-active-toggle`

**Files:**
- Create: `src/app/shared/ui/active-toggle/active-toggle.component.ts`
- Test: `src/app/shared/ui/active-toggle/active-toggle.component.spec.ts`

**Contrat :** affiche un `p-toggleswitch`. Le parent fournit `entityId`, la valeur courante `value`, et un callback `patch: (id, value) => Observable<unknown>` (chaque page câble la bonne méthode de service, dont les signatures positionnelles diffèrent). À l'activation : PATCH immédiat + optimiste + rollback/toast en cas d'erreur. À la **désactivation** : confirmation via `ConfirmationService` avant le PATCH.

- [ ] **Step 1 : Écrire le test (échec attendu)**

```ts
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveToggleComponent } from './active-toggle.component';

@Component({
  imports: [ActiveToggleComponent],
  template: `
    <app-active-toggle
      [entityId]="1"
      [value]="value()"
      [patch]="patch"
      [labels]="{ active: 'Actif', inactive: 'Inactif', confirm: 'Désactiver ?' }"
      (valueChange)="value.set($event)"
    />
  `,
})
class HostComponent {
  value = signal(false);
  patch = vi.fn((_id: number, _v: boolean) => of({}));
}

describe('ActiveToggleComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let confirm: ConfirmationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [ConfirmationService, MessageService],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    confirm = TestBed.inject(ConfirmationService);
    fixture.detectChanges();
  });

  it('activating (false→true) patches immediately without confirmation', () => {
    const cmp = fixture.debugElement.children[0].componentInstance as ActiveToggleComponent;
    cmp.onChange(true);
    expect(fixture.componentInstance.patch).toHaveBeenCalledWith(1, true);
    expect(fixture.componentInstance.value()).toBe(true);
  });

  it('deactivating (true→false) asks for confirmation first', () => {
    fixture.componentInstance.value.set(true);
    fixture.detectChanges();
    const accept = vi.spyOn(confirm, 'confirm');
    const cmp = fixture.debugElement.children[0].componentInstance as ActiveToggleComponent;
    cmp.onChange(false);
    expect(accept).toHaveBeenCalled();
    // patch not called until the user accepts
    expect(fixture.componentInstance.patch).not.toHaveBeenCalled();
  });

  it('rolls back on patch error', () => {
    fixture.componentInstance.patch = vi.fn(() => throwError(() => new Error('boom')));
    fixture.detectChanges();
    const cmp = fixture.debugElement.children[0].componentInstance as ActiveToggleComponent;
    cmp.onChange(true);
    expect(fixture.componentInstance.value()).toBe(false); // rolled back
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- --include "src/app/shared/ui/active-toggle/active-toggle.component.spec.ts"`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

```ts
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Observable } from 'rxjs';

export interface ActiveToggleLabels {
  active: string;
  inactive: string;
  confirm: string;
  errorSummary?: string;
  errorDetail?: string;
}

/**
 * Header active/inactive toggle with optimistic PATCH.
 * - Activating: patches immediately.
 * - Deactivating: asks confirmation first (ConfirmationService).
 * - On error: rolls the value back and shows a toast.
 * The parent supplies `patch` so the right service method (whose positional
 * signature varies) is invoked. Emits `valueChange` so the parent stays in sync.
 */
@Component({
  selector: 'app-active-toggle',
  imports: [ToggleSwitch],
  template: `
    <p-toggleswitch
      [ngModel]="value()"
      (onChange)="onChange($event.checked)"
      [disabled]="busy"
      [pTooltip]="value() ? labels().active : labels().inactive"
      tooltipPosition="bottom"
      [attr.aria-label]="value() ? labels().active : labels().inactive"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveToggleComponent {
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly entityId = input.required<number>();
  readonly value = input.required<boolean>();
  readonly patch = input.required<(id: number, value: boolean) => Observable<unknown>>();
  readonly labels = input.required<ActiveToggleLabels>();
  readonly valueChange = output<boolean>();

  protected busy = false;

  onChange(next: boolean): void {
    if (next === this.value()) return;
    if (!next) {
      this.confirmation.confirm({
        message: this.labels().confirm,
        accept: () => this.apply(false),
        reject: () => this.valueChange.emit(true), // keep it on
      });
      return;
    }
    this.apply(true);
  }

  private apply(next: boolean): void {
    const previous = this.value();
    this.valueChange.emit(next); // optimistic
    this.busy = true;
    this.patch()(this.entityId(), next).subscribe({
      next: () => {
        this.busy = false;
      },
      error: () => {
        this.busy = false;
        this.valueChange.emit(previous); // rollback
        this.messages.add({
          severity: 'error',
          summary: this.labels().errorSummary ?? 'Error',
          detail: this.labels().errorDetail ?? 'Update failed',
        });
      },
    });
  }
}
```

> Le toggle a besoin de `FormsModule` pour `[ngModel]`. Ajouter `FormsModule` à `imports`.
> Corriger l'`imports` du décorateur : `imports: [ToggleSwitch, FormsModule, Tooltip]` (importer `Tooltip` depuis `primeng/tooltip` et `FormsModule` depuis `@angular/forms`).

- [ ] **Step 4 : Compléter les imports** dans le `@Component` :

```ts
import { FormsModule } from '@angular/forms';
import { Tooltip } from 'primeng/tooltip';
// ...
  imports: [ToggleSwitch, FormsModule, Tooltip],
```

- [ ] **Step 5 : Lancer le test → succès**

Run: `npm test -- --include "src/app/shared/ui/active-toggle/active-toggle.component.spec.ts"`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/app/shared/ui/active-toggle/
git commit -m "feat(ui): add app-active-toggle (optimistic is_active PATCH)"
```

---

## Task 7 : Helper erreurs → toast

**Files:**
- Create: `src/app/shared/forms/notify-error.ts`
- Test: `src/app/shared/forms/notify-error.spec.ts`

**Contrat :** factoriser le mapping `HttpErrorResponse` → (champs + message global). Les **champs** sont retournés pour affichage inline ; le **message global** est poussé en **toast**. Réutilise la logique déjà présente dans `events-form.component.ts:297` (`applyServerError`).

- [ ] **Step 1 : Écrire le test (échec attendu)**

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi } from 'vitest';
import { extractServerError, notifyServerError } from './notify-error';

describe('extractServerError', () => {
  it('returns fields when body.fields is present', () => {
    const err = new HttpErrorResponse({ error: { fields: { name: ['Required'] } } });
    expect(extractServerError(err)).toEqual({ fields: { name: ['Required'] }, detail: null });
  });

  it('promotes array values to fields', () => {
    const err = new HttpErrorResponse({ error: { name: ['Too long'], code: 'x' } });
    expect(extractServerError(err)).toEqual({ fields: { name: ['Too long'] }, detail: null });
  });

  it('falls back to detail', () => {
    const err = new HttpErrorResponse({ error: { detail: 'Boom' } });
    expect(extractServerError(err)).toEqual({ fields: null, detail: 'Boom' });
  });
});

describe('notifyServerError', () => {
  it('pushes a toast only when there is a global detail', () => {
    const add = vi.fn();
    const err = new HttpErrorResponse({ error: { detail: 'Boom' } });
    const fields = notifyServerError({ add } as never, err, 'Erreur', 'fallback');
    expect(add).toHaveBeenCalledWith({ severity: 'error', summary: 'Erreur', detail: 'Boom' });
    expect(fields).toBeNull();
  });

  it('returns fields and does NOT toast when only field errors', () => {
    const add = vi.fn();
    const err = new HttpErrorResponse({ error: { fields: { name: ['Required'] } } });
    const fields = notifyServerError({ add } as never, err, 'Erreur', 'fallback');
    expect(add).not.toHaveBeenCalled();
    expect(fields).toEqual({ name: ['Required'] });
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- --include "src/app/shared/forms/notify-error.spec.ts"`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

```ts
import { HttpErrorResponse } from '@angular/common/http';
import type { MessageService } from 'primeng/api';

export interface FieldErrors {
  [field: string]: string[];
}

export interface ServerError {
  fields: FieldErrors | null;
  detail: string | null;
}

/** Parse a DRF error body into { fields, detail }. Mirrors the inline logic
 * previously duplicated in each form's applyServerError(). */
export function extractServerError(err: HttpErrorResponse): ServerError {
  const body = err?.error as
    | { code?: string; detail?: string; fields?: FieldErrors }
    | null
    | undefined;

  if (body?.fields && Object.keys(body.fields).length > 0) {
    return { fields: body.fields, detail: null };
  }

  if (body && typeof body === 'object') {
    const fields: FieldErrors = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === 'code' || key === 'detail' || key === 'fields') continue;
      if (Array.isArray(value)) {
        fields[key] = value.filter((m): m is string => typeof m === 'string');
      }
    }
    if (Object.keys(fields).length > 0) return { fields, detail: null };
  }

  return { fields: null, detail: body?.detail ?? null };
}

/** Toast the global detail (if any) and return field errors for inline display.
 * `fallbackDetail` is shown when the server gives neither fields nor a detail. */
export function notifyServerError(
  messages: MessageService,
  err: HttpErrorResponse,
  summary: string,
  fallbackDetail: string,
): FieldErrors | null {
  const { fields, detail } = extractServerError(err);
  if (fields) return fields;
  messages.add({ severity: 'error', summary, detail: detail ?? fallbackDetail });
  return null;
}
```

- [ ] **Step 4 : Lancer le test → succès**

Run: `npm test -- --include "src/app/shared/forms/notify-error.spec.ts"`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/app/shared/forms/
git commit -m "feat(forms): add shared server-error → toast helper"
```

---

## Task 8 : Dépendance Quill (`p-editor`)

**Files:**
- Modify: `package.json`, `src/styles.scss`

- [ ] **Step 1 : Installer Quill**

Run: `npm install quill@^2.0.3`
Expected: ajoute `quill` aux `dependencies`.

- [ ] **Step 2 : Importer le CSS Quill (thème snow)** dans `src/styles.scss`, après les imports existants :

```scss
@import "quill/dist/quill.snow.css";
```

- [ ] **Step 3 : Vérifier le build et le poids**

Run: `npm run build`
Expected: build OK. Vérifier que l'**initial bundle** reste < 1.5MB (Quill doit tomber dans un chunk lazy via les routes edit lazy-loadées). Si l'initial déborde le budget error, ne PAS importer `Editor` dans un composant non-lazy ; confirmer que tous les conscommateurs de `p-editor` sont sous des routes `loadComponent`.

- [ ] **Step 4 : Commit**

```bash
git add package.json package-lock.json src/styles.scss
git commit -m "build: add quill for p-editor rich descriptions"
```

---

# PHASE B — Refactor des forms

> **Pattern de référence (à suivre pour toutes les pages avec header).** La Task 9 (events) montre le gabarit complet. Les tâches suivantes donnent : (a) la liste des onglets, (b) les champs par onglet avec leur widget, (c) le câblage du toggle active, (d) les diffs d'imports. **Reproduire la structure de la Task 9** en adaptant ces éléments.

> **i18n commun** (à créer une fois, Task 19) : `common.back`, `common.cancel`, `common.save` existent déjà. Ajouter `common.active`, `common.inactive`, `common.confirm_deactivate`, `common.update_failed`.

## Task 9 : events-form (référence complète)

**Files:**
- Modify: `src/app/features/events/events-form/events-form.component.html`
- Modify: `src/app/features/events/events-form/events-form.component.ts`
- Test: `src/app/features/events/events-form/events-form.component.spec.ts` (si présent — sinon ignorer l'étape spec)

Event **n'a pas** de `is_active` → **pas de toggle ni de badge** dans le header (seul cas). Onglets : `Infos` (name, refer_program_id, goal) · `Planning` (date, hour_start, hour_end) · `Détails` (total, color).

- [ ] **Step 1 : Réécrire le template**

```html
<div class="page page--narrow">
  <app-page-header [title]="(isEditMode() ? 'events.form.edit_title' : 'events.form.new_title') | transloco">
    <p-button
      slot="left"
      type="button"
      severity="secondary"
      [outlined]="true"
      icon="pi pi-arrow-left"
      [label]="'common.back' | transloco"
      [routerLink]="eventId() ? ['/events', eventId()] : ['/events']"
    />
  </app-page-header>

  @if (loading()) {
    <div class="card"><p class="meta-hint">{{ 'common.loading' | transloco }}…</p></div>
  } @else {
    <div class="card form-card builder-stack">
      <form [formGroup]="form">
        <p-tabs value="info" class="builder-tabs">
          <p-tablist>
            <p-tab value="info"><i class="pi pi-info-circle tab-icon"></i>{{ 'events.form.tab_info' | transloco }}</p-tab>
            <p-tab value="planning"><i class="pi pi-calendar tab-icon"></i>{{ 'events.form.tab_planning' | transloco }}</p-tab>
            <p-tab value="details"><i class="pi pi-sliders-h tab-icon"></i>{{ 'events.form.tab_details' | transloco }}</p-tab>
          </p-tablist>
          <p-tabpanels>
            <p-tabpanel value="info">
              <div class="builder-pane">
                <div class="meta-grid">
                  <app-meta-field class="meta-item--full" [label]="'events.form.name' | transloco" for="name"
                    [error]="fieldError('name')">
                    <input pInputText id="name" formControlName="name" />
                  </app-meta-field>
                  <app-meta-field [label]="'events.form.program' | transloco" for="refer_program_id"
                    [error]="fieldError('refer_program_id')">
                    <p-select inputId="refer_program_id" [options]="availablePrograms()"
                      formControlName="refer_program_id" optionLabel="name" optionValue="id" [filter]="true" />
                  </app-meta-field>
                  <app-meta-field [label]="'events.form.goal' | transloco" for="goal" [error]="fieldError('goal')">
                    <input pInputText id="goal" formControlName="goal" />
                  </app-meta-field>
                </div>
              </div>
            </p-tabpanel>
            <p-tabpanel value="planning">
              <div class="builder-pane">
                <div class="meta-grid">
                  <app-meta-field [label]="'events.form.date' | transloco" for="date" [error]="fieldError('date')">
                    <p-datepicker inputId="date" formControlName="date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" />
                  </app-meta-field>
                  <app-meta-field [label]="'events.form.hour_start' | transloco" for="hour_start">
                    <p-datepicker inputId="hour_start" formControlName="hour_start" [timeOnly]="true" [showIcon]="true" appendTo="body" />
                  </app-meta-field>
                  <app-meta-field [label]="'events.form.hour_end' | transloco" for="hour_end"
                    [error]="form.errors?.['time_range'] ? ('events.form.errors.time_range' | transloco) : null">
                    <p-datepicker inputId="hour_end" formControlName="hour_end" [timeOnly]="true" [showIcon]="true" appendTo="body" />
                  </app-meta-field>
                </div>
              </div>
            </p-tabpanel>
            <p-tabpanel value="details">
              <div class="builder-pane">
                <div class="meta-grid">
                  <app-meta-field [label]="'events.form.total' | transloco" for="total" [error]="fieldError('total')">
                    <p-inputnumber inputId="total" formControlName="total" [min]="0" [showButtons]="true"
                      buttonLayout="horizontal" spinnerMode="horizontal"
                      decrementButtonIcon="pi pi-minus" incrementButtonIcon="pi pi-plus" />
                  </app-meta-field>
                  <app-meta-field [label]="'events.form.color' | transloco">
                    <p-colorpicker formControlName="color" />
                    <input pInputText formControlName="color" class="flex-1" maxlength="10" />
                  </app-meta-field>
                </div>
              </div>
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      </form>

      <app-form-footer
        [saving]="saving()"
        [disabled]="form.invalid"
        [cancelLabel]="'common.cancel' | transloco"
        [saveLabel]="'common.save' | transloco"
        (cancel)="cancel()"
        (save)="submit()"
      />
    </div>
  }
</div>
```

- [ ] **Step 2 : Mettre à jour le composant `.ts`** : nouveaux imports, helper `fieldError`, méthode `cancel`, et brancher `applyServerError` sur le helper partagé.

Remplacer le bloc `imports: [...]` par :

```ts
  imports: [
    ReactiveFormsModule,
    RouterLink,
    InputText,
    InputNumber,
    Select,
    DatePicker,
    ColorPicker,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    TranslocoPipe,
    PageHeaderComponent,
    MetaFieldComponent,
    FormFooterComponent,
  ],
```

Ajouter les imports en tête de fichier :

```ts
import { Tabs } from 'primeng/tabs';
import { TabList } from 'primeng/tabs';
import { Tab } from 'primeng/tabs';
import { TabPanels } from 'primeng/tabs';
import { TabPanel } from 'primeng/tabs';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { MetaFieldComponent } from '../../../shared/ui/meta-field/meta-field.component';
import { FormFooterComponent } from '../../../shared/ui/form-footer/form-footer.component';
import { extractServerError } from '../../../shared/forms/notify-error';
```

> Vérifier l'export exact des sous-modules tabs de PrimeNG 21 (`Tabs`, `TabList`, `Tab`, `TabPanels`, `TabPanel` depuis `'primeng/tabs'`). Le form sports-form les utilise déjà — copier ses imports si besoin.

Retirer `KeyValuePipe` et `Message` des imports (plus de liste `p-message` inline). Supprimer la signal `errorMessage` usage inline : les erreurs globales passent désormais par toast.

Ajouter dans la classe :

```ts
  protected fieldError(name: string): string | null {
    const errs = this.fieldErrors();
    return errs?.[name]?.join(', ') ?? null;
  }

  protected cancel(): void {
    const id = this.eventId();
    this.router.navigate(id ? ['/events', id] : ['/events']);
  }
```

Remplacer le corps de `applyServerError` par l'usage du helper (toast pour le global) :

```ts
  private applyServerError(err: HttpErrorResponse): void {
    const { fields, detail } = extractServerError(err);
    this.fieldErrors.set(fields);
    if (!fields) {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: detail
          ? this.transloco.translate(detail)
          : this.transloco.translate('events.errors.unknown'),
      });
    }
  }
```

- [ ] **Step 3 : Ajouter les clés i18n events** (les 5 langues, Task 19 centralise — ici au minimum FR/EN) :
`events.form.tab_info`, `events.form.tab_planning`, `events.form.tab_details`. (Les autres clés `events.form.*` existent déjà.)

- [ ] **Step 4 : Vérifier**

Run: `npm run build` → OK.
Run: `npm test -- --include "src/app/features/events/events-form/events-form.component.spec.ts"` (si le spec existe) → adapter le spec aux nouveaux libellés si nécessaire, viser vert.

- [ ] **Step 5 : Commit**

```bash
git add src/app/features/events/events-form/ public/i18n/
git commit -m "refactor(events-form): QO edit template (page-header, tabs, meta-grid, footer)"
```

---

## Task 10 : programs-form

Toggle `is_active` (edit only). Onglets : `Infos` (name, team) · `Planning` (date_start, date_end, frequency_per_week) · `Description` (**Quill** `p-editor`).

- [ ] **Step 1 : Header** — comme Task 9 mais avec badge + toggle dans le header :

```html
  <app-page-header [title]="(isEditMode() ? 'programs.form.edit_title' : 'programs.form.new_title') | transloco">
    <p-button slot="left" type="button" severity="secondary" [outlined]="true"
      icon="pi pi-arrow-left" [label]="'common.back' | transloco"
      [routerLink]="programId() ? ['/programs', programId()] : ['/programs']" />
    @if (isEditMode()) {
      <app-status-badge slot="title-after"
        [kind]="activeValue() ? 'active' : 'inactive'"
        [label]="(activeValue() ? 'common.active' : 'common.inactive') | transloco" />
      <app-active-toggle slot="right" [entityId]="programId()!" [value]="activeValue()" [patch]="patchActive"
        [labels]="activeLabels()" (valueChange)="activeValue.set($event)" />
    }
  </app-page-header>
```

- [ ] **Step 2 : Onglets** — `meta-grid` par panneau. Description en pleine largeur via `p-editor` :

```html
<app-meta-field class="meta-item--full" [label]="'programs.form.description' | transloco">
  <p-editor formControlName="description" [style]="{ height: '12rem' }" />
</app-meta-field>
```

Le champ `team` en mode édition reste un `input` disabled (lecture) avec hint `programs.form.team_locked_help` ; en création, `p-select` filtrable. `frequency_per_week` → `p-inputnumber` spinner horizontal (`[min]="0" [max]="14"`).

- [ ] **Step 3 : Composant `.ts`** — ajouter :

```ts
  protected readonly activeValue = signal(false);
  protected readonly patchActive = (id: number, value: boolean) =>
    this.programsService.programsPartialUpdate(id, undefined, { is_active: value } as PatchedProgram);
  protected activeLabels = computed<ActiveToggleLabels>(() => ({
    active: this.transloco.translate('common.active'),
    inactive: this.transloco.translate('common.inactive'),
    confirm: this.transloco.translate('common.confirm_deactivate'),
    errorSummary: this.transloco.translate('common.error'),
    errorDetail: this.transloco.translate('common.update_failed'),
  }));
```

Initialiser `activeValue.set(program.is_active ?? true)` au chargement. Imports à ajouter : `Editor` (`primeng/editor`), `ConfirmDialog` (`primeng/confirmdialog`), `PageHeaderComponent`, `StatusBadgeComponent`, `ActiveToggleComponent`, `MetaFieldComponent`, `FormFooterComponent`, tabs. Ajouter `ConfirmationService` aux `providers` du composant (scope dialog), et `<p-confirmDialog />` au template. Remplacer `applyServerError` par le helper partagé (toast).

> **`programsPartialUpdate` signature** : `(id, includeInactive?, patchedProgram?)` → le body est le **3e** argument (passer `undefined` au 2e).

- [ ] **Step 4 : Vérifier** : `npm run build` ; `npm test -- --include ".../programs-form.component.spec.ts"` (si présent).

- [ ] **Step 5 : Commit** `refactor(programs-form): QO edit template + active toggle + Quill description`.

---

## Task 11 : teams-form (multi-onglets, fusion danger-zone)

Toggle `is_active` (edit only) **remplace** la danger-zone « désactiver » (on supprime la `<section>` rouge et le bouton `confirmDeactivate`). Onglets : `Infos` (name, sport, language, **is_public** en toggleswitch) · `Encadrement` (managers) [edit] · `Présences` (picklist statuts) [edit] · `Inscriptions` (auto_accept_policy, notify_managers) [edit]. Bloc quota-dépassé conservé (au-dessus du footer).

- [ ] **Step 1 : Header** — back (gauche) + badge + `app-active-toggle` (slot right, edit only), `patch` :

```ts
  protected readonly patchActive = (id: number, value: boolean) =>
    this.teamsService.teamsPartialUpdate(id, { is_active: value } as PatchedTeam);
```

> **`teamsPartialUpdate` signature** : `(id, patchedTeam?)` → le body est le **2e** argument (≠ admin).

- [ ] **Step 2 : Onglets + widgets** :
  - `Infos` : name (`input`, full), sport (`p-select` filtrable), language (`p-select`), is_public (`p-toggleswitch` dans un `app-meta-field` + hint).
  - `Encadrement` : managers (`p-multiSelect` filtrable, full).
  - `Présences` : statuts (`p-pickList`, full — conserver le `ng-template` item couleur).
  - `Inscriptions` : auto_accept_policy (`p-toggleSwitch` + hints conditionnels), notify_managers (`p-toggleSwitch`, visible si `!isAutoPolicy()`).
  - `is_active` retiré du corps (déplacé au header). Supprimer la `fieldset` legacy de is_active.

- [ ] **Step 3 : `.ts`** — supprimer `confirmDeactivate()` et la signal/section danger-zone ; ajouter `activeValue` + `patchActive` + `activeLabels` (cf. Task 10) ; `ConfirmationService` est déjà présent (utilisé par le toggle). Conserver `quotaExceeded`/`errorMessage` pour le bloc quota (cas spécial, reste inline). Imports partagés + tabs. Remplacer `applyServerError` global par toast.

- [ ] **Step 4 : Vérifier** : `npm run build` ; relancer le spec teams-form et l'adapter (la danger-zone n'existe plus).

- [ ] **Step 5 : Commit** `refactor(teams-form): QO tabbed edit template, fold deactivate into header toggle`.

---

## Task 12 : sports-form (admin, onglets de langue conservés)

Toggle `is_active` (edit only). Un seul `.card.form-card` (form petit) : `meta-grid` (slug, energy_systems) + bloc **onglets de langue** pour `name` (déjà présents). Lien « gérer modalités » → header `[slot=right]` (secondary outlined, `pi-tags`, edit only).

- [ ] **Step 1 : Header** — back + badge + toggle + bouton « modalités » :

```html
<p-button slot="right" type="button" severity="secondary" [outlined]="true" icon="pi pi-tags"
  [pTooltip]="'admin.sports.form.manage_modalities' | transloco" tooltipPosition="bottom"
  [routerLink]="['/admin/sports', sportId(), 'modalities']" />
```

(ordre slot right : `app-active-toggle` d'abord, puis le bouton modalités.)

- [ ] **Step 2 : Corps** — `.card.form-card` :

```html
<div class="meta-grid">
  <app-meta-field [label]="'admin.sports.form.slug' | transloco" for="slug" [error]="fieldError('slug')">
    <input pInputText id="slug" formControlName="slug" />
  </app-meta-field>
  <app-meta-field [label]="'admin.sports.form.energy_systems' | transloco">
    <p-multiSelect [options]="availableEnergySystems()" formControlName="energy_systems"
      optionLabel="name" optionValue="id" [filter]="true"
      [placeholder]="'admin.sports.form.energy_systems_placeholder' | transloco" />
  </app-meta-field>
  <app-meta-field class="meta-item--full" [label]="'admin.sports.fields.name' | transloco">
    <p-tabs value="fr" class="builder-tabs">
      <p-tablist>
        <p-tab value="fr">FR</p-tab><p-tab value="nl">NL</p-tab><p-tab value="en">EN</p-tab>
        <p-tab value="it">IT</p-tab><p-tab value="es">ES</p-tab>
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel value="fr"><input pInputText formControlName="name_fr" placeholder="Français" class="w-full" /></p-tabpanel>
        <p-tabpanel value="nl"><input pInputText formControlName="name_nl" placeholder="Nederlands" class="w-full" /></p-tabpanel>
        <p-tabpanel value="en"><input pInputText formControlName="name_en" placeholder="English" class="w-full" /></p-tabpanel>
        <p-tabpanel value="it"><input pInputText formControlName="name_it" placeholder="Italiano" class="w-full" /></p-tabpanel>
        <p-tabpanel value="es"><input pInputText formControlName="name_es" placeholder="Español" class="w-full" /></p-tabpanel>
      </p-tabpanels>
    </p-tabs>
  </app-meta-field>
</div>
```

Puis `app-form-footer`. Retirer le `is_active` checkbox du corps et le lien « modalités » inline (déplacé au header).

- [ ] **Step 3 : `.ts`** — `patchActive` admin (body en 3e position) :

```ts
  protected readonly patchActive = (id: number, value: boolean) =>
    this.sportsService.sportsPartialUpdate(id, undefined, { is_active: value } as PatchedSportAdmin);
```

Ajouter `activeValue`/`activeLabels`, `ConfirmationService` + `<p-confirmDialog/>`, imports partagés, helper toast.

- [ ] **Step 4 : Vérifier** : `npm run build` ; spec sports-form si présent.

- [ ] **Step 5 : Commit** `refactor(sports-form): QO edit template + header active toggle & modalities link`.

---

## Task 13 : modalities-form (admin, petit — gabarit admin réutilisable)

Toggle `is_active` (edit only). **Pas d'onglets externes** : un `.card.form-card` + `meta-grid`. Champs : selon le form actuel (`modalities-form.component.html`) — typiquement `slug`/`code` + name multilingue (`name_fr…es`, mêmes onglets langue que sports) + éventuels champs spécifiques (lire le fichier). 

- [ ] **Step 1** : Lire `modalities-form.component.html` pour relever les `formControlName` exacts.
- [ ] **Step 2** : Réécrire en `.page.page--narrow` + `app-page-header` (back + badge + toggle) + `.card.form-card` + `meta-grid` (un `app-meta-field` par champ ; name multilingue en onglets `builder-tabs` comme sports) + `app-form-footer`.
- [ ] **Step 3** : `.ts` — `patchActive` :

```ts
  protected readonly patchActive = (id: number, value: boolean) =>
    this.modalitiesService.modalitiesPartialUpdate(id, undefined, { is_active: value } as PatchedModalityAdmin);
```

(+ activeValue/labels, ConfirmationService + confirmDialog, imports partagés, helper toast.) **Vérifier** le nom exact de la méthode (`modalitiesPartialUpdate`) et du type patched dans `api/`.

- [ ] **Step 4** : `npm run build` ; spec si présent.
- [ ] **Step 5** : Commit `refactor(modalities-form): QO edit template + header active toggle`.

---

## Task 14 : energy-systems-form (admin, petit)

Identique à Task 13 (gabarit admin), champs propres à `energy-systems-form.component.html`. `patchActive` :

```ts
  protected readonly patchActive = (id: number, value: boolean) =>
    this.energySystemsService.energySystemsPartialUpdate(id, undefined, { is_active: value } as PatchedEnergySystemAdmin);
```

- [ ] Step 1 : lire le html actuel (controls). 2 : réécrire (page-header+card+meta-grid+footer). 3 : `.ts` (toggle admin + helper + imports). 4 : build. 5 : commit `refactor(energy-systems-form): QO edit template + header active toggle`.

---

## Task 15 : energy-segments-form (admin, petit)

Identique à Task 13. `patchActive` :

```ts
  protected readonly patchActive = (id: number, value: boolean) =>
    this.energySegmentsService.energySegmentsPartialUpdate(id, undefined, { is_active: value } as PatchedEnergySegmentAdmin);
```

- [ ] Step 1 : lire le html actuel. 2 : réécrire. 3 : `.ts`. 4 : build. 5 : commit `refactor(energy-segments-form): QO edit template + header active toggle`.

---

## Task 16 : profile

Pas de toggle is_active (compte perso). Onglets : `Compte` (username + email en lecture, first_name, last_name) · `Préférences` (language) · (date_joined en lecture, dans `Compte`). Pas d'onglet Sécurité si le composant ne gère pas le mot de passe (lire le `.ts` ; s'il n'y a pas de flux password ici, garder 2 onglets `Compte`/`Préférences`).

- [ ] **Step 1** : Lire `profile.component.ts` pour confirmer les controls (`first_name`, `last_name`, `language`) et l'absence/présence d'un flux mot de passe.
- [ ] **Step 2** : Réécrire en `.page.page--narrow` + `app-page-header` (back vers `/dashboard` + titre `profile.title`, **pas** de badge/toggle) + `.card.form-card.builder-stack` + `p-tabs` (`Compte`/`Préférences`) + `app-form-footer`. Les champs lecture (username/email/date_joined) → `app-meta-field` avec une `<span>` projetée (pas d'input).
- [ ] **Step 3** : `.ts` — imports partagés ; remplacer les `p-message` succès/erreur par des toasts (`messageService`). Garder la logique de save existante.
- [ ] **Step 4** : `npm run build` ; spec profile si présent.
- [ ] **Step 5** : Commit `refactor(profile): QO edit template (tabs, meta-grid, toast feedback)`.

---

## Task 17 : round-form-dialog (dialog — pas de page-header)

Reste dans `p-dialog`. Appliquer `meta-grid` + `app-meta-field` + `app-form-footer` au contenu. Pas de toggle/badge.

- [ ] **Step 1** : Réécrire le contenu du `<p-dialog>` :

```html
<form [formGroup]="form">
  <div class="meta-grid">
    <app-meta-field class="meta-item--full" [label]="'events.round_form.fields.count' | transloco"
      for="round_count" [hint]="'events.round_form.fields.count_help' | transloco">
      <p-inputNumber inputId="round_count" formControlName="count" [min]="1" [showButtons]="true"
        buttonLayout="horizontal" spinnerMode="horizontal" [useGrouping]="false"
        decrementButtonIcon="pi pi-minus" incrementButtonIcon="pi pi-plus" />
    </app-meta-field>
    <app-meta-field [label]="'events.round_form.fields.t_start' | transloco" for="round_t_start"
      [error]="(form.controls.t_start.invalid && form.controls.t_start.dirty) ? ('events.shared.time_mmss_invalid' | transloco) : null">
      <input pInputText id="round_t_start" formControlName="t_start" inputmode="numeric"
        pattern="\d{1,3}:[0-5]\d" maxlength="6" [placeholder]="'events.round_form.fields.time_placeholder' | transloco" />
    </app-meta-field>
    <app-meta-field [label]="'events.round_form.fields.t_break' | transloco" for="round_t_break"
      [error]="(form.controls.t_break.invalid && form.controls.t_break.dirty) ? ('events.shared.time_mmss_invalid' | transloco) : null">
      <input pInputText id="round_t_break" formControlName="t_break" inputmode="numeric"
        pattern="\d{1,3}:[0-5]\d" maxlength="6" [placeholder]="'events.round_form.fields.time_placeholder' | transloco" />
    </app-meta-field>
  </div>
</form>
<app-form-footer
  [saving]="saving()"
  [disabled]="form.invalid"
  [cancelLabel]="'events.round_form.cancel' | transloco"
  [saveLabel]="'events.round_form.save' | transloco"
  (cancel)="onCancel()"
  (save)="submit()"
/>
```

- [ ] **Step 2** : `.ts` — ajouter `MetaFieldComponent`, `FormFooterComponent` aux imports ; retirer `Message`/`KeyValuePipe` si désormais inutiles ; basculer les erreurs globales en toast via le helper.
- [ ] **Step 3** : `npm run build` ; spec round-form si présent.
- [ ] **Step 4** : Commit `refactor(round-form-dialog): meta-grid + shared form-footer`.

---

## Task 18 : exercise-form-dialog (dialog — pas de page-header)

Comme Task 17 : lire `exercise-form-dialog.component.html`, envelopper chaque champ dans `app-meta-field` au sein d'un `meta-grid`, remplacer le pied par `app-form-footer`, erreurs globales en toast.

- [ ] Step 1 : lire le html actuel. 2 : réécrire (meta-grid + meta-field + form-footer). 3 : `.ts` imports + toast. 4 : build + spec. 5 : commit `refactor(exercise-form-dialog): meta-grid + shared form-footer`.

---

# PHASE C — Finalisation

## Task 19 : Clés i18n (5 langues)

**Files:** `public/i18n/{fr,nl,en,it,es}.json`

- [ ] **Step 1** : Ajouter dans chaque fichier (5 langues) les clés communes :
  - `common.active`, `common.inactive`, `common.confirm_deactivate`, `common.update_failed`, `common.error` (si absent), `common.loading` (si absent).
  - Les clés d'onglets : `events.form.tab_info|tab_planning|tab_details`, et toute clé `*.tab_*` introduite par les forms (programs, teams, profile).
- [ ] **Step 2** : Traduire réellement (FR/EN soignés ; NL/IT/ES au moins cohérents — les stubs existants tolèrent le fallback EN backend mais le frontend Transloco n'a pas de fallback auto, donc remplir les 5).
- [ ] **Step 3** : Vérifier qu'aucune clé n'apparaît telle quelle dans l'UI (grep des nouvelles clés présentes dans les 5 fichiers).

Run: `npm run build`
Expected: OK.

- [ ] **Step 4** : Commit `i18n: add edit-page common + tab keys (5 langs)`.

## Task 20 : Vérification finale

- [ ] **Step 1 : Build complet**

Run: `npm run build`
Expected: succès, initial bundle sous le budget (sinon investiguer le lazy-load de `p-editor`).

- [ ] **Step 2 : Suite de tests**

Run: `npm test`
Expected: tous verts. Corriger les specs de forms cassés par les nouveaux libellés/structures.

- [ ] **Step 3 : Vérif manuelle ciblée** (dev server `npm start`) sur 1 page de chaque catégorie : un form métier (events ou teams), un form admin (sports), profile, un dialog (round). Vérifier : header back/titre-centré/badge/toggle, onglets, toggle active (PATCH + confirm en désactivation + toast d'erreur), erreurs en toast, **dark-mode** (basculer `.dark-mode` sur `<html>`), responsive ≤640px (header empilé) et ≤768px (meta-grid 1 col), AXE sans violation bloquante.

- [ ] **Step 4 : Commit éventuel** des derniers ajustements, puis squash/merge selon la skill `finishing-a-development-branch`.

---

## Self-Review (rempli par l'auteur du plan)

**Couverture spec :** §1a styles → Task 1 ; §1b composants → Tasks 2-6 ; §1c toast → Task 7 ; §1d Quill → Task 8 ; §2 gabarit → Task 9 (référence) ; §3 onglets par page → Tasks 9-18 ; §4 widgets → intégrés par form ; §5 hors-périmètre respecté (backend/list/detail/dashboard intacts) ; §6 critères → Task 20 ; badge obligatoire → présent dans chaque header sauf events (pas de is_active, conforme) ; Quill descriptions → Task 10 ; erreurs toast → Task 7 + chaque form ; composants anti-duplication → Tasks 2-6 réutilisés partout.

**Placeholders :** les Tasks 13-15/18 demandent de *lire le html actuel* pour relever les `formControlName` — ce n'est pas un placeholder mais une étape de découverte volontaire (forms admin quasi identiques, champs variables). Les méthodes de service (`modalitiesPartialUpdate`, etc.) sont à confirmer dans `api/` (signatures connues : body en 3e position pour les admin, 2e pour teams).

**Cohérence des types :** `ActiveToggleLabels` (Task 6) réutilisé tel quel dans Tasks 10-15 ; `extractServerError`/`notifyServerError` + `FieldErrors` (Task 7) cohérents ; `patch: (id, value) => Observable<unknown>` respecté par tous les `patchActive` ; `app-form-footer` API (`cancelLabel`/`saveLabel`/`saving`/`disabled` + outputs `cancel`/`save`) identique partout.
