// Issue #123 — 18 gem/rune visuals without changes to socket or save IDs.
// GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { GEM_BASES, GEM_IDS, isGemId, tierOf, socketBonus } from '../../src/game/gems/gemCatalog';
import { gemArtVariant } from '../../src/game/gems/gemArt';

describe('Issue 123 — gem/rune visual identity', () => {
  it('covers every socketable gem and rune and all three tiers', () => {
    expect(GEM_BASES).toHaveLength(6);
    expect(GEM_IDS).toHaveLength(18);
    const visuals = new Set<string>();
    for (const id of GEM_IDS) {
      const variant = gemArtVariant(id);
      expect(variant).not.toBeNull();
      expect(variant?.tier).toBe(tierOf(id));
      expect(variant?.baseId).toBe(id.slice(0,-2));
      expect(variant?.kind).toBe(id.startsWith('gem.') ? 'gem' : 'rune');
      visuals.add(variant!.baseId);
      expect(isGemId(id)).toBe(true);
    }
    expect(visuals.size).toBe(6);
  });
  it('rejects malformed IDs without creating a fallback phantom gemstone', () => {
    for (const bad of ['', '__proto__', 'gem.ruby.0', 'gem.ruby.4', 'rune.danger.1', null, 12, {}]) {
      expect(gemArtVariant(bad)).toBeNull();
    }
    const before = socketBonus('gem.ruby.1','armor');
    for(const id of GEM_IDS) expect(gemArtVariant(id)).toEqual(gemArtVariant(id));
    expect(socketBonus('gem.ruby.1','armor')).toEqual(before);
  });
});
