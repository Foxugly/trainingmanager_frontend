import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LEGACY_ACCESS_KEY,
  LEGACY_REFRESH_KEY,
  SESSION_HINT_KEY,
  TokenStorage,
} from './token.storage';

describe('TokenStorage', () => {
  let storage: TokenStorage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    storage = TestBed.inject(TokenStorage);
  });

  it('keeps the access token in memory only', () => {
    expect(storage.getAccess()).toBeNull();
    storage.setAccess('access-123');
    expect(storage.getAccess()).toBe('access-123');
    expect(Object.values({ ...localStorage })).not.toContain('access-123');
    expect(localStorage.length).toBe(0);
  });

  it('hasSession() is true for an access token, the hint, or a legacy refresh', () => {
    expect(storage.hasSession()).toBe(false);
    storage.setAccess('a');
    expect(storage.hasSession()).toBe(true);
    storage.clear();

    storage.announceSession();
    expect(storage.hasSession()).toBe(true);
    storage.clear();

    localStorage.setItem(LEGACY_REFRESH_KEY, 'legacy');
    expect(storage.hasSession()).toBe(true);
    expect(storage.getLegacyRefresh()).toBe('legacy');
  });

  it('announceSession() writes a non-secret hint', () => {
    storage.setAccess('access-123');
    storage.announceSession();
    const hint = localStorage.getItem(SESSION_HINT_KEY);
    expect(hint).toMatch(/^\d+$/);
    expect(storage.hasHint()).toBe(true);
  });

  it('clear() drops the access token, the hint and the legacy keys', () => {
    storage.setAccess('a');
    storage.announceSession();
    localStorage.setItem(LEGACY_ACCESS_KEY, 'la');
    localStorage.setItem(LEGACY_REFRESH_KEY, 'lr');

    storage.clear();

    expect(storage.getAccess()).toBeNull();
    expect(storage.hasSession()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('dropLegacy() removes only the legacy keys', () => {
    storage.announceSession();
    localStorage.setItem(LEGACY_ACCESS_KEY, 'la');
    localStorage.setItem(LEGACY_REFRESH_KEY, 'lr');
    storage.dropLegacy();
    expect(storage.getLegacyRefresh()).toBeNull();
    expect(localStorage.getItem(LEGACY_ACCESS_KEY)).toBeNull();
    expect(storage.hasHint()).toBe(true);
  });
});
