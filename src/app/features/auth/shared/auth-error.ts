import { HttpErrorResponse } from '@angular/common/http';

export const AUTH_ERROR_UNKNOWN = 'auth.errors.unknown';

/**
 * Clé i18n d'une erreur d'API d'authentification. Le `detail` brut du backend
 * n'est jamais affiché (il peut être en anglais ou technique) : on traduit selon
 * le code HTTP.
 *
 * - 429                     : trop de tentatives ;
 * - réseau (0) ou 5xx       : erreur générique ;
 * - `credentials` + 400/401 : identifiants incorrects ;
 * - autre                   : `fallback` (erreur générique par défaut).
 */
export function authErrorKey(
  err: HttpErrorResponse | null | undefined,
  options: { credentials?: boolean; fallback?: string } = {},
): string {
  const fallback = options.fallback ?? AUTH_ERROR_UNKNOWN;
  const status = err?.status ?? 0;
  if (status === 429) return 'auth.errors.rate_limited';
  if (status === 0 || status >= 500) return fallback;
  if (options.credentials && (status === 400 || status === 401)) {
    return 'auth.errors.invalid_credentials';
  }
  return fallback;
}
