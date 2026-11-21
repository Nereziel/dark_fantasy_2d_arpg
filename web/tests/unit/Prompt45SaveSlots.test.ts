// Issue #100 / Prompt 45 — multi-character saves. GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CLASS_IDS } from '../../src/game/data/classes';
import { createSaveRecord, readSaveRecord, characterSaveKey, summarizeSaveRecords } from '../../src/persistence/SaveRepository';
import { createWorldRecord, readWorldRecord, worldSaveKey } from '../../src/persistence/WorldProgressRepository';

const HERO_A = 'char-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HERO_B = 'char-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function hero(classId: (typeof CLASS_IDS)[number], id: string) {
  const sim = new GameSimulation(31);
  sim.command({ type: 'createCharacter', classId, characterId: id, seed: 31 });
  return sim;
}

describe('Prompt 45: stable multi-character slots', () => {
  it.each(CLASS_IDS)('isolates permanent %s character identity from world/session state', classId => {
    const sim = hero(classId, HERO_A);
    const record = createSaveRecord(sim.character(), 120);
    expect(characterSaveKey(HERO_A)).toBe('character:' + HERO_A);
    expect(readSaveRecord(record)).toEqual(sim.character());
    expect(record?.character).not.toHaveProperty('worldSeed');
    expect(record?.character).not.toHaveProperty('groundLoot');
    expect(record?.character).not.toHaveProperty('enemies');
    const world = createWorldRecord(sim.worldProgress()!, HERO_A);
    expect(worldSaveKey(HERO_A)).toBe('world:character:' + HERO_A);
    expect(readWorldRecord(world, HERO_A)?.seed).toBe(31);
    expect(readWorldRecord(world, HERO_B)).toBeNull();
    const restored = new GameSimulation(100);
    expect(restored.restoreCharacter(readSaveRecord(record)!, 200)).toBe(true);
    expect(restored.snapshot().worldSeed).toBe(200);
    expect(restored.snapshot().player.health).toBe(restored.snapshot().stats.maxHealth);
    expect(restored.character()).toEqual(sim.character());
  });

  it('lists distinct heroes, deduplicates the active legacy alias, and orders by save time', () => {
    const first = createSaveRecord(hero('WARRIOR', HERO_A).character(), 100);
    const second = createSaveRecord(hero('MAGE', HERO_B).character(), 200);
    expect(summarizeSaveRecords([
      ['first-character', second], [characterSaveKey(HERO_A), first],
      [characterSaveKey(HERO_B), second], ['world:first-character', { format: 1 }]
    ])).toMatchObject([
      { characterId: HERO_B, classId: 'MAGE', level: 1, savedAt: 200 },
      { characterId: HERO_A, classId: 'WARRIOR', level: 1, savedAt: 100 }
    ]);
    expect(summarizeSaveRecords([['first-character', first]])).toHaveLength(1);
  });

  it('ignores malformed, stale, forged and world records when listing', () => {
    const first = createSaveRecord(hero('WARRIOR', HERO_A).character(), 100);
    expect(characterSaveKey('../bad')).toBeNull();
    expect(worldSaveKey('../bad')).toBeNull();
    expect(summarizeSaveRecords([
      ['character:' + HERO_B, first],
      ['character:broken', first],
      [characterSaveKey(HERO_A), { ...first, format: 12 }],
      ['random-key', first],
      ['first-character', { format: 11, characterId: HERO_A, character: { level: NaN } }]
    ])).toEqual([]);
  });
});
