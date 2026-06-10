import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

/** A route component that can report pending unsaved edits. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Blocks in-app navigation away from a form with unsaved edits until the user
 * confirms. Forms mark their form pristine on a successful save, so this only
 * fires on a genuine abandon (Back / Cancel / nav-link with dirty fields).
 *
 * Uses the native confirm() — synchronous and reliable from a guard (a styled
 * PrimeNG dialog can't be hosted outside a component context). Note this does
 * NOT cover a browser refresh/close; add a `beforeunload` handler for that if
 * ever needed.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component?.hasUnsavedChanges?.()) return true;
  const transloco = inject(TranslocoService);
  return window.confirm(transloco.translate('common.unsaved_changes_confirm'));
};
