import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/**
 * Shared dark/light theme service (fleet standard).
 *
 * - Persists the choice in `localStorage['theme']` (`'light' | 'dark'`).
 * - Applies the `.dark-mode` class on `<html>` — this matches both the token
 *   overrides in `styles/_tokens.scss` and PrimeNG's
 *   `providePrimeNG({ theme: { options: { darkModeSelector: '.dark-mode' } } })`.
 * - Falls back to `prefers-color-scheme` when nothing is stored yet.
 *
 * An inline anti-FOUC script in `index.html` sets `.dark-mode` on `<html>`
 * BEFORE Angular bootstraps to avoid a light flash; this service then takes
 * over and keeps `<html>` in sync with the signal.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.readInitialTheme());

  constructor() {
    // Keep <html>.dark-mode + localStorage in sync with the signal.
    effect(() => {
      const theme = this.theme();
      const root = document.documentElement;
      root.classList.toggle('dark-mode', theme === 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Private-mode / storage disabled: theme still applies for the session.
      }
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  set(theme: Theme): void {
    this.theme.set(theme);
  }

  private readInitialTheme(): Theme {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
}
