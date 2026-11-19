import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createEncounter, ENEMY_DEFINITIONS, encounterType, validIntent } from '../../src/game/enemies/enemies';
import type { GameSnapshot } from '../../src/game/core/types';

const frame = 16.667;
function advance(sim: GameSimulation, frames: number): void {
  for (let i = 0; i < frames; i++) sim.advance(frame);
}
function nearby(sim: GameSimulation, x = 710, y = 520): void {
  const state = sim.snapshot();
  expect(sim.restore({
    ...state,
    player: { ...state.player, x, y },
    enemyCooldown: 0
  })).toBe(true);
}

describe('deterministic enemy encounters and AI', () => {
  it('rotates through three enemy archetypes with stable IDs', () => {
    expect(encounterType(0)).toBe('wraith');
    expect(encounterType(1)).toBe('skeleton');
    expect(encounterType(2)).toBe('wolf');
    expect(encounterType(3)).toBe('wraith');
    expect(createEncounter(0, 1).id).toBe('wraith-1');
    expect(createEncounter(1, 1).id).toBe('skeleton-2');
    expect(createEncounter(2, 1).id).toBe('wolf-3');
    expect(createEncounter(2, 3).maxHealth).toBeGreaterThan(createEncounter(2, 1).maxHealth);
    for (const def of Object.values(ENEMY_DEFINITIONS)) {
      expect(def.windup).toBeGreaterThan(0.5);
      expect(def.dangerRadius).toBeGreaterThan(30);
      expect(def.cooldown).toBeGreaterThan(def.windup);
    }
  });

  it('telegraphs a ranged wraith attack, locks the danger zone, and permits dodging', () => {
    const sim = new GameSimulation();
    nearby(sim);
    advance(sim, 2);
    const warning = sim.snapshot();
    expect(warning.enemy.type).toBe('wraith');
    expect(warning.enemyIntent?.pattern).toBe('bolt');
    expect(warning.enemyIntent?.remaining).toBeGreaterThan(0);
    const originalHealth = warning.player.health;
    const destination = { x: 350, y: 500 };
    sim.command({ type: 'move', destination });
    advance(sim, 80);
    const dodged = sim.snapshot();
    expect(dodged.enemyIntent).toBeNull();
    expect(dodged.player.health).toBe(originalHealth);
    expect(sim.drainEvents().some(e => e.type === 'enemyAttack' && !e.hit)).toBe(true);
  });

  it('hits the player who stays inside the warning, but does not deal instant damage', () => {
    const sim = new GameSimulation();
    nearby(sim);
    advance(sim, 2);
    const before = sim.snapshot();
    expect(before.enemyIntent).not.toBeNull();
    expect(before.player.health).toBe(before.player.maxHealth);
    advance(sim, 75);
    const after = sim.snapshot();
    expect(after.player.health).toBeLessThan(before.player.health);
    expect(sim.drainEvents().some(e => e.type === 'enemyAttack' && e.hit)).toBe(true);
  });

  it('skeleton strikes around its current position and wolf leaps to a marked target', () => {
    for (const [kills, expected] of [[1, 'sweep'], [2, 'leap']] as const) {
      const sim = new GameSimulation();
      const state = sim.snapshot();
      const encounter = createEncounter(kills, 1);
      const nearPlayer = { ...state.player, x: encounter.x - 48, y: encounter.y };
      const restored: GameSnapshot = {
        ...state, kills, enemy: encounter,
        player: nearPlayer, enemyCooldown: 0,
        effects: { player: [], enemy: [] }, enemyIntent: null
      };
      expect(sim.restore(restored)).toBe(true);
      advance(sim, 2);
      const telegraph = sim.snapshot();
      expect(telegraph.enemyIntent?.pattern).toBe(expected);
      advance(sim, 90);
      const attacked = sim.snapshot();
      expect(attacked.enemyIntent).toBeNull();
      if (expected === 'leap') {
        expect(attacked.enemy.x).toBeCloseTo(nearPlayer.x, 0);
        expect(attacked.enemy.y).toBeCloseTo(nearPlayer.y, 0);
        expect(attacked.effects.player.some(e => e.id === 'poisoned')).toBe(true);
      } else {
        expect(attacked.player.health).toBeLessThan(nearPlayer.health);
      }
    }
  });

  it('stun interrupts telegraphed attacks and preserves the player health', () => {
    const sim = new GameSimulation();
    nearby(sim);
    advance(sim, 2);
    const snapshot = sim.snapshot();
    expect(snapshot.enemyIntent).not.toBeNull();
    expect(sim.restore({
      ...snapshot,
      effects: {
        ...snapshot.effects,
        enemy: [{ id: 'stunned', remaining: 2.5, magnitude: 0, tick: 0 }]
      }
    })).toBe(true);
    advance(sim, 70);
    const after = sim.snapshot();
    expect(after.enemyIntent).toBeNull();
    expect(after.player.health).toBe(snapshot.player.health);
  });

  it('can save a defeated enemy before its replacement spawns', () => {
    const sim = new GameSimulation();
    const state = sim.snapshot();
    expect(sim.restore({
      ...state,
      player: { ...state.player, x: 725, y: 520 },
      enemy: { ...state.enemy, health: 1 },
      enemyCooldown: 0
    })).toBe(true);
    sim.command({ type: 'attack', targetId: state.enemy.id });
    advance(sim, 3);
    const defeated = sim.snapshot();
    expect(defeated.enemy.alive).toBe(false);
    expect(defeated.kills).toBe(1);
    expect(sim.restore(defeated)).toBe(true);
    advance(sim, 190);
    const next = sim.snapshot();
    expect(next.enemy.alive).toBe(true);
    expect(next.enemy.type).toBe('skeleton');
    expect(next.enemy.id).toBe('skeleton-2');
  });

  it('serializes the attack windup, resets cooldown after resolution, rejects corrupted saves', () => {
    const sim = new GameSimulation();
    nearby(sim);
    advance(sim, 2);
    const saved = sim.snapshot();
    expect(saved.enemyIntent).not.toBeNull();
    expect(sim.restore(structuredClone(saved))).toBe(true);
    expect(sim.snapshot()).toEqual(saved);
    const malformed = {
      ...saved,
      enemyIntent: {
        ...saved.enemyIntent!,
        pattern: 'leap' as const
      }
    };
    expect(sim.restore(malformed)).toBe(false);
    expect(validIntent({ pattern: 'bolt', x: 100, y: 100, radius: 40, remaining: 1, total: 0.5 })).toBe(false);
    advance(sim, 80);
    expect(sim.snapshot().enemyCooldown).toBeGreaterThan(0);
  });
});
