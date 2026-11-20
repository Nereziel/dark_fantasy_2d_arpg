import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { SeededRng, rollItemForBase, createEquipment } from '../../src/game/data/items';
import { rollLootTable, bossGuaranteedLoot } from '../../src/game/loot/lootTables';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';
import { createPack } from '../../src/game/enemies/enemies';
import { generateWorld } from '../../src/game/world/generator';

describe('Wave C integrated equipment, loot and elites', () => {
  const rng = () => new SeededRng(984);
  const item = (base: string, id: string, level = 20) =>
    rollItemForBase(base, id, level, 'RARE', rng())!;

  it('persists six rarities, level requirements, affixes and two handed identity', () => {
    const a = rollItemForBase('greatsword', 'two-hand-1', 20, 'MYTHIC', rng())!;
    const b = rollItemForBase('greatsword', 'two-hand-1', 20, 'MYTHIC', rng())!;
    expect(a).toEqual(b);
    expect(a.rarity).toBe('MYTHIC');
    expect(a.twoHanded).toBe(true);
    expect(a.weaponType).toBe('GREATSWORD');
    expect(a.requiredLevel).toBe(8);
    expect(a.sockets?.length).toBeGreaterThan(0);
    expect(a.legendaryPower).not.toBeNull();
    expect(a.affixes.length).toBeGreaterThan(0);
    const sim = new GameSimulation(67);
    const hero = sim.character();
    const progress = { ...hero, level: 20, xp: 0,
      skillPoints: 19, talentPoints: 4,
      inventory: hero.inventory.map((entry, i) => i === 0 ? a : entry) };
    expect(sim.restoreCharacter(progress)).toBe(true);
    const save = createSaveRecord(sim.character());
    expect(readSaveRecord(save)?.inventory[0]).toEqual(a);
    expect(sim.snapshot().inventory[0]).toEqual(a);
  });

  it('rejects blocked two-handed equip atomically and preserves all 26 items', () => {
    const sim = new GameSimulation(77);
    const baseline = sim.snapshot();
    const equipment = createEquipment();
    equipment.MAIN_HAND = item('broadsword', 'old-main');
    equipment.OFF_HAND = item('shield', 'old-offhand');
    const bag = Array.from({ length: 24 }, (_, i) => i === 0
      ? item('greatsword', 'two-hand') : item('helm', 'bag-' + i));
    const given = { ...baseline, level: 20, xp: 0, skillPoints: 19,
      talentPoints: 4, equipment, inventory: bag };
    expect(sim.restore(given)).toBe(true);
    const start = sim.snapshot();
    sim.command({ type: 'equip', index: 0 });
    expect(sim.snapshot().inventory).toEqual(start.inventory);
    expect(sim.snapshot().equipment).toEqual(start.equipment);
    expect(Object.values(sim.snapshot().equipment).filter(Boolean)).toHaveLength(2);
    expect(sim.restore({ ...given, inventory: [...bag.slice(0, 23), null] })).toBe(true);
    sim.command({ type: 'equip', index: 0 });
    const after = sim.snapshot();
    expect(after.equipment.MAIN_HAND?.id).toBe('two-hand');
    expect(after.equipment.OFF_HAND).toBeNull();
    expect(after.inventory.find(entry => entry?.id === 'old-offhand')).toBeDefined();
    expect(after.inventory.find(entry => entry?.id === 'old-main')).toBeDefined();
    expect(after.inventory.filter(Boolean)).toHaveLength(24);
  });

  it('executes sort, move, lock and drop authoritatively; save retains flags, not ground loot', () => {
    const sim = new GameSimulation(202);
    const snap = sim.snapshot();
    const inventory = [...snap.inventory];
    inventory[0] = item('broadsword', 'first');
    inventory[2] = item('helm', 'second');
    expect(sim.restore({ ...snap, inventory })).toBe(true);
    sim.command({ type: 'setItemFlag', itemId: 'first', flag: 'locked', value: true });
    sim.command({ type: 'swapInventory', fromIndex: 0, toIndex: 1 });
    expect(sim.snapshot().inventory[1]?.id).toBe('first');
    sim.command({ type: 'dropInventory', index: 1 });
    expect(sim.snapshot().inventory[1]?.id).toBe('first');
    sim.command({ type: 'sortInventory' });
    expect(sim.snapshot().inventory.filter(Boolean)).toHaveLength(2);
    const persisted = readSaveRecord(createSaveRecord(sim.character()));
    expect(persisted?.itemFlags?.first?.locked).toBe(true);
    sim.command({ type: 'setItemFlag', itemId: 'first', flag: 'locked', value: false });
    const index = sim.snapshot().inventory.findIndex(entry => entry?.id === 'first');
    sim.command({ type: 'dropInventory', index });
    expect(sim.snapshot().inventory.find(entry => entry?.id === 'first')).toBeUndefined();
    expect(sim.snapshot().groundLoot.some(entry => entry.item.id === 'first')).toBe(true);
    expect(createSaveRecord(sim.character())?.character.inventory.some(entry => entry?.id === 'first')).toBe(false);
  });

  it('selects seeded contextual loot, with guaranteed zone-specific boss rarity', () => {
    const context = { monsterLevel: 20, playerLevel: 20,
      zone: 'crypt' as const, difficulty: 'normal' as const, isBoss: true };
    const first = rollLootTable(context, rng());
    expect(rollLootTable(context, rng())).toEqual(first);
    const guarantees = bossGuaranteedLoot(context);
    expect(guarantees.length).toBeGreaterThanOrEqual(1);
    expect(guarantees.every(drop => drop.rarity === 'EPIC' || drop.rarity === 'LEGENDARY')).toBe(true);
    const boss = guarantees[0]!;
    expect(rollItemForBase(boss.itemBaseId, 'boss-guarantee', boss.itemLevel, boss.rarity, rng())).not.toBeNull();
    const elite = rollLootTable({ ...context, isBoss: false,
      eliteModifiers: ['extraHealth', 'increasedDamage'] }, rng());
    expect(elite?.tableId).toBeDefined();
  });

  it('spawns reproducible elites with increased defenses using seeded simulation, no new save combat fields', () => {
    const prepare = () => {
      const sim = new GameSimulation(118);
      const original = sim.snapshot();
      const world = generateWorld(original.worldSeed);
      const patched = { ...original, wave: 2, enemies: createPack(2, 1, world.encounterPositions) };
      expect(sim.restore(patched)).toBe(true);
      (sim as unknown as { seedElitePack: () => void }).seedElitePack();
      return sim;
    };
    const first = prepare();
    const second = prepare();
    expect(first.snapshot().enemies).toEqual(second.snapshot().enemies);
    const elites = first.snapshot().enemies.filter(unit => unit.elite);
    expect(elites).toHaveLength(1);
    expect(elites[0]!.elite?.modifiers.length).toBeGreaterThanOrEqual(1);
    expect(elites[0]!.actor.maxHealth).toBeGreaterThan(0);
    expect(elites[0]!.elite?.visualTags).toContain('elite');
    const record = createSaveRecord(first.character());
    expect(JSON.stringify(record)).not.toContain('elite');
    expect(JSON.stringify(record)).not.toContain('enemies');
  });

  it('migrates a v8 character with original ten-slot equipment without losing an instance', () => {
    const sim = new GameSimulation();
    const hero = sim.character();
    const equipment = { ...hero.equipment };
    delete (equipment as Partial<typeof equipment>).RELIC;
    delete (equipment as Partial<typeof equipment>).CHARM;
    equipment.MAIN_HAND = item('broadsword', 'v8-sword');
    const legacy = { ...hero, level: 2, xp: 12, equipment };
    const restored = readSaveRecord({ format: 8, characterId: 'hero',
      savedAt: 420, character: legacy });
    expect(restored?.equipment.MAIN_HAND?.id).toBe('v8-sword');
    expect(restored?.equipment.RELIC).toBeNull();
    expect(restored?.equipment.CHARM).toBeNull();
  });
});
