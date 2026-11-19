import { describe, expect, it } from 'vitest';
import { CLASS_IDS, CLASSES } from '../../src/game/data/classes';
import { createEquipment } from '../../src/game/data/items';
import type { ActorSnapshot } from '../../src/game/core/types';
import { advanceResource, updateHealthLimit } from '../../src/game/entities/player';
import { deriveStats } from '../../src/game/stats/deriveStats';

function livingPlayer(): ActorSnapshot {
  return { id: 'hero', x: 10, y: 20, health: 70, maxHealth: 100, alive: true };
}

describe('Agent 01: player health boundaries', () => {
  it('transfers missing health when the maximum changes', () => {
    const player = livingPlayer();
    updateHealthLimit(player, 140);
    expect(player).toEqual({
      id: 'hero', x: 10, y: 20, health: 110, maxHealth: 140, alive: true
    });
    updateHealthLimit(player, 100);
    expect(player.health).toBe(70);
    expect(player.maxHealth).toBe(100);
  });

  it.each([NaN, Infinity, -Infinity, 0, -5])(
    'does not mutate any actor field for invalid maximum %s',
    (invalidMaximum) => {
      const player = livingPlayer();
      const before = { ...player };
      updateHealthLimit(player, invalidMaximum);
      expect(player).toEqual(before);
    }
  );

  it('does not revive a dead actor after increasing maximum health', () => {
    const player = { ...livingPlayer(), health: 0, alive: false };
    updateHealthLimit(player, 140);
    expect(player.health).toBe(0);
    expect(player.maxHealth).toBe(140);
    expect(player.alive).toBe(false);
  });

  it('keeps a living actor at or above one health after valid reductions', () => {
    const player = { ...livingPlayer(), health: 1 };
    updateHealthLimit(player, 10);
    expect(player.health).toBe(1);
    expect(player.maxHealth).toBe(10);
  });
});

describe('Agent 01: deterministic class-resource ticks', () => {
  it('preserves fractional regeneration and clamps decay and overflow', () => {
    expect(advanceResource(10, 5, 100, 0.5)).toBe(12.5);
    expect(advanceResource(1, -5, 100, 2)).toBe(0);
    expect(advanceResource(120, 10, 100, 1)).toBe(100);
    let current = 20;
    for (let tick = 0; tick < 60; tick++) {
      current = advanceResource(current, 8, 120, 1 / 60);
    }
    expect(current).toBeCloseTo(28, 8);
  });

  it.each([-1, -Infinity, NaN, Infinity])(
    'ignores invalid elapsed seconds %s while clamping current to cap',
    (invalidDelta) => {
      expect(advanceResource(10, 5, 100, invalidDelta)).toBe(10);
      expect(advanceResource(120, 5, 100, invalidDelta)).toBe(100);
    }
  );

  it.each([0, -1, -Infinity, NaN, Infinity])(
    'returns zero for invalid resource cap %s',
    (invalidCap) => {
      expect(advanceResource(50, 3, invalidCap, 1)).toBe(0);
    }
  );

  it('sanitizes invalid current and regeneration without NaN propagation', () => {
    expect(advanceResource(NaN, 5, 100, 0.5)).toBe(2.5);
    expect(advanceResource(Infinity, 5, 100, 0.5)).toBe(2.5);
    expect(advanceResource(10, NaN, 100, 0.5)).toBe(10);
    expect(advanceResource(10, Infinity, 100, 0.5)).toBe(10);
    expect(advanceResource(10, -Infinity, 100, 0.5)).toBe(10);
  });
});

describe('Agent 01: equipment-derived statistics', () => {
  it('recalculates identically without mutating equipped items or class bases', () => {
    const equipment = createEquipment();
    equipment.OFF_HAND = {
      id: 'agent-01-shield', templateId: 'shield', slot: 'OFF_HAND',
      rarity: 'RARE', level: 1, icon: '⬡', armor: 14,
      minDmg: 0, maxDmg: 0, block: 12, upgrades: 0,
      affixes: [
        { id: 'strength', stat: 'strength', value: 5 },
        { id: 'vitality', stat: 'vitality', value: 7 },
        { id: 'block', stat: 'blockChance', value: 3.5 }
      ]
    };
    const before = structuredClone(equipment);
    const originalPrimary = structuredClone(CLASSES.WARRIOR.primary);
    for (const affix of equipment.OFF_HAND.affixes) Object.freeze(affix);
    Object.freeze(equipment.OFF_HAND.affixes);
    Object.freeze(equipment.OFF_HAND);
    Object.freeze(equipment);

    const first = deriveStats('WARRIOR', equipment);
    const second = deriveStats('WARRIOR', equipment);
    expect(second).toEqual(first);
    expect(first.strength).toBe(originalPrimary.strength + 5);
    expect(first.vitality).toBe(originalPrimary.vitality + 7);
    expect(first.maxHealth).toBe(428);
    expect(first.blockChance).toBe(15.5);
    expect(equipment).toEqual(before);
    expect(CLASSES.WARRIOR.primary).toEqual(originalPrimary);
    expect(deriveStats('WARRIOR', createEquipment()).maxHealth).toBe(334);
  });

  it('is reproducible for the same equipment across all six classes', () => {
    const equipment = createEquipment();
    const before = structuredClone(equipment);
    for (const classId of CLASS_IDS) {
      const expected = deriveStats(classId, equipment);
      expect(deriveStats(classId, equipment)).toEqual(expected);
      expect(expected.maxResource).toBe(CLASSES[classId].resourceMax);
    }
    expect(equipment).toEqual(before);
  });
});
