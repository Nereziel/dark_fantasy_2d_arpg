import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import type { GameSnapshot } from '../../src/game/core/types';
import { SeededRng, RARITIES, isItem, rollItemForBase, type Item } from '../../src/game/data/items';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';
import { ITEM_BASES, WEAPON_TYPES } from '../../src/game/items/itemCatalog';
import { eligibleLootEntries, bossGuaranteedLoot } from '../../src/game/loot/lootTables';
import { createPack, createCryptPack, type EnemyUnit } from '../../src/game/enemies/enemies';
import { generateWorld, CRYPT_BOSS_POSITIONS } from '../../src/game/world/generator';
import { deriveStats } from '../../src/game/stats/deriveStats';

function equippedScenario(full = false) {
  const rng = new SeededRng(9211);
  const sim = new GameSimulation(731);
  const initial = sim.snapshot();
  const main = rollItemForBase('broadsword', 'existing-main', 10, 'COMMON', rng)!;
  const shield = rollItemForBase('shield', 'existing-shield', 10, 'COMMON', rng)!;
  const great = rollItemForBase('greatsword', 'incoming-greatsword', 10, 'RARE', rng)!;
  const inventory = Array.from({ length: 24 }, (_, i) => i === 0 ? great
    : full ? rollItemForBase('helm', 'filler-' + i, 10, 'COMMON', rng)! : null);
  expect(sim.restore({ ...initial, level: 10, xp: 0, inventory,
    equipment: { ...initial.equipment, MAIN_HAND: main, OFF_HAND: shield } })).toBe(true);
  return { sim, main, shield, great };
}

function ownedIds(view: GameSnapshot): string[] {
  return [...view.inventory, ...Object.values(view.equipment)]
    .filter((item): item is Item => item !== null).map(item => item.id).sort();
}

