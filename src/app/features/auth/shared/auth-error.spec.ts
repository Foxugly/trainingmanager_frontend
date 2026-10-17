import { HttpErrorResponse } from '@angular/common/http';
import { authErrorKey } from './auth-error';

const err = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('authErrorKey', () => {
  it('429 : trop de tentatives', () => {
    expect(authErrorKey(err(429))).toBe('auth.errors.rate_limited');
  });

  it('réseau et 5xx : erreur générique', () => {
    expect(authErrorKey(err(0))).toBe('auth.errors.unknown');
    expect(authErrorKey(err(503, { detail: 'Service Unavailable' }))).toBe('auth.errors.unknown');
  });

  it('identifiants : 400 et 401 donnent « identifiants incorrects »', () => {
    expect(authErrorKey(err(401, { detail: 'No active account' }), { credentials: true })).toBe(
      'auth.errors.invalid_credentials',
    );
    expect(authErrorKey(err(400), { credentials: true })).toBe('auth.errors.invalid_credentials');
  });

  it("n'expose jamais le detail brut et respecte le repli fourni", () => {
    expect(authErrorKey(err(400, { detail: 'Something in English' }), { fallback: 'x.y' })).toBe(
      'x.y',
    );
  });
});
