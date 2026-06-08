import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/**
 * One geocoding hit returned by Nominatim. We only consume `display_name`
 * (the human-readable, fully-resolved address line) but keep `lat`/`lon`
 * around in case a caller wants coordinates later.
 */
export interface NominatimResult {
  readonly display_name: string;
  readonly lat?: string;
  readonly lon?: string;
}

/**
 * Marks a request as a cross-origin call to a NON-API host so the app's
 * interceptors (auth Bearer, Accept-Language re-write, apiBase routing) leave
 * it alone. The auth/language interceptors already skip non-API URLs, but the
 * token makes the intent explicit and future-proof.
 */
export const SKIP_API_INTERCEPTORS = new HttpContextToken<boolean>(() => false);

/**
 * Thin wrapper over the public OpenStreetMap Nominatim geocoder. This is NOT
 * the app API — it is called directly at `nominatim.openstreetmap.org`, never
 * through `environment.apiBase`. Respect Nominatim's usage policy: callers
 * debounce, we cap `limit=5`, and we send `Accept-Language` for localized
 * results. One small, dedicated service so the usage rules live in one place.
 */
@Injectable({ providedIn: 'root' })
export class NominatimService {
  private readonly http = inject(HttpClient);

  private static readonly ENDPOINT = 'https://nominatim.openstreetmap.org/search';

  /**
   * Search free-text addresses. Returns at most 5 suggestions; resolves to an
   * empty array on any error (the caller still allows free-text entry).
   *
   * @param query the user-typed address fragment (≥ 3 chars recommended)
   * @param lang  current app language, sent as `Accept-Language`
   */
  search(query: string, lang: string): Observable<NominatimResult[]> {
    const q = query.trim();
    if (q.length < 3) return of([]);
    const url =
      `${NominatimService.ENDPOINT}?format=json&addressdetails=1&limit=5&q=` +
      encodeURIComponent(q);
    return this.http
      .get<NominatimResult[]>(url, {
        headers: { 'Accept-Language': lang },
        context: new HttpContext().set(SKIP_API_INTERCEPTORS, true),
      })
      .pipe(
        map((results) => (Array.isArray(results) ? results : [])),
        catchError(() => of([])),
      );
  }
}
