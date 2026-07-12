import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark-mode');
    TestBed.resetTestingModule();
  });

  function create(): ThemeService {
    return TestBed.runInInjectionContext(() => new ThemeService());
  }

  it('defaults to light when nothing is stored (jsdom has no dark preference)', () => {
    const svc = create();
    expect(svc.theme()).toBe('light');
    expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
  });

  it('reads a persisted dark theme and applies .dark-mode on <html>', () => {
    localStorage.setItem('theme', 'dark');
    const svc = create();
    expect(svc.theme()).toBe('dark');
    TestBed.tick();
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
  });

  it('toggle() flips the theme and persists it', () => {
    const svc = create();
    svc.toggle();
    TestBed.tick();
    expect(svc.theme()).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    svc.toggle();
    TestBed.tick();
    expect(svc.theme()).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
  });

  it('set() forces a specific theme', () => {
    const svc = create();
    svc.set('dark');
    TestBed.tick();
    expect(svc.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
  });
});
