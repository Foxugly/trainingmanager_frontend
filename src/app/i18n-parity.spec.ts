import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * i18n key-parity guard.
 *
 * Loads all 5 catalogs in `public/i18n/` and asserts every non-reference
 * language has EXACTLY the same set of dotted keys as `fr` (the reference).
 * Failing prints the missing/extra keys per language so drift is fixed at
 * the source. New keys must always land in all 5 languages.
 */

const REFERENCE = 'fr';
const LANGS = ['fr', 'en', 'nl', 'it', 'es'] as const;
type Lang = (typeof LANGS)[number];

const I18N_DIR = join(process.cwd(), 'public', 'i18n');

type Json = Record<string, unknown>;

function loadCatalog(lang: Lang): Json {
  const raw = readFileSync(join(I18N_DIR, `${lang}.json`), 'utf-8');
  return JSON.parse(raw) as Json;
}

/** Flatten a nested object to the set of its leaf keys in `a.b.c` form. */
function flattenKeys(obj: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>();
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) keys.add(prefix);
    return keys;
  }
  for (const [k, v] of Object.entries(obj as Json)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const nested of flattenKeys(v, path)) keys.add(nested);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

function diff(reference: Set<string>, candidate: Set<string>): { missing: string[]; extra: string[] } {
  const missing = [...reference].filter((k) => !candidate.has(k)).sort();
  const extra = [...candidate].filter((k) => !reference.has(k)).sort();
  return { missing, extra };
}

describe('i18n catalog parity', () => {
  const referenceKeys = flattenKeys(loadCatalog(REFERENCE));

  it('reference catalog (fr) has keys', () => {
    expect(referenceKeys.size).toBeGreaterThan(0);
  });

  for (const lang of LANGS.filter((l) => l !== REFERENCE)) {
    it(`${lang}.json has exactly the same keys as ${REFERENCE}.json`, () => {
      const candidateKeys = flattenKeys(loadCatalog(lang));
      const { missing, extra } = diff(referenceKeys, candidateKeys);

      const message =
        `i18n key drift in ${lang}.json vs ${REFERENCE}.json` +
        (missing.length ? `\n  Missing (${missing.length}): ${missing.join(', ')}` : '') +
        (extra.length ? `\n  Extra (${extra.length}): ${extra.join(', ')}` : '');

      expect(missing, message).toEqual([]);
      expect(extra, message).toEqual([]);
    });
  }
});
