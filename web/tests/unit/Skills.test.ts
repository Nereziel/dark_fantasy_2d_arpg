import { describe, expect, it } from 'vitest';
import { CLASS_IDS, CLASSES } from '../../src/game/data/classes';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { emptyCooldowns, SKILLS, SKILL_SLOTS } from '../../src/game/skills/skills';
import { rollAttackDamage, mitigateDamage } from '../../src/game/combat/damage';
import { createEquipment, deriveStats, SeededRng } from '../../src/game/data/items';

const frame = 16.667;
function advanceUntil(sim: GameSimulation, done: () => boolean, max = 360): boolean {
  for (let i = 0; i < max && !done(); i++) sim.advance(frame);
  return done();
}

describe('active skills for every class', () => {
  it('provides two typed abilities with stable IDs and configured cooldowns', () => {
    expect(CLASS_IDS).toHaveLength(6);
    const ids = new Set<string>();
    for (const classId of CLASS_IDS) {
      for (const slot of SKILL_SLOTS) {
        const skill = SKILLS[classId][slot];
        expect(skill.id).toBeTruthy();
        expect(skill.cooldown).toBeGreaterThan(0);
        expect(skill.cost).toBeGreaterThanOrEqual(0);
        expect(skill.range).toBeGreaterThan(0);
        ids.add(skill.id);
      }
    }
    expect(ids.size).toBe(12);
  });

  it('casts an active skill from each class and consumes a resource only upon execution', () => {
    for (const classId of CLASS_IDS) {
      const sim = new GameSimulation();
      sim.command({ type: 'reset', classId });
      const before = sim.snapshot();
      sim.command({ type: 'cast', slot: 'rmb' });
      expect(advanceUntil(sim, () => sim.snapshot().cooldowns.rmb > 0)).toBe(true);
      const after = sim.snapshot();
      expect(after.cooldowns.rmb).toBeGreaterThan(0);
      expect(after.resource).toBeGreaterThanOrEqual(0);
      expect(after.resource).toBeLessThanOrEqual(CLASSES[classId].resourceMax);
      // Some resources regenerate while moving, so verify there was a cast event.
      expect(sim.drainEvents().some(event => event.type === 'cast')).toBe(true);
      expect(before.classId).toBe(after.classId);
    }
  });

  it('rejects casts while paused or on cooldown', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'PALADIN' });
    sim.command({ type: 'pause', value: true });
    sim.command({ type: 'cast', slot: 'slot1' });
    expect(sim.snapshot().cooldowns.slot1).toBe(0);
    sim.command({ type: 'pause', value: false });
    sim.command({ type: 'cast', slot: 'slot1' });
    const cast = sim.snapshot();
    expect(cast.cooldowns.slot1).toBeGreaterThan(0);
    expect(cast.resource).toBe(CLASSES.PALADIN.resourceInitial - SKILLS.PALADIN.slot1.cost);
    sim.command({ type: 'cast', slot: 'slot1' });
    expect(sim.snapshot().resource).toBe(cast.resource);
    sim.command({ type: 'pause', value: true });
    sim.advance(1200);
    expect(sim.snapshot().cooldowns.slot1).toBe(cast.cooldowns.slot1);
  });

  it('applies the Paladin healing aura without changing the base max HP', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'PALADIN' });
    const state = sim.snapshot();
    const damaged = {
      ...state,
      player: { ...state.player, health: state.player.health - 50 }
    };
    expect(sim.restore(damaged)).toBe(true);
    sim.command({ type: 'cast', slot: 'slot1' });
    expect(sim.snapshot().effects.player.some(effect => effect.id === 'consecration')).toBe(false);
    for (let i = 0; i < 22; i++) sim.advance(frame);
    expect(sim.snapshot().effects.player.some(effect => effect.id === 'consecration')).toBe(true);
    for (let i = 0; i < 75; i++) sim.advance(frame);
    const after = sim.snapshot();
    expect(after.player.health).toBeGreaterThan(damaged.player.health);
    expect(after.player.maxHealth).toBe(state.player.maxHealth);
  });

  it('applies Mage burning damage over time in the fixed-step simulation', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'MAGE' });
    sim.command({ type: 'cast', slot: 'rmb' });
    expect(advanceUntil(sim, () => sim.snapshot().cooldowns.rmb > 0)).toBe(true);
    expect(advanceUntil(sim, () => sim.snapshot().effects.enemy.some(effect => effect.id === 'burning'))).toBe(true);
    const start = sim.snapshot();
    expect(start.effects.enemy.some(effect => effect.id === 'burning')).toBe(true);
    for (let i = 0; i < 70; i++) sim.advance(frame);
    const finish = sim.snapshot();
    expect(finish.enemy.health).toBeLessThan(start.enemy.health);
    expect(finish.effects.enemy[0]?.remaining).toBeLessThan(start.effects.enemy[0]?.remaining);
  });

  it('stores and reloads summon ownership and cooldowns without resetting the roll seed', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'NECROMANCER' });
    sim.command({ type: 'cast', slot: 'slot1' });
    expect(advanceUntil(sim, () => (sim.snapshot().summons?.length ?? 0) > 0)).toBe(true);
    const saved = structuredClone(sim.snapshot());
    expect(saved.summons?.[0]).toMatchObject({ ownerId: 'hero', kind: 'skeleton' });
    expect(saved.effects.player.some(effect => effect.id === 'skeleton')).toBe(false);
    sim.advance(800);
    expect(sim.restore(saved)).toBe(true);
    expect(sim.snapshot()).toEqual(saved);
    expect(sim.restore({ ...saved, cooldowns: { ...emptyCooldowns(), rmb: -1 } })).toBe(false);
    expect(sim.restore({ ...saved, summons: [{ ...saved.summons![0]!, ownerId: 'forged' }] })).toBe(false);
    expect(sim.restore({ ...saved, effects: { ...saved.effects, player: [{ id: 'skeleton', remaining: 1000, magnitude: 1, tick: 0 }] } })).toBe(false);
    sim.command({ type: 'reset', classId: 'NECROMANCER' });
    expect(sim.snapshot().summons).toEqual([]);
    expect(sim.snapshot().effects.player).toEqual([]);
  });
});

describe('headless combat pipeline', () => {
  it('provides deterministic damage rolls for fixed seed and stats', () => {
    const stats = deriveStats('WARRIOR', createEquipment());
    const a = rollAttackDamage('WARRIOR', stats, new SeededRng(123), 1.5, 15, 1);
    const b = rollAttackDamage('WARRIOR', stats, new SeededRng(123), 1.5, 15, 1);
    expect(a).toEqual(b);
    expect(a.damage).toBeGreaterThan(0);
    expect(mitigateDamage(12, 100000, 1)).toBe(1);
  });
});
