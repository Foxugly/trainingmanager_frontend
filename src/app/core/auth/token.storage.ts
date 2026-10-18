import { Injectable } from '@angular/core';

export const ACCESS_KEY = 'tm_access_token';
export const REFRESH_KEY = 'tm_refresh_token';

@Injectable({ providedIn: 'root' })
export class TokenStorage {
  getAccess(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  setAccess(token: string): void {
    localStorage.setItem(ACCESS_KEY, token);
  }

  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  setRefresh(token: string): void {
    localStorage.setItem(REFRESH_KEY, token);
  }

  setTokens(access: string, refresh: string): void {
    this.setAccess(access);
    this.setRefresh(refresh);
  }

  clear(): void {
    // Refresh first: it is the key other tabs read as "logged out" (storage event).
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ACCESS_KEY);
  }

  hasRefresh(): boolean {
    return this.getRefresh() !== null;
  }
}