describe('Wave C integration edge regressions', () => {
  it('generates every base and weapon kind, including sixth rarity', () => {
    const rng = new SeededRng(44);
    for (const [id, base] of Object.entries(ITEM_BASES)) {
      const generated = rollItemForBase(id, 'catalog-' + id,
        Math.max(60, base.requiredLevel), 'COMMON', rng);
      expect(isItem(generated), id).toBe(true);
      if (base.weaponType) expect(WEAPON_TYPES).toHaveProperty(base.weaponType);
    }
    expect(Object.keys(RARITIES)).toHaveLength(6);
    expect(isItem(rollItemForBase('broadsword', 'rare-mythic', 72,
      'MYTHIC', new SeededRng(72)))).toBe(true);
  });

  it('unequips a two-handed weapon without losing any displaced offhand item', () => {
    const { sim, main, shield, great } = equippedScenario();
    const before = sim.snapshot();
    const ids = ownedIds(before);
    const preview = sim.previewEquipment(0)!;
    sim.command({ type: 'equip', index: 0 });
    const after = sim.snapshot();
    expect(after.equipment.MAIN_HAND?.id).toBe(great.id);
    expect(after.equipment.OFF_HAND).toBeNull();
    expect(after.inventory[0]?.id).toBe(main.id);
    expect(after.inventory[1]?.id).toBe(shield.id);
    expect(ownedIds(after)).toEqual(ids);
    expect(after.stats.damageMax - before.stats.damageMax).toBe(preview.damageMax);
    sim.command({ type: 'unequip', slot: 'MAIN_HAND' });
    expect(ownedIds(sim.snapshot())).toEqual(ids);
  });

  it('keeps both hands and all 26 items untouched when inventory is full', () => {
    const { sim } = equippedScenario(true);
    const before = sim.snapshot();
    sim.command({ type: 'equip', index: 0 });
    expect(sim.snapshot()).toEqual(before);
    expect(ownedIds(before)).toHaveLength(26);
  });

  it('equips eligible single-handed daggers into offhand without changing main hand', () => {
    const { sim, main } = equippedScenario();
    const before = sim.snapshot();
    const dagger = rollItemForBase('dagger', 'dual-dagger', 10, 'UNCOMMON', new SeededRng(553))!;
    expect(sim.restore({ ...before,
      inventory: before.inventory.map((value, i) => i === 2 ? dagger : value) })).toBe(true);
    sim.command({ type: 'equip', index: 2, slot: 'OFF_HAND' });
    const result = sim.snapshot();
    expect(result.equipment.MAIN_HAND?.id).toBe(main.id);
    expect(result.equipment.OFF_HAND?.id).toBe('dual-dagger');
    expect(result.inventory[2]?.id).toBe('existing-shield');
  });

  it('keeps item flags stable on sort and save; rejects locked drops and keeps metadata detached', () => {
    const { sim, great } = equippedScenario();
    sim.command({ type: 'setItemFlag', itemId: great.id, flag: 'favorite', value: true });
    sim.command({ type: 'setItemFlag', itemId: great.id, flag: 'locked', value: true });
    sim.command({ type: 'dropInventory', index: 0 });
    expect(sim.snapshot().groundLoot).toHaveLength(0);
    sim.command({ type: 'sortInventory' });
    const record = createSaveRecord(sim.character(), 1024);
    expect(record?.format).toBe(9);
    const restored = new GameSimulation();
    expect(restored.restoreCharacter(readSaveRecord(record)!)).toBe(true);
    expect(restored.character().itemFlags?.[great.id]).toEqual({ favorite: true, locked: true });
    expect(ownedIds(restored.snapshot())).toEqual(ownedIds(sim.snapshot()));
    const detached = restored.character();
    (detached.itemFlags![great.id]! as { favorite: boolean }).favorite = false;
    expect(restored.character().itemFlags![great.id]!.favorite).toBe(true);
  });

  it('preserves seeded affixes and applies legendary properties through derived stats', () => {
    const a = rollItemForBase('greatsword', 'legend-1', 72, 'LEGENDARY', new SeededRng(984))!;
    const b = rollItemForBase('greatsword', 'legend-1', 72, 'LEGENDARY', new SeededRng(984))!;
    expect(a).toEqual(b);
    expect(a.affixes.length).toBeGreaterThan(0);
    const empty = new GameSimulation().snapshot().equipment;
    const powered = deriveStats('WARRIOR', { ...empty, MAIN_HAND: a }, 72);
    const plain = deriveStats('WARRIOR', { ...empty,
      MAIN_HAND: { ...a, legendaryPower: null } }, 72);
    expect(powered.damageMax).toBeGreaterThan(plain.damageMax);
    expect(isItem(a)).toBe(true);
  });

  it('makes monster-kill loot reproducible and exposes high-level mythic elite drops', () => {
    const kill = () => {
      const sim = new GameSimulation(1987);
      sim.command({ type: 'attack', targetId: 'wraith-1' });
      for (let step = 0; step < 950 && sim.snapshot().kills === 0; step++) sim.advance(16.667);
      expect(sim.snapshot().kills).toBe(1);
      return sim.snapshot().groundLoot;
    };
    expect(kill()).toEqual(kill());
    const high = eligibleLootEntries({ zone: 'crypt', difficulty: 'normal',
      monsterLevel: 70, playerLevel: 70, eliteModifiers: ['extraHealth'] });
    expect(high.some(entry => entry.rarity === 'MYTHIC')).toBe(true);
    const boss = bossGuaranteedLoot({ zone: 'crypt', difficulty: 'normal',
      monsterLevel: 10, playerLevel: 10, isBoss: true });
    expect(boss.some(entry => entry.guaranteed && entry.rarity === 'EPIC')).toBe(true);
    const sim = new GameSimulation(18);
    (sim as unknown as { dropEnemyLoot: (unit: EnemyUnit) => void })
      .dropEnemyLoot(createCryptPack(1, 10, CRYPT_BOSS_POSITIONS)[0]!);
    expect(sim.snapshot().groundLoot.some(entry => entry.item.rarity === 'EPIC')).toBe(true);
  });

  it('applies elite death effects inside simulation and never stores combat data in character save', () => {
    const sim = new GameSimulation(811);
    const internal = sim as unknown as {
      wave: number; units: EnemyUnit[];
      seedElitePack: () => void; defeatEnemy: (unit: EnemyUnit) => void;
    };
    internal.wave = 4;
    internal.units = createPack(4, 1, generateWorld(811).encounterPositions);
    internal.seedElitePack();
    const elite = internal.units.find(unit => unit.elite)!;
    expect(elite).toBeDefined();
    elite.elite!.modifiers = ['explodesOnDeath'];
    internal.defeatEnemy(elite);
    expect(elite.elite!.deathTriggered).toBe(true);
    expect(sim.drainEvents().some(event => event.type === 'eliteCue')).toBe(true);
    const saved = JSON.stringify(createSaveRecord(sim.character()));
    expect(saved).not.toContain('eliteQueue');
    expect(saved).not.toContain('"enemies"');
  });
  it('absorbs elite shields through typedDamage and reports canonical absorption', () => {
    const sim = new GameSimulation(455);
    const internal = sim as unknown as {
      units: EnemyUnit[];
      resolveEnemyDamage: (base: number, target: EnemyUnit,
        type: 'physical', source: string) => number;
    };
    const unit = internal.units[0]!;
    unit.elite = {
      modifiers: ['shielded'], visualTags: ['elite', 'shield'],
      shield: 150, damageMultiplier: 1, speedMultiplier: 1,
      elapsedSeconds: 0, deathTriggered: false
    };
    const hp = unit.actor.health;
    expect(internal.resolveEnemyDamage(20, unit, 'physical', 'hero')).toBe(0);
    expect(unit.actor.health).toBe(hp);
    expect(unit.elite.shield).toBeLessThan(150);
    const damage = sim.drainEvents().find(event => event.type === 'damageResolved');
    expect(damage?.type).toBe('damageResolved');
    if (damage?.type === 'damageResolved') {
      expect(damage.absorbed).toBeGreaterThan(0);
      expect(damage.damage).toBe(0);
    }
  });

  it('rejects forged catalog level, weapon type and oversized legendary powers on load', () => {
    const base = rollItemForBase('greatsword', 'security-great', 20,
      'LEGENDARY', new SeededRng(991))!;
    const sim = new GameSimulation();
    const before = sim.character();
    const bagWith = (item: Item) => ({ ...before,
      inventory: before.inventory.map((entry, index) => index === 0 ? item : entry) });
    expect(createSaveRecord(bagWith({ ...base, requiredLevel: 1 }))).toBeNull();
    expect(createSaveRecord(bagWith({ ...base, weaponType: 'DAGGER' }))).toBeNull();
    expect(createSaveRecord(bagWith({
      ...base, legendaryPower: { id: 'power.greatsword', magnitude: 1_000_001 }
    }))).toBeNull();
    expect(createSaveRecord(bagWith({ ...base, rarity: 'COMMON' }))).toBeNull();
    expect(sim.character()).toEqual(before);
  });

});
