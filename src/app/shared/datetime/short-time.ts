/**
 * Trim a backend time string ("HH:MM:SS" or "HH:MM") down to "HH:MM".
 *
 * Returns the first 5 characters of the input, or an empty string when the
 * value is null/undefined.
 */
export function shortTime(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 5);
}
