import { describe, expect, it } from 'vitest';
import { CLASSES, CLASS_IDS } from '../../src/game/data/classes';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createEquipment, deriveStats, isItem, rollItem, SeededRng } from '../../src/game/data/items';
import { createSaveRecord, readSaveRecord, validateCharacter } from '../../src/persistence/SaveRepository';

describe('legacy class definitions', () => {
  it('preserves all six primary attributes and class-specific resource caps', () => {
    expect(CLASS_IDS).toHaveLength(6);
    expect(CLASSES.WARRIOR.primary.strength).toBe(22);
    expect(CLASSES.PALADIN.primary.vitality).toBe(22);
    expect(CLASSES.MAGE.primary.intelligence).toBe(24);
    expect(CLASSES.ROGUE.primary.dexterity).toBe(24);
    expect(CLASSES.NECROMANCER.primary.intelligence).toBe(22);
    expect(CLASSES.WARLOCK.primary.willpower).toBe(20);
    expect(CLASSES.MAGE.resourceMax).toBe(120);
    const sim = new GameSimulation();
    for (const id of CLASS_IDS) {
      sim.command({ type: 'reset', classId: id });
      expect(sim.snapshot().classId).toBe(id);
      expect(sim.snapshot().player.maxHealth).toBe(deriveStats(id, createEquipment()).maxHealth);
    }
  });
});

describe('deterministic legacy-style loot and inventory', () => {
  it('reproduces the same items for equal seeds and validates generated stats', () => {
    const rngA = new SeededRng(8271);
    const rngB = new SeededRng(8271);
    for (let index = 1; index <= 30; index++) {
      const a = rollItem(index, 1 + Math.floor(index / 4), rngA);
      const b = rollItem(index, 1 + Math.floor(index / 4), rngB);
      expect(a).toEqual(b);
      expect(isItem(a)).toBe(true);
    }
  });

  it('produces loot and XP from defeating an enemy; pickup and equipment change stats', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'attack', targetId: 'wraith-1' });
    for (let i = 0; i < 750 && sim.snapshot().kills === 0; i++) sim.advance(16.667);
    const dead = sim.snapshot();
    expect(dead.kills).toBe(1);
    expect(dead.xp).toBeGreaterThan(0);
    expect(dead.gold).toBeGreaterThan(75);
    expect(dead.groundLoot).toHaveLength(1);

    // Move toward the drop, even after it becomes too far for immediate pickup.
    sim.command({ type: 'pickup', id: dead.groundLoot[0]!.id });
    for (let i = 0; i < 350; i++) sim.advance(16.667);
    const looted = sim.snapshot();
    expect(looted.inventory.filter(Boolean)).toHaveLength(1);
    expect(looted.groundLoot).toHaveLength(0);
    const item = looted.inventory.find(Boolean)!;
    expect(isItem(item)).toBe(true);

    sim.command({ type: 'equip', index: looted.inventory.findIndex(Boolean) });
    const equipped = sim.snapshot();
    expect(Object.values(equipped.equipment).filter(Boolean)).toHaveLength(1);
    expect(equipped.inventory.filter(Boolean)).toHaveLength(0);
    expect(equipped.stats.armor).toBeGreaterThanOrEqual(deriveStats('WARRIOR', createEquipment()).armor);
  });

  it('rejects invalid equipment and restores persisted inventory without duplication', () => {
    const sim = new GameSimulation();
    const original = sim.snapshot();
    sim.command({ type: 'equip', index: -1 });
    sim.command({ type: 'unequip', slot: 'HELMET' });
    expect(sim.snapshot()).toEqual(original);
    expect(sim.restore(original)).toBe(true);
    expect(sim.snapshot().inventory).toEqual(original.inventory);
    expect(sim.restore({ ...original, inventory: [null] })).toBe(false);
    expect(sim.restore({ ...original, rngState: -1 })).toBe(false);
  });

  it('stores only character progression and rejects old world-snapshot saves', () => {
    const sim = new GameSimulation();
    const hero = sim.character();
    const record = createSaveRecord(hero, 1234)!;

    expect(record).not.toBeNull();
    expect(record.format).toBe(6);
    expect(record.savedAt).toBe(1234);
    expect(Object.keys(record.character).sort()).toEqual([
      'classId', 'equipment', 'gold', 'inventory', 'kills', 'level', 'xp'
    ].sort());
    expect('enemies' in record.character).toBe(false);
    expect('effects' in record.character).toBe(false);
    expect('player' in record.character).toBe(false);
    expect('world' in record.character).toBe(false);
    expect(readSaveRecord(record)).toEqual(hero);
    expect(validateCharacter({ ...hero, inventory: [null] })).toBeNull();
    expect(readSaveRecord({ ...record, format: 5, snapshot: sim.snapshot() })).toBeNull();
    expect(readSaveRecord({ ...record, character: { ...hero, gold: -15 } })).toBeNull();
    expect(readSaveRecord({ ...record, characterId: 'wrong' })).toBeNull();
  });
});
