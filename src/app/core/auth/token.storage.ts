import { Injectable } from '@angular/core';

/**
 * Non-secret "a session exists" hint in localStorage. It tells a fresh page
 * load whether to try the silent restore, and its `storage` events tell the
 * other tabs "session changed" (new value) or "logged out" (removed). It never
 * carries a token: the refresh token lives in the backend's HttpOnly cookie
 * (`tm_refresh`, see auth-cookie.ts) and the access token in memory only.
 */
export const SESSION_HINT_KEY = 'tm.session';

/** Pre-cookie storage keys. Read once for the migration, then deleted. */
export const LEGACY_ACCESS_KEY = 'tm_access_token';
export const LEGACY_REFRESH_KEY = 'tm_refresh_token';

@Injectable({ providedIn: 'root' })
export class TokenStorage {
  // Memory only: a reload re-obtains the access token from the refresh cookie.
  private access: string | null = null;

  getAccess(): string | null {
    return this.access;
  }

  setAccess(token: string): void {
    this.access = token;
  }

  /**
   * Whether a refresh is worth attempting: a live in-memory session, the
   * session hint, or a legacy refresh token still waiting for its migration.
   */
  hasSession(): boolean {
    return this.access !== null || this.hasHint() || this.getLegacyRefresh() !== null;
  }

  hasHint(): boolean {
    return read(SESSION_HINT_KEY) !== null;
  }

  /** New hint value -> a `storage` event in every other tab ("session changed"). */
  announceSession(): void {
    write(SESSION_HINT_KEY, String(Date.now()));
  }

  /** Refresh token left in localStorage by the pre-cookie SPA, if any. */
  getLegacyRefresh(): string | null {
    return read(LEGACY_REFRESH_KEY);
  }

  dropLegacy(): void {
    remove(LEGACY_REFRESH_KEY);
    remove(LEGACY_ACCESS_KEY);
  }

  /** Drop the local session; removing the hint tells the other tabs "logged out". */
  clear(): void {
    this.access = null;
    remove(SESSION_HINT_KEY);
    this.dropLegacy();
  }
}

// Storage can throw (privacy mode, blocked site data): the hint is a
// convenience, the session itself still works for this tab without it.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
