import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** The five localized name controls every taxonomy entity carries. */
const NAME_CONTROLS = ['name_fr', 'name_nl', 'name_en', 'name_it', 'name_es'] as const;

/**
 * Group-level validator for admin taxonomy forms: requires at least one of the
 * five `name_xx` controls to be non-empty (after trimming). Returns
 * `{ nameRequired: true }` when all five are blank, otherwise null. Prevents
 * creating a 100%-anonymous entity (no slug, no name in any language).
 */
export const atLeastOneName: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const hasName = NAME_CONTROLS.some((name) => {
    const value = group.get(name)?.value as string | null | undefined;
    return (value ?? '').trim().length > 0;
  });
  return hasName ? null : { nameRequired: true };
};
