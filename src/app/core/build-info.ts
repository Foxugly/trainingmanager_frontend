/**
 * Build identity, frozen at compile time.
 *
 * `TM_BUILD_SHA` is replaced by esbuild when the deploy workflow runs
 * `ng build --define TM_BUILD_SHA="'<sha>'"` (see deploy.yml). Outside that
 * build (dev, unit tests, e2e) the symbol is undefined: the `typeof` guard
 * avoids the ReferenceError and we fall back to an empty string.
 */
declare const TM_BUILD_SHA: string | undefined;

export const BUILD_SHA: string = typeof TM_BUILD_SHA === 'string' ? TM_BUILD_SHA.trim() : '';

/** Sentry release name for a build SHA. */
export function sentryReleaseFor(sha: string): string {
  return `tm-frontend@${sha}`;
}

/**
 * Sentry release: the build SHA when the deploy injected it, else the runtime
 * value (SSM SENTRY_RELEASE), else nothing.
 */
export function resolveSentryRelease(buildSha: string, runtimeRelease: string | undefined): string {
  if (buildSha) {
    return sentryReleaseFor(buildSha);
  }
  return (runtimeRelease ?? '').trim();
}
