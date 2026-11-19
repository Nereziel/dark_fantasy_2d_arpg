import { describe, expect, it } from 'vitest';
import { CLASS_IDS, CLASSES } from '../../src/game/data/classes';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createEquipment, deriveStats } from '../../src/game/data/items';
import {
  PERCENT_STATS, STAT_GROUPS, type DerivedStatKey
} from '../../src/game/stats/deriveStats';
import { createShopItem, SHOP_OFFERS } from '../../src/game/trade/commerce';

describe('prompt 02: modular and derived character statistics', () => {
  it('exposes every primary and required derived stat for all classes', () => {
    const names = STAT_GROUPS.flatMap(group => group.stats);
    expect(new Set(names).size).toBe(names.length);
    const required: DerivedStatKey[] = [
      'strength', 'dexterity', 'intelligence', 'vitality', 'willpower',
      'maxHealth', 'healthRegen', 'maxResource', 'resourceRegen', 'armor',
      'physicalResist', 'fireResist', 'frostResist', 'lightningResist',
      'poisonResist', 'shadowResist', 'holyResist', 'attackSpeed',
      'moveSpeed', 'critChance', 'critDamage', 'dodgeChance', 'blockChance',
      'cooldownReduction', 'lifeSteal', 'magicFind', 'goldFind'
    ];
    expect(names).toEqual(expect.arrayContaining(required));
    for (const classId of CLASS_IDS) {
      const stats = deriveStats(classId, createEquipment());
      expect(Object.keys(stats).sort()).toEqual([...names].sort());
      expect(stats.maxHealth).toBeGreaterThan(0);
      expect(stats.armor).toBeGreaterThanOrEqual(0);
      expect(stats.maxResource).toBe(CLASSES[classId].resourceMax);
      expect(stats.resourceRegen).toBe(CLASSES[classId].regenRate);
      expect(stats.critDamage).toBe(70);
      expect(stats.damageMin).toBeLessThanOrEqual(stats.damageMax);
      expect(stats.attackSpeed).toBeGreaterThan(0);
      for (const key of names) {
        expect(Number.isFinite(stats[key]), classId + ':' + key).toBe(true);
      }
      for (const key of PERCENT_STATS) {
        expect(stats[key], classId + ':' + key).toBeGreaterThanOrEqual(0);
        expect(stats[key], classId + ':' + key).toBeLessThanOrEqual(100);
      }
    }
  });

  it('preserves legacy health, armor and attack-speed fundamentals', () => {
    const warrior = deriveStats('WARRIOR', createEquipment());
    expect(warrior.strength).toBe(22);
    expect(warrior.dexterity).toBe(14);
    expect(warrior.vitality).toBe(20);
    expect(warrior.maxHealth).toBe(334);
    expect(warrior.armor).toBe(53);
    expect(warrior.critChance).toBe(7.8);
    expect(warrior.attackSpeed).toBe(1.11);
    expect(warrior.moveSpeed).toBe(103.5);
    expect(warrior.healthRegen).toBe(1.9);
    expect(warrior.maxResource).toBe(100);
    expect(warrior.resourceRegen).toBe(-2);
  });

  it('recalculates from equipped items without mutating base attributes or gear', () => {
    const equipped = createEquipment();
    const initial = deriveStats('WARRIOR', equipped);
    const shieldOffer = SHOP_OFFERS.find(offer => offer.id === 'shield')!;
    const shield = createShopItem(shieldOffer, 'test-shield');
    equipped.OFF_HAND = {
      ...shield,
      affixes: [
        { id: 'test-vitality', stat: 'vitality', value: 7 },
        { id: 'test-block', stat: 'blockChance', value: 3.5 }
      ]
    };
    const before = structuredClone(equipped);
    const improved = deriveStats('WARRIOR', equipped);
    expect(improved.vitality).toBe(initial.vitality + 7);
    expect(improved.maxHealth).toBe(initial.maxHealth + 84);
    expect(improved.armor).toBeGreaterThan(initial.armor);
    expect(improved.blockChance).toBe(15.5);
    expect(improved.poisonResist).toBeGreaterThan(initial.poisonResist);
    expect(equipped).toEqual(before);
    expect(CLASSES.WARRIOR.primary.vitality).toBe(20);
    expect(deriveStats('WARRIOR', createEquipment())).toEqual(initial);
  });

  it('projects stats to the UI snapshot and recalculates on equip/unequip', () => {
    const sim = new GameSimulation();
    const prior = sim.snapshot();
    const offer = SHOP_OFFERS.find(offer => offer.id === 'belt')!;
    sim.command({ type: 'buyItem', offerId: offer.id });
    sim.command({ type: 'equip', index: 0 });
    const equipped = sim.snapshot();
    expect(equipped.stats.armor).toBeGreaterThan(prior.stats.armor);
    expect(equipped.stats.maxHealth).toBe(prior.stats.maxHealth);
    expect(equipped.stats.maxResource).toBe(100);
    expect(equipped.stats.resourceRegen).toBe(-2);
    sim.command({ type: 'unequip', slot: 'BELT' });
    expect(sim.snapshot().stats).toEqual(prior.stats);
  });
});
