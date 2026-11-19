import { describe, it, expect } from 'vitest';
import cs from '../../src/i18n/locales/cs.json';
import en from '../../src/i18n/locales/en.json';

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === 'string'
      ? [[path, entry]]
      : Object.entries(flatten(entry as Record<string, unknown>, path));
  }));
}

describe('cs/en translation catalogs', () => {
  it('have matching non-empty keys and ICU placeholders', () => {
    const c = flatten(cs), e = flatten(en);
    expect(Object.keys(c).sort()).toEqual(Object.keys(e).sort());
    for (const key of Object.keys(c)) {
      expect(c[key]?.trim().length).toBeGreaterThan(0);
      expect(e[key]?.trim().length).toBeGreaterThan(0);
      const placeholders = (v: string) => [...v.matchAll(/\{([a-zA-Z]+)(?:,|\})/g)].map(match => match[1]).sort();
      expect(placeholders(c[key]!)).toEqual(placeholders(e[key]!));
    }
  });
});
