/**
 * Frontend runtime configuration, read at startup from `window.__TM_*` globals
 * that nginx injects into index.html (see deploy/nginx/tm-frontend.conf +
 * deploy/fetch-frontend-runtime-from-ssm.sh). In dev (ng serve) those globals
 * are absent and we fall back to the inline defaults / environment below.
 *
 * This config is 100% PUBLIC (visible in the served HTML): only put values that
 * are public by nature (API URL, Sentry DSN, feature flags). Never a secret.
 */
import { environment } from '../../environments/environment';
import { APP_VERSION } from '../shared/app-version';

export interface RuntimeSentryConfig {
  dsn: string;
  environment: string;
  release: string;
}

export interface RuntimeConfig {
  apiBaseUrl: string;
  version: string;
  turnstileSiteKey: string;
  sentry: RuntimeSentryConfig;
  features: Record<string, boolean>;
}

interface RuntimeGlobals {
  __TM_API_BASE_URL?: string;
  __TM_VERSION?: string;
  __TM_TURNSTILE_SITE_KEY?: string;
  __TM_SENTRY_DSN?: string;
  __TM_SENTRY_ENV?: string;
  __TM_SENTRY_RELEASE?: string;
  __TM_FEATURES?: Record<string, boolean>;
}

const DEFAULT_SENTRY_ENV = 'production';

function trimmedOr(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Resolution: runtime global (trimmed) → inline/dev default. Synchronous read
 * (the globals are in the DOM before bootstrap), so usable from main.ts as well
 * as from Angular services.
 */
export function getRuntimeConfig(): RuntimeConfig {
  const globals = globalThis as unknown as RuntimeGlobals;

  // Shallow-copied so a consumer mutating config.features never reaches back
  // into the injected window.__TM_FEATURES global.
  const features =
    globals.__TM_FEATURES && typeof globals.__TM_FEATURES === 'object'
      ? { ...globals.__TM_FEATURES }
      : {};

  return {
    // Prod: injected by nginx (window.__TM_API_BASE_URL = https://tm-api.foxugly.com).
    // Dev / ng serve: no global → fall back to environment.apiBase (local backend).
    apiBaseUrl: trimmedOr(globals.__TM_API_BASE_URL, environment.apiBase),
    // Prod: injected from SSM /tm-frontend/prod/VERSION (like quizonline). Dev /
    // unseeded: fall back to the build-time package.json version.
    version: trimmedOr(globals.__TM_VERSION, APP_VERSION),
    // Cloudflare Turnstile public site key (captcha on register / forgot-password).
    // Prod: SSM /tm-frontend/prod/TURNSTILE_SITE_KEY (rotate without a rebuild).
    turnstileSiteKey: trimmedOr(globals.__TM_TURNSTILE_SITE_KEY, environment.turnstileSiteKey),
    sentry: {
      dsn: (globals.__TM_SENTRY_DSN ?? '').trim(),
      environment: trimmedOr(globals.__TM_SENTRY_ENV, DEFAULT_SENTRY_ENV),
      release: (globals.__TM_SENTRY_RELEASE ?? '').trim(),
    },
    features,
  };
}
