import { afterEach, describe, expect, it } from 'vitest';
import { TURNSTILE_SCRIPT_URL, ensureTurnstileScript } from './turnstile-loader';

describe('ensureTurnstileScript', () => {
  const scripts = () =>
    Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[data-turnstile-loader]'));

  afterEach(() => scripts().forEach((s) => s.remove()));

  it('injects the Turnstile script once', () => {
    ensureTurnstileScript();
    ensureTurnstileScript();
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].src).toBe(TURNSTILE_SCRIPT_URL);
    expect(scripts()[0].async).toBe(true);
  });

  it('removes a script that failed to load so a retry re-injects it', () => {
    ensureTurnstileScript();
    scripts()[0].dispatchEvent(new Event('error'));
    expect(scripts()).toHaveLength(0);
    ensureTurnstileScript();
    expect(scripts()).toHaveLength(1);
  });
});
