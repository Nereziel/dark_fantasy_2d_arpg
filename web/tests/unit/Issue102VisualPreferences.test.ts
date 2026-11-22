// Issue #102: browser-local accessibility settings, entirely outside game saves.
// GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VISUAL_PREFERENCES, VISUAL_PREFERENCES_KEY,
  normalizeVisualPreferences, readVisualPreferences,
  writeVisualPreferences, shouldReduceMotion
} from '../../src/game/ui/visualPreferences';

describe('Issue 102: visual preference validation and browser persistence', () => {
  it('returns immutable, safe defaults for corrupt and hostile inputs', () => {
    for (const invalid of [null, undefined, '', false, 17, [], () => 1]) {
      expect(normalizeVisualPreferences(invalid)).toEqual(DEFAULT_VISUAL_PREFERENCES);
    }
    const normalized = normalizeVisualPreferences({
      motion: 'bad', shake: Number.NaN, uiScale: 200,
      floatingCombatText: 'false', highContrast: 1, unknown: true
    });
    expect(normalized).toEqual(DEFAULT_VISUAL_PREFERENCES);
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it('persists selected preferences with a fixed versioned key, roundtrips on reload', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); }
    };
    expect(readVisualPreferences(storage)).toEqual(DEFAULT_VISUAL_PREFERENCES);
    const changed = writeVisualPreferences(storage, {
      motion: 'reduced', shake: 0, uiScale: 1.1,
      floatingCombatText: false, highContrast: true
    });
    expect(JSON.parse(store.get(VISUAL_PREFERENCES_KEY)!)).toEqual(changed);
    expect(readVisualPreferences(storage)).toEqual(changed);
    expect(Object.isFrozen(changed)).toBe(true);
    expect(Object.isFrozen(readVisualPreferences(storage))).toBe(true);
  });

  it('accepts partial valid preferences but falls back individually for invalid fields', () => {
    expect(normalizeVisualPreferences({ shake: 0.5, uiScale: 0.9 })).toEqual({
      ...DEFAULT_VISUAL_PREFERENCES, shake: 0.5, uiScale: 0.9
    });
    expect(normalizeVisualPreferences({
      motion: 'full', shake: -0.5, uiScale: Infinity,
      floatingCombatText: false, highContrast: true
    })).toEqual({
      ...DEFAULT_VISUAL_PREFERENCES, motion: 'full',
      floatingCombatText: false, highContrast: true
    });
  });

  it('honors system reduced-motion unless overridden, without changing game timing', () => {
    for (const osReduced of [false, true]) {
      expect(shouldReduceMotion({ ...DEFAULT_VISUAL_PREFERENCES, motion: 'system' }, osReduced))
        .toBe(osReduced);
      expect(shouldReduceMotion({ ...DEFAULT_VISUAL_PREFERENCES, motion: 'reduced' }, osReduced))
        .toBe(true);
      expect(shouldReduceMotion({ ...DEFAULT_VISUAL_PREFERENCES, motion: 'full' }, osReduced))
        .toBe(false);
    }
  });

  it('ignores oversized/corrupted storage and handles blocked reads or writes', () => {
    const readonly = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); }
    };
    expect(readVisualPreferences(readonly)).toEqual(DEFAULT_VISUAL_PREFERENCES);
    expect(writeVisualPreferences(readonly, { shake: 0 })).toEqual({
      ...DEFAULT_VISUAL_PREFERENCES, shake: 0
    });
    expect(readVisualPreferences({
      getItem: () => '{ invalid', setItem: () => {}
    })).toEqual(DEFAULT_VISUAL_PREFERENCES);
    expect(readVisualPreferences({
      getItem: () => 'x'.repeat(100_000), setItem: () => {}
    })).toEqual(DEFAULT_VISUAL_PREFERENCES);
    expect(readVisualPreferences(null)).toEqual(DEFAULT_VISUAL_PREFERENCES);
  });
});
