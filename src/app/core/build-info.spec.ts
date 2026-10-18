import { describe, expect, it } from 'vitest';
import { BUILD_SHA, resolveSentryRelease, sentryReleaseFor } from './build-info';

describe('build-info', () => {
  it('has no SHA outside the deploy build (symbol not defined)', () => {
    expect(BUILD_SHA).toBe('');
  });

  it('prefers the build SHA for the Sentry release', () => {
    expect(resolveSentryRelease('abc123', '0.0.1')).toBe(sentryReleaseFor('abc123'));
    expect(sentryReleaseFor('abc123')).toBe('tm-frontend@abc123');
  });

  it('falls back to the runtime (SSM) release, then to nothing', () => {
    expect(resolveSentryRelease('', ' 0.0.1 ')).toBe('0.0.1');
    expect(resolveSentryRelease('', undefined)).toBe('');
  });
});
