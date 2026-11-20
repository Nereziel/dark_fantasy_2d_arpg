import { describe, expect, it } from 'vitest';
import { ITEM_TEMPLATES, SeededRng } from '../../src/game/data/items';
import {
  LOOT_TABLES, bossGuaranteedLoot, eligibleLootEntries, rollLootTable,
  selectWeightedLootEntry,
  type LootContext, type LootRarity
} from '../../src/game/loot/lootTables';

const context: LootContext = {
  monsterLevel: 40, playerLevel: 35, eliteModifiers: [],
  isBoss: false, zone: 'wilderness', difficulty: 'normal', magicFind: 0
};

const quality: Record<LootRarity, number> = {
  COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5
};

function avgQuality(input: LootContext, seedCount = 1000): number {
  let sum = 0;
  for (let seed = 1; seed <= seedCount; seed++) {
    const pick = rollLootTable(input, new SeededRng(seed));
    expect(pick).not.toBeNull();
    sum += quality[pick!.rarity];
  }
  return sum / seedCount;
}

describe('Agent 20 / Prompt 16 — deterministic, pure loot tables', () => {
  it('defines independent tier, region and difficulty tables with stable item-base references', () => {
    for (const id of ['normal', 'elite', 'boss', 'wilderness', 'crypt', 'veteran', 'nightmare', 'hell'] as const) {
      expect(LOOT_TABLES[id].length, id).toBeGreaterThan(0);
    }
    const knownIds = new Set(ITEM_TEMPLATES.map(item => item.id));
    for (const entries of Object.values(LOOT_TABLES)) {
      expect(Object.isFrozen(entries)).toBe(true);
      for (const entry of entries) {
        expect(knownIds.has(entry.itemBaseId)).toBe(true);
        expect(quality[entry.rarity]).toBeGreaterThan(0);
        expect(Number.isFinite(entry.weight) && entry.weight > 0).toBe(true);
        expect(Object.isFrozen(entry)).toBe(true);
      }
    }
    expect(Object.isFrozen(LOOT_TABLES)).toBe(true);
  });

  it('composes normal, elite, boss, region and difficulty without cross-table mutation', () => {
    const normal = eligibleLootEntries(context);
    const elite = eligibleLootEntries({ ...context, eliteModifiers: ['armored'] });
    const boss = eligibleLootEntries({ ...context, isBoss: true, eliteModifiers: ['armored'] });
    const crypt = eligibleLootEntries({ ...context, zone: 'crypt', difficulty: 'nightmare' });
    expect(normal.some(entry => entry.sourceTableId === 'normal')).toBe(true);
    expect(normal.some(entry => entry.sourceTableId === 'wilderness')).toBe(true);
    expect(elite.some(entry => entry.sourceTableId === 'elite')).toBe(true);
    expect(boss.some(entry => entry.sourceTableId === 'boss')).toBe(true);
    expect(boss.some(entry => entry.sourceTableId === 'elite')).toBe(false);
    expect(crypt.some(entry => entry.sourceTableId === 'crypt')).toBe(true);
    expect(crypt.some(entry => entry.sourceTableId === 'nightmare')).toBe(true);
    expect(crypt.some(entry => entry.sourceTableId === 'wilderness')).toBe(false);
    const original = LOOT_TABLES.normal[0]!.weight;
    normal[0]!.weight = 999;
    expect(LOOT_TABLES.normal[0]!.weight).toBe(original);
  });

  it('honors explicit table IDs without silently falling back to the tier pool', () => {
    const entries = eligibleLootEntries({ ...context, lootTableId: 'crypt' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(entry => entry.sourceTableId === 'crypt')).toBe(true);
    expect(eligibleLootEntries({ ...context, lootTableId: 'non-existent' as LootContext['lootTableId'] })).toEqual([]);
    expect(rollLootTable({ ...context, lootTableId: 'non-existent' as LootContext['lootTableId'] }, new SeededRng(1))).toBeNull();
    expect(eligibleLootEntries({ ...context, lootTableId: 'hell', difficulty: 'normal' })).toEqual([]);
  });

  it('filters high-tier drops by monster and player levels', () => {
    const low = eligibleLootEntries({ ...context, monsterLevel: 1, playerLevel: 1 });
    expect(low.length).toBeGreaterThan(0);
    expect(low.every(entry => entry.rarity !== 'EPIC' && entry.rarity !== 'LEGENDARY')).toBe(true);
    const high = eligibleLootEntries({ ...context, monsterLevel: 40, playerLevel: 35 });
    expect(high.some(entry => entry.rarity === 'LEGENDARY')).toBe(true);
  });

  it('selects weighted buckets at 0, exact boundaries and 1; ignores unusable weights', () => {
    const entries = [
      { id: 'zero', weight: 0 }, { id: 'badNegative', weight: -100 },
      { id: 'badNaN', weight: Number.NaN }, { id: 'badInfinity', weight: Number.POSITIVE_INFINITY },
      { id: 'first', weight: 1 }, { id: 'second', weight: 3 }
    ];
    expect(selectWeightedLootEntry(entries, 0)?.id).toBe('first');
    expect(selectWeightedLootEntry(entries, 0.249999)?.id).toBe('first');
    expect(selectWeightedLootEntry(entries, 0.25)?.id).toBe('second');
    expect(selectWeightedLootEntry(entries, 0.999999)?.id).toBe('second');
    expect(selectWeightedLootEntry(entries, 1)?.id).toBe('second');
    for (const roll of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01]) {
      expect(selectWeightedLootEntry(entries, roll)).toBeNull();
    }
    expect(selectWeightedLootEntry([{ id: 'none', weight: 0 }, { id: 'nan', weight: Number.NaN }], 0)).toBeNull();
    expect(selectWeightedLootEntry([{ id: 'huge', weight: Number.MAX_VALUE }, { id: 'small', weight: 1 }], 0)).toMatchObject({ id: 'huge' });
    expect(entries[0]?.weight).toBe(0);
  });

  it('does not loop or consume RNG for an ineligible pool; consumes one roll for a valid pool', () => {
    let calls = 0;
    const rng = { next: () => { calls++; return 0.5; } };
    expect(rollLootTable({ ...context, lootTableId: 'hell', difficulty: 'normal' }, rng)).toBeNull();
    expect(calls).toBe(0);
    const result = rollLootTable(context, rng);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({ guaranteed: false });
    expect(calls).toBe(1);
    expect(rollLootTable(context, { next: () => Number.NaN })).toBeNull();
    expect(rollLootTable(context, { next: () => -1 })).toBeNull();
  });

  it('preserves the same roll sequence for identical RNG seeds and immutable contexts', () => {
    const frozen: LootContext = Object.freeze({
      ...context, eliteModifiers: Object.freeze(['frenzied', 'armored']), magicFind: 65
    });
    const a = new SeededRng(202616);
    const b = new SeededRng(202616);
    expect(Array.from({ length: 100 }, () => rollLootTable(frozen, a)))
      .toEqual(Array.from({ length: 100 }, () => rollLootTable(frozen, b)));
    expect(a.state).toBe(b.state);
    expect(frozen.eliteModifiers).toEqual(['frenzied', 'armored']);
  });

  it('elite enemies have statistically higher quality than normal enemies over 1000 seeds', () => {
    const normal = avgQuality(context);
    const elite = avgQuality({ ...context, eliteModifiers: ['frenzied', 'armored'] });
    expect(elite).toBeGreaterThan(normal + 0.4);
  });

  it('boss random loot is stronger than elite over 1000 seeds, before guaranteed loot', () => {
    const elite = avgQuality({ ...context, eliteModifiers: ['frenzied'] });
    const boss = avgQuality({ ...context, isBoss: true });
    expect(boss).toBeGreaterThan(elite + 0.3);
  });

  it('magic find and difficulty improve rarity odds across 1000 deterministic seeds', () => {
    const normal = avgQuality(context);
    const highMagicFind = avgQuality({ ...context, magicFind: 500 });
    const hell = avgQuality({ ...context, difficulty: 'hell' });
    expect(highMagicFind).toBeGreaterThan(normal + 0.1);
    expect(hell).toBeGreaterThan(normal);
  });

  it('elite modifiers improve odds, deduplicate repeats and apply a documented cap', () => {
    const plain = eligibleLootEntries(context);
    const two = eligibleLootEntries({ ...context, eliteModifiers: ['frenzied', 'armored'] });
    const repeated = eligibleLootEntries({ ...context, eliteModifiers: ['frenzied', 'armored', 'frenzied'] });
    const many = eligibleLootEntries({
      ...context, eliteModifiers: ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    });
    const four = eligibleLootEntries({ ...context, eliteModifiers: ['a', 'b', 'c', 'd'] });
    const rareWeight = (entries: ReturnType<typeof eligibleLootEntries>): number =>
      entries.filter(entry => quality[entry.rarity] >= 3).reduce((sum, entry) => sum + entry.weight, 0);
    expect(rareWeight(two)).toBeGreaterThan(rareWeight(plain));
    expect(repeated).toEqual(two);
    expect(many).toEqual(four);
  });

  it('guarantees curated boss drops independently of RNG, zone and difficulty', () => {
    expect(bossGuaranteedLoot(context)).toEqual([]);
    const wild = bossGuaranteedLoot({ ...context, isBoss: true });
    const crypt = bossGuaranteedLoot({ ...context, isBoss: true, zone: 'crypt' });
    expect(wild.length).toBeGreaterThan(0);
    expect(crypt.length).toBeGreaterThan(0);
    expect(wild[0]!.itemBaseId).not.toBe(crypt[0]!.itemBaseId);
    expect(wild.every(drop => drop.guaranteed && quality[drop.rarity] >= 4)).toBe(true);
    expect(crypt.every(drop => drop.guaranteed && quality[drop.rarity] >= 4)).toBe(true);
    expect(bossGuaranteedLoot({ ...context, isBoss: true, difficulty: 'hell' })
      .some(drop => drop.rarity === 'LEGENDARY')).toBe(true);
    expect(bossGuaranteedLoot({ ...context, isBoss: true })).toEqual(wild);
  });

  it('returns finite, capped item levels and only stable references (never Item instances)', () => {
    const drop = rollLootTable({ ...context, monsterLevel: 999, playerLevel: 999 }, new SeededRng(77))!;
    expect(drop.itemLevel).toBe(100);
    expect(drop.itemBaseId).toBeTruthy();
    expect(drop.tableId).toBeTruthy();
    expect(drop).not.toHaveProperty('affixes');
    expect(drop).not.toHaveProperty('slot');
    expect(drop).not.toHaveProperty('icon');
    expect(drop).not.toHaveProperty('health');
  });

  it('rejects invalid required context, rather than falling back to another loot table', () => {
    const invalid = [
      { ...context, monsterLevel: 0 }, { ...context, monsterLevel: Number.NaN },
      { ...context, monsterLevel: Number.POSITIVE_INFINITY }, { ...context, playerLevel: -1 },
      { ...context, playerLevel: 2.5 }, { ...context, monsterLevel: 1001 },
      { ...context, zone: 'unknown' as LootContext['zone'] },
      { ...context, difficulty: 'unknown' as LootContext['difficulty'] },
      { ...context, eliteModifiers: ['good', 1] as unknown as string[] },
      { ...context, isBoss: 'yes' as unknown as boolean }
    ];
    for (const attempt of invalid) {
      expect(eligibleLootEntries(attempt)).toEqual([]);
      expect(rollLootTable(attempt, new SeededRng(12))).toBeNull();
      // Keep the malformed isBoss case malformed; set the others to boss.
      const bossAttempt = typeof attempt.isBoss === 'boolean'
        ? { ...attempt, isBoss: true }
        : attempt;
      expect(bossGuaranteedLoot(bossAttempt)).toEqual([]);
    }
    expect(eligibleLootEntries(null as unknown as LootContext)).toEqual([]);
  });

  it('clamps invalid or extreme magic find deterministically without NaN/Infinity weights', () => {
    const zero = eligibleLootEntries(context);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -100]) {
      expect(eligibleLootEntries({ ...context, magicFind: bad })).toEqual(zero);
    }
    expect(eligibleLootEntries({ ...context, magicFind: 100000 }))
      .toEqual(eligibleLootEntries({ ...context, magicFind: 500 }));
    const veryHigh = eligibleLootEntries({
      ...context, monsterLevel: 999, playerLevel: 999, magicFind: 500
    });
    expect(veryHigh.every(entry => Number.isFinite(entry.weight) && entry.weight > 0)).toBe(true);
  });
});
