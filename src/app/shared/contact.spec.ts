import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMAIL_USER,
  EMAIL_HOST,
  EMAIL_TLD,
  PHONE_COUNTRY,
  PHONE_PARTS,
  WEBSITE_URL,
  WEBSITE_DISPLAY,
  emailDisplay,
  phoneDisplay,
  openContactEmail,
} from './contact';

describe('contact util', () => {
  it('exposes the email parts as separate constants (no full email string at rest)', () => {
    expect(EMAIL_USER).toBe('info');
    expect(EMAIL_HOST).toBe('foxugly');
    expect(EMAIL_TLD).toBe('com');
  });

  it('exposes phone country + parts and website constants', () => {
    expect(PHONE_COUNTRY).toBe('+32');
    expect(PHONE_PARTS).toEqual(['478', '811988']);
    expect(WEBSITE_URL).toBe('https://www.foxugly.com');
    expect(WEBSITE_DISPLAY).toBe('www.foxugly.com');
  });

  it('emailDisplay() obfuscates the @ and . to defeat naive crawlers', () => {
    const out = emailDisplay();
    expect(out).toBe('info [at] foxugly [dot] com');
    expect(out).not.toContain('@');
    expect(out).not.toMatch(/info\.foxugly/);
  });

  it('phoneDisplay() returns parts joined by spaces with country prefix', () => {
    expect(phoneDisplay()).toBe('+32 478 811988');
  });

  describe('openContactEmail()', () => {
    let originalLocation: Location;
    let assignSpy: ReturnType<typeof vi.fn<(v: string) => void>>;

    beforeEach(() => {
      originalLocation = window.location;
      assignSpy = vi.fn<(v: string) => void>();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, set href(v: string) { assignSpy(v); } },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    });

    it('builds a mailto: URL with the reconstructed address and url-encoded subject', () => {
      openContactEmail('Training Manager');
      expect(assignSpy).toHaveBeenCalledTimes(1);
      const url = assignSpy.mock.calls[0][0] as string;
      expect(url).toMatch(/^mailto:info@foxugly\.com\?/);
      expect(url).toContain('subject=Training+Manager');
    });

    it('encodes special characters in the subject', () => {
      openContactEmail('Help! ñ & symbols');
      const url = assignSpy.mock.calls[0][0] as string;
      expect(url).toContain('subject=Help%21+%C3%B1+%26+symbols');
    });
  });
});
