import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/game/data/items';
import {
  AFFIX_PREFIXES, AFFIX_SUFFIXES, AFFIX_TIERS,
  rollAffixes, validateAffixCombination, formatItemNameSegments,
  type AffixRollInput, type RolledAffix
} from '../../src/game/items/affixGeneration';

const sword = (rarity: AffixRollInput['rarity'] = 'LEGENDARY', itemLevel = 90): AffixRollInput => ({
  rarity, itemLevel, tags: ['weapon', 'melee']
});
const caster = (rarity: AffixRollInput['rarity'] = 'LEGENDARY', itemLevel = 90): AffixRollInput => ({
  rarity, itemLevel, tags: ['weapon', 'caster', 'minion']
});
const mighty: RolledAffix = { id: 'mighty', kind: 'prefix', stat: 'strength', tier: 1, value: 3 };
const fireWard: RolledAffix = { id: 'flames', kind: 'suffix', stat: 'fireResistance', tier: 1, value: 3 };

describe('Agent 18 — tiered affix generation (Prompt 14)', () => {
  it('exposes distinct typed prefix/suffix pools covering all required stats and six level-gated tiers', () => {
    const prefixes = AFFIX_PREFIXES.map(entry => entry.id);
    const suffixes = AFFIX_SUFFIXES.map(entry => entry.id);
    expect(prefixes.length).toBeGreaterThan(10);
    expect(suffixes.length).toBeGreaterThan(10);
    expect(new Set([...prefixes, ...suffixes]).size).toBe(prefixes.length + suffixes.length);
    expect(AFFIX_PREFIXES.every(entry => entry.kind === 'prefix' && entry.weight > 0)).toBe(true);
    expect(AFFIX_SUFFIXES.every(entry => entry.kind === 'suffix' && entry.weight > 0)).toBe(true);
    expect(AFFIX_TIERS).toHaveLength(6);
    expect(AFFIX_TIERS.map(tier => tier.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(AFFIX_TIERS.map(tier => tier.minItemLevel)).toEqual([1, 12, 24, 36, 52, 72]);
    const supported = new Set<string>([...AFFIX_PREFIXES, ...AFFIX_SUFFIXES].map(def => def.stat));
    for (const stat of [
      'strength', 'dexterity', 'intelligence', 'vitality',
      'critChance', 'critDamage', 'attackSpeed', 'moveSpeed',
      'fireDamage', 'physicalDamage', 'poisonDamage',
      'fireResistance', 'coldResistance', 'poisonResistance',
      'maxHealth', 'resourceRegen', 'cooldownReduction',
      'skillRank', 'summonDamage'
    ]) {
      expect(supported.has(stat)).toBe(true);
    }
  });

  it('uses rarity limits for affix count and quality, without consuming RNG for common loot', () => {
    let calls = 0;
    const never = { next: () => { calls++; return 0.4; } };
    expect(rollAffixes(sword('COMMON'), never)).toEqual([]);
    expect(calls).toBe(0);
    for (const [rarity, count, maxTier] of [
      ['UNCOMMON', 1, 2], ['RARE', 3, 4],
      ['EPIC', 4, 5], ['LEGENDARY', 5, 6]
    ] as const) {
      const affixes = rollAffixes({ rarity, itemLevel: 90, tags: ['jewelry'] }, new SeededRng(505));
      expect(affixes).toHaveLength(count);
      expect(affixes.every(affix => affix.tier <= maxTier)).toBe(true);
    }
  });

  it('replays exactly for a seed, keeps inputs unchanged, and returns frozen data', () => {
    const tags = Object.freeze(['weapon', 'melee'] as const);
    const preferredStats = Object.freeze(['strength'] as const);
    const input = Object.freeze({ rarity: 'LEGENDARY' as const, itemLevel: 95, tags, preferredStats });
    const first = rollAffixes(input, new SeededRng(0xabcde));
    const repeat = rollAffixes(input, new SeededRng(0xabcde));
    const other = rollAffixes(input, new SeededRng(0xabcdf));
    expect(first).toEqual(repeat);
    expect(first).not.toEqual(other);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every(Object.isFrozen)).toBe(true);
    expect(input.itemLevel).toBe(95);
    expect(tags).toEqual(['weapon', 'melee']);
    expect(preferredStats).toEqual(['strength']);
  });

  it('never picks a tier above item level or rarity in 1,000 seeded generations', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const rarity = seed % 2 ? 'LEGENDARY' : 'RARE';
      const itemLevel = seed % 3 === 0 ? 1 : seed % 3 === 1 ? 24 : 55;
      const result = rollAffixes(sword(rarity, itemLevel), new SeededRng(seed));
      const limit = rarity === 'RARE' ? 4 : 6;
      for (const affix of result) {
        const tier = AFFIX_TIERS.find(t => t.tier === affix.tier);
        expect(tier).toBeDefined();
        expect(tier!.minItemLevel).toBeLessThanOrEqual(itemLevel);
        expect(affix.tier).toBeLessThanOrEqual(limit);
        expect(Number.isFinite(affix.value) && affix.value > 0).toBe(true);
      }
      expect(validateAffixCombination(result, sword(rarity, itemLevel))).toBe(true);
    }
  });

  it('generates no duplicate bonuses, conflicting damage elements, or invalid combinations across different items', () => {
    const configurations: AffixRollInput[] = [
      sword(), caster(), { rarity: 'EPIC', itemLevel: 65, tags: ['armor'] },
      { rarity: 'LEGENDARY', itemLevel: 99, tags: ['shield'] },
      { rarity: 'RARE', itemLevel: 40, tags: ['jewelry'] }
    ];
    for (let seed = 0; seed < 1000; seed++) {
      const input = configurations[seed % configurations.length]!;
      const affixes = rollAffixes(input, new SeededRng(seed * 71 + 3));
      expect(validateAffixCombination(affixes, input)).toBe(true);
      expect(new Set(affixes.map(a => a.id)).size).toBe(affixes.length);
      expect(new Set(affixes.map(a => a.stat)).size).toBe(affixes.length);
      expect(affixes.filter(a => a.stat === 'fireDamage' || a.stat === 'poisonDamage').length)
        .toBeLessThanOrEqual(1);
    }
  });

  it('enforces affinity prerequisities and gates special modifiers by rarity and tags', () => {
    for (let seed = 0; seed < 600; seed++) {
      const martial = rollAffixes(sword('LEGENDARY'), new SeededRng(seed));
      expect(martial.some(a => a.stat === 'skillRank' || a.stat === 'summonDamage')).toBe(false);
      const rare = rollAffixes(caster('RARE'), new SeededRng(seed));
      expect(rare.some(a => a.stat === 'skillRank' || a.stat === 'summonDamage')).toBe(false);
    }
    let special = 0;
    for (let seed = 0; seed < 600; seed++) {
      const affixes = rollAffixes(caster(), new SeededRng(seed));
      special += affixes.filter(a => a.stat === 'skillRank' || a.stat === 'summonDamage').length;
    }
    expect(special).toBeGreaterThan(0);
    expect(validateAffixCombination([
      { id: 'brutal', kind: 'prefix', stat: 'physicalDamage', tier: 1, value: 3 }
    ], caster())).toBe(false);
  });

  it('weights requested class-relevant stats more often, without modifying caller preferences', () => {
    const normal: AffixRollInput = { rarity: 'UNCOMMON', itemLevel: 55, tags: ['jewelry'] };
    const preferred: AffixRollInput = { ...normal, preferredStats: ['strength'] };
    let baseStrength = 0, preferredStrength = 0;
    for (let seed = 0; seed < 800; seed++) {
      baseStrength += Number(rollAffixes(normal, new SeededRng(seed + 89))[0]?.stat === 'strength');
      preferredStrength += Number(rollAffixes(preferred, new SeededRng(seed + 89))[0]?.stat === 'strength');
    }
    expect(preferredStrength).toBeGreaterThan(baseStrength * 1.5);
  });

  it('rejects unsupported, non-finite and contradictory inputs instead of making random fallbacks', () => {
    const good = sword();
    const badInputs: AffixRollInput[] = [
      { ...good, itemLevel: 0 }, { ...good, itemLevel: -5 },
      { ...good, itemLevel: NaN }, { ...good, itemLevel: Infinity },
      { ...good, itemLevel: 1.5 }, { ...good, itemLevel: 101 },
      { ...good, rarity: 'MYTHIC' as AffixRollInput['rarity'] },
      { ...good, tags: [] }, { ...good, tags: ['weapon', 'shield'] },
      { ...good, tags: ['weapon', 'melee', 'caster'] },
      { ...good, tags: ['weapon', 'unsupported' as 'melee'] },
      { ...good, preferredStats: ['unknown' as 'strength'] }
    ];
    for (const input of badInputs) {
      expect(() => rollAffixes(input, new SeededRng(100))).toThrow();
    }
    for (const next of [() => NaN, () => -0.1, () => 1, () => Infinity]) {
      expect(() => rollAffixes(good, { next })).toThrow(RangeError);
    }
    expect(() => rollAffixes(good, null as unknown as SeededRng)).toThrow();
  });

  it('validates duplicate IDs, duplicate bonuses, elemental exclusions, unknown entries and impossible tiers', () => {
    expect(validateAffixCombination([mighty, fireWard], sword())).toBe(true);
    expect(validateAffixCombination([mighty, mighty], sword())).toBe(false);
    expect(validateAffixCombination([mighty, {
      id: 'bear', kind: 'suffix', stat: 'strength', tier: 1, value: 3
    }], sword())).toBe(false);
    expect(validateAffixCombination([
      { id: 'scorching', kind: 'prefix', stat: 'fireDamage', tier: 1, value: 3 },
      { id: 'venom', kind: 'suffix', stat: 'poisonDamage', tier: 1, value: 3 }
    ], sword())).toBe(false);
    expect(validateAffixCombination([{ ...mighty, id: 'unknown' }])).toBe(false);
    expect(validateAffixCombination([{ ...mighty, stat: 'dexterity' }])).toBe(false);
    expect(validateAffixCombination([{ ...mighty, kind: 'suffix' }])).toBe(false);
    expect(validateAffixCombination([{ ...mighty, tier: 99 as 1 }])).toBe(false);
    expect(validateAffixCombination([{ ...mighty, value: NaN }])).toBe(false);
    expect(validateAffixCombination([{ ...mighty, value: Infinity }])).toBe(false);
    expect(validateAffixCombination([{ ...mighty, value: -1 }])).toBe(false);
    expect(validateAffixCombination([{ ...mighty, tier: 5 }], sword('RARE', 90))).toBe(false);
    expect(validateAffixCombination([{ ...mighty, tier: 2 }], sword('LEGENDARY', 1))).toBe(false);
    expect(validateAffixCombination('bad' as unknown as RolledAffix[])).toBe(false);
  });

  it('formats English/Czech typed segments without rerolling; agrees Czech adjectives with known base gender', () => {
    const english = formatItemNameSegments('broadsword', [mighty, fireWard], 'en');
    const czech = formatItemNameSegments('broadsword', [fireWard, mighty], 'cs');
    expect(english.text).toBe('Mighty Broadsword of Flames');
    expect(czech.text).toBe('Mocný široký meč ohně');
    expect(english.baseId).toBe(czech.baseId);
    expect(english.parts.map(p => p.id)).toEqual(czech.parts.map(p => p.id));
    expect(english.parts.map(p => p.key)).toEqual(czech.parts.map(p => p.key));
    expect(formatItemNameSegments('hauberk', [mighty], 'cs').text).toBe('Mocná kroužková zbroj');
    expect(formatItemNameSegments('gauntlets', [mighty], 'cs').text).toBe('Mocné rukavice');
    expect(english.parts.map(p => p.kind)).toEqual(['prefix', 'base', 'suffix']);
    expect(english.parts[1]?.key).toBe('item.base.broadsword');
    expect(Object.isFrozen(english.parts)).toBe(true);
    expect(formatItemNameSegments('unreleased-item', [mighty], 'en')).toMatchObject({
      baseId: 'unreleased-item', text: null, resolvedBase: false
    });
    expect(() => formatItemNameSegments('', [mighty], 'en')).toThrow();
    expect(() => formatItemNameSegments('broadsword', [mighty], 'fr' as 'cs')).toThrow();
    expect(() => formatItemNameSegments('broadsword', [mighty, mighty], 'en')).toThrow();
  });
});
