/**
 * Pure, component-agnostic IANA timezone-options builder for filterable
 * selects. Uses `Intl.supportedValuesOf('timeZone')` when available, with a
 * curated fallback for older runtimes. No `this`, no signals — safe to import
 * as a free function.
 */

/** Curated fallback if Intl.supportedValuesOf is unavailable (older runtimes). */
export const TIMEZONE_FALLBACK: readonly string[] = [
  'UTC',
  'Europe/Brussels',
  'Europe/Paris',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
];

/** IANA timezones as {label,value} for the filterable select. */
export function timezoneOptions(): { label: string; value: string }[] {
  let zones: readonly string[];
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    zones = typeof supported === 'function' ? supported('timeZone') : TIMEZONE_FALLBACK;
  } catch {
    zones = TIMEZONE_FALLBACK;
  }
  return zones.map((z) => ({ label: z, value: z }));
}
