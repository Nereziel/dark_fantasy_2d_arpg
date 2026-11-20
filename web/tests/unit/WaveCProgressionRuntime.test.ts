import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CLASS_IDS } from '../../src/game/data/classes';
import { createEquipment, deriveStats, rollItem, SeededRng } from '../../src/game/data/items';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';
import { xpRequiredForLevel } from '../../src/game/progression/progressionRules';

describe('Wave C progression runtime integration', () => {
  it('applies multiple level-ups, new caps, points and derived stats in the simulation', () => {
    const sim = new GameSimulation(120);
    const original = sim.snapshot();
    (sim as unknown as { awardExperience: (xp: number) => void }).awardExperience(1000);
    const result = sim.snapshot();
    expect(result.level).toBe(5);
    expect(result.xp).toBe(60);
    expect(result.skillPoints).toBe(4);
    expect(result.talentPoints).toBe(1);
    expect(result.stats.strength).toBeGreaterThan(original.stats.strength);
    expect(result.stats.maxHealth).toBeGreaterThan(original.stats.maxHealth);
    expect(result.player.maxHealth).toBe(result.stats.maxHealth);
    expect(result.stats.maxResource).toBeGreaterThan(original.stats.maxResource);
    expect(result.stats.damageMax).toBeGreaterThan(original.stats.damageMax);
    expect(result.xp).toBeLessThan(xpRequiredForLevel(result.level));
    expect(sim.drainEvents().filter(event => event.type === 'levelUp')).toHaveLength(4);
  });

  it('reconstructs each of the six classes without mutating class definitions', () => {
    for (const classId of CLASS_IDS) {
      const initial = deriveStats(classId, createEquipment());
      const advanced = deriveStats(classId, createEquipment(), 15);
      expect(advanced.maxHealth).toBeGreaterThan(initial.maxHealth);
      expect(advanced.maxResource).toBeGreaterThan(initial.maxResource);
      expect(advanced.damageMax).toBeGreaterThan(initial.damageMax);
      const sim = new GameSimulation();
      sim.command({ type: 'reset', classId });
      (sim as unknown as { awardExperience: (xp: number) => void }).awardExperience(100_000);
      expect(sim.snapshot().classId).toBe(classId);
      expect(sim.snapshot().player.maxHealth).toBe(sim.snapshot().stats.maxHealth);
    }
  });

  it('explicitly migrates v8 with identical owned item IDs and no world-state leakage', () => {
    const sim = new GameSimulation();
    const hero = sim.character();
    const item = rollItem(51, 3, new SeededRng(50));
    const old = { ...hero, level: 3, xp: 42,
      inventory: hero.inventory.map((value, i) => i === 0 ? item : value) };
    const migrated = readSaveRecord({ format: 8, characterId: 'hero', savedAt: 42, character: old });
    expect(migrated).not.toBeNull();
    expect(migrated?.level).toBe(3);
    expect(migrated?.xp).toBe(42);
    expect(migrated?.skillPoints).toBe(2);
    expect(migrated?.talentPoints).toBe(0);
    expect(migrated?.inventory[0]).toEqual(item);
    const reexport = createSaveRecord(migrated)!;
    expect(reexport.format).toBe(9);
    expect(reexport.character.inventory[0]?.id).toBe(item.id);
    expect(JSON.stringify(reexport)).not.toContain('worldSeed');
  });

  it('rejects invalid XP and prevents saves with forged point balances', () => {
    const sim = new GameSimulation();
    const before = sim.snapshot();
    (sim as unknown as { awardExperience: (xp: number) => void }).awardExperience(Number.NaN);
    expect(sim.snapshot()).toEqual(before);
    const hero = sim.character();
    expect(createSaveRecord({ ...hero, skillPoints: 50 })).toBeNull();
    expect(createSaveRecord({ ...hero, talentPoints: -1 })).toBeNull();
  });
});
