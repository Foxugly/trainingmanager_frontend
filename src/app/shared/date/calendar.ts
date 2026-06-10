/**
 * Pure, locale-agnostic calendar date helpers shared by the month-grid views
 * (events-calendar, programs-detail). All operate on local-time `Date` objects
 * and treat Monday as the first day of the week. No `this`, no signals — safe
 * to import as free functions.
 */

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  return x;
}

export function endOfWeekMonday(d: Date): Date {
  const x = startOfWeekMonday(d);
  x.setDate(x.getDate() + 6);
  return x;
}

/**
 * Map-key form of a local date — identical to {@link isoDate} (YYYY-MM-DD).
 * Kept as a named alias so calendar callers reading as a "day key" stay
 * expressive; there is a single source of truth (`isoDate`).
 */
export const dayKey = isoDate;
