import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenStorage } from './token.storage';

describe('TokenStorage', () => {
  let storage: TokenStorage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    storage = TestBed.inject(TokenStorage);
  });

  it('returns null when no access token is stored', () => {
    expect(storage.getAccess()).toBeNull();
  });

  it('sets and reads back the access token', () => {
    storage.setAccess('access-123');
    expect(storage.getAccess()).toBe('access-123');
  });

  it('sets and reads back the refresh token', () => {
    storage.setRefresh('refresh-xyz');
    expect(storage.getRefresh()).toBe('refresh-xyz');
  });

  it('setTokens persists both tokens', () => {
    storage.setTokens('a', 'r');
    expect(storage.getAccess()).toBe('a');
    expect(storage.getRefresh()).toBe('r');
  });

  it('clear() removes both tokens', () => {
    storage.setTokens('a', 'r');
    storage.clear();
    expect(storage.getAccess()).toBeNull();
    expect(storage.getRefresh()).toBeNull();
  });

  it('hasRefresh() reflects refresh token presence', () => {
    expect(storage.hasRefresh()).toBe(false);
    storage.setRefresh('r');
    expect(storage.hasRefresh()).toBe(true);
    storage.clear();
    expect(storage.hasRefresh()).toBe(false);
  });
});
