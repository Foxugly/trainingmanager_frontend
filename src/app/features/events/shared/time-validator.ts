import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const MMSS_RE = /^\d{1,3}:[0-5]\d$/;

/**
 * Validator for MM:SS / MMM:SS time strings (no hours).
 * Accepts empty values (the field stays optional).
 * Rejects free-form text, missing colon, seconds out of [0..59], etc.
 */
export const timeMmSsValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = control.value as string | null | undefined;
  if (value === null || value === undefined || value === '') return null;
  return MMSS_RE.test(value) ? null : { time_mmss: true };
};
