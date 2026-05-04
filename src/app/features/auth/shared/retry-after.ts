import { HttpHeaders } from '@angular/common/http';

/**
 * Parse a Retry-After response header per RFC 7231 §7.1.3 :
 * either a delta-seconds integer or an HTTP-date.
 * Returns the number of seconds to wait, or null if unparseable / absent.
 */
export function parseRetryAfterSeconds(headers: HttpHeaders | null | undefined): number | null {
  if (!headers) return null;
  const raw = headers.get('Retry-After') ?? headers.get('retry-after');
  if (!raw) return null;

  const asInt = Number.parseInt(raw, 10);
  if (Number.isFinite(asInt) && String(asInt) === raw.trim()) {
    return asInt > 0 ? asInt : 0;
  }

  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    const diffMs = asDate - Date.now();
    return diffMs > 0 ? Math.ceil(diffMs / 1000) : 0;
  }

  return null;
}
