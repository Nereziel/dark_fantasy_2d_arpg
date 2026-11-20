import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createEncounter, createPack, ENEMY_DEFINITIONS, validIntent } from '../../src/game/enemies/enemies';
import type { GameSnapshot } from '../../src/game/core/types';

const frame = 16.667;
function advance(sim: GameSimulation, frames: number): void {
  for (let i = 0; i < frames; i++) sim.advance(frame);
}
function disableOthers(sim: GameSimulation, index: number, x: number, y: number): void {
  const s = sim.snapshot();
  expect(sim.restore({
    ...s,
    player: { ...s.player, x, y },
    enemies: s.enemies.map((unit, i) => i === index ? {
      ...unit, cooldown: 0
    } : {
      ...unit,
      actor: { ...unit.actor, health: 0, alive: false },
      intent: null, effects: []
    })
  })).toBe(true);
}

describe('group encounters with three independent opponents', () => {
  it('spawns all enemy types simultaneously, with stable distinct IDs', () => {
    const sim = new GameSimulation();
    const state = sim.snapshot();
    expect(state.version).toBe(5);
    expect(state.enemies).toHaveLength(3);
    expect(state.enemies.map(unit => unit.actor.type)).toEqual(['wraith', 'skeleton', 'wolf']);
    expect(state.enemies.map(unit => unit.actor.id)).toEqual(['wraith-1', 'skeleton-2', 'wolf-3']);
    expect(createPack(1, 1).map(unit => unit.actor.id)).toEqual(['wraith-4', 'skeleton-5', 'wolf-6']);
    expect(createEncounter(1, 1).type).toBe('skeleton');
    expect(Object.values(ENEMY_DEFINITIONS).every(def => def.windup > 0.5)).toBe(true);
  });

  it('selects any living enemy by ID, rejects invalid targets and keeps separate enemy state', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'attack', targetId: 'skeleton-2' });
    const selected = sim.snapshot();
    expect(selected.selectedTargetId).toBe('skeleton-2');
    expect(selected.enemy.type).toBe('skeleton');
    sim.command({ type: 'attack', targetId: 'nonexistent' });
    expect(sim.snapshot().selectedTargetId).toBe('skeleton-2');
    expect(sim.snapshot().enemies.map(unit => unit.actor.health)).toEqual(
      selected.enemies.map(unit => unit.actor.health));
    const snap = sim.snapshot();
    const health = 1;
    const units = snap.enemies.map((unit, i) => i === 1 ? {
      ...unit, actor: { ...unit.actor, health }
    } : unit);
    const player = { ...snap.player, x: 860, y: 635 };
    expect(sim.restore({ ...snap, enemies: units, player })).toBe(true);
    sim.command({ type: 'attack', targetId: 'skeleton-2' });
    advance(sim, 12);
    const after = sim.snapshot();
    expect(after.kills).toBe(1);
    expect(after.enemies[1]!.actor.alive).toBe(false);
    expect(after.enemies[0]!.actor.alive).toBe(true);
    expect(after.enemies[2]!.actor.alive).toBe(true);
    expect(after.groundLoot).toHaveLength(1);
  });

  it('telegraphs a ranged attack and permits the player to dodge the locked zone', () => {
    const sim = new GameSimulation();
    disableOthers(sim, 0, 725, 520);
    advance(sim, 3);
    const warned = sim.snapshot();
    expect(warned.enemies[0]!.intent?.pattern).toBe('bolt');
    expect(warned.player.health).toBe(warned.player.maxHealth);
    // Dodge deeper into the wilderness, away from the safe camp; the
    // enemy should finish its telegraph and register a miss.
    sim.command({ type: 'move', destination: { x: 800, y: 800 } });
    advance(sim, 82);
    expect(sim.snapshot().player.health).toBe(warned.player.health);
    expect(sim.drainEvents().some(event => event.type === 'enemyAttack' && !event.hit)).toBe(true);
  });

  it('can resolve independent telegraphs from multiple nearby enemies', () => {
    const sim = new GameSimulation();
    const s = sim.snapshot();
    expect(sim.restore({
      ...s,
      player: { ...s.player, x: 850, y: 565 },
      enemies: s.enemies.map(unit => ({ ...unit, cooldown: 0 }))
    })).toBe(true);
    advance(sim, 15);
    const warned = sim.snapshot();
    expect(warned.enemies.filter(unit => unit.intent !== null).length).toBeGreaterThanOrEqual(2);
    advance(sim, 90);
    expect(sim.drainEvents().filter(event => event.type === 'enemyAttack').length).toBeGreaterThanOrEqual(2);
  });

  it('skeleton attacks in melee, wolf leaps and poisons a stationary target', () => {
    for (const [index, expected] of [[1, 'sweep'], [2, 'leap']] as const) {
      const sim = new GameSimulation();
      const initial = sim.snapshot().enemies[index]!.actor;
      disableOthers(sim, index, initial.x - 44, initial.y);
      advance(sim, 3);
      expect(sim.snapshot().enemies[index]!.intent?.pattern).toBe(expected);
      advance(sim, 72);
      const after = sim.snapshot();
      expect(after.player.health).toBeLessThan(after.player.maxHealth);
      if (expected === 'leap') {
        expect(after.effects.player.some(effect => effect.id === 'poisoned')).toBe(true);
        expect(after.enemies[2]!.actor.x).toBeCloseTo(initial.x - 44, 1);
      }
    }
  });

  it('stun only interrupts the selected enemy, not all other units', () => {
    const sim = new GameSimulation();
    const s = sim.snapshot();
    expect(sim.restore({
      ...s,
      player: { ...s.player, x: 850, y: 565 },
      enemies: s.enemies.map(unit => ({ ...unit, cooldown: 0 }))
    })).toBe(true);
    advance(sim, 8);
    const before = sim.snapshot();
    expect(before.enemies[0]!.intent).not.toBeNull();
    expect(sim.restore({
      ...before,
      enemies: before.enemies.map((unit, i) => i === 0 ? {
        ...unit,
        effects: [{ id: 'stunned', remaining: 2.5, magnitude: 0, tick: 0 }]
      } : unit)
    })).toBe(true);
    advance(sim, 3);
    const after = sim.snapshot();
    expect(after.enemies[0]!.intent).toBeNull();
    expect(after.enemies.slice(1).some(unit => unit.actor.alive)).toBe(true);
  });

  it('respawns a full wave with fresh IDs after all three defeats', () => {
    const sim = new GameSimulation();
    for (let i = 0; i < 3; i++) {
      const s = sim.snapshot();
      const unit = s.enemies[i]!.actor;
      expect(sim.restore({
        ...s,
        player: { ...s.player, x: unit.x - 35, y: unit.y },
        selectedTargetId: null,
        enemies: s.enemies.map((u, j) => i === j ? {
          ...u, actor: { ...u.actor, health: 1 }
        } : u)
      })).toBe(true);
      sim.command({ type: 'attack', targetId: unit.id });
      // Warrior basic attack now damages only at its authoritative hit frame.
      advance(sim, 28);
      expect(sim.snapshot().enemies[i]!.actor.alive).toBe(false);
    }
    const defeated = sim.snapshot();
    expect(defeated.kills).toBe(3);
    expect(defeated.respawnTimer).toBeGreaterThan(0);
    advance(sim, 220);
    const newWave = sim.snapshot();
    expect(newWave.wave).toBe(1);
    expect(newWave.enemies.every(unit => unit.actor.alive)).toBe(true);
    expect(newWave.enemies.map(unit => unit.actor.id)).toEqual(['wraith-4', 'skeleton-5', 'wolf-6']);
  });

  it('preserves per-enemy windups and statuses in a v5 save, and rejects malformed groups', () => {
    const sim = new GameSimulation();
    const s = sim.snapshot();
    expect(sim.restore({
      ...s,
      player: { ...s.player, x: 850, y: 565 },
      enemies: s.enemies.map(unit => ({ ...unit, cooldown: 0 }))
    })).toBe(true);
    advance(sim, 10);
    const original = sim.snapshot();
    expect(original.enemies.some(unit => unit.intent !== null)).toBe(true);
    expect(sim.restore(structuredClone(original))).toBe(true);
    expect(sim.snapshot()).toEqual(original);
    const duplicate = {
      ...original,
      enemies: original.enemies.map((unit, i) => i === 2
        ? { ...unit, actor: { ...unit.actor, id: 'skeleton-2' } } : unit)
    };
    expect(sim.restore(duplicate)).toBe(false);
    expect(sim.restore({ ...original, enemies: [] })).toBe(false);
    expect(sim.restore({ ...original, selectedTargetId: 'unknown' })).toBe(false);
    expect(validIntent({ pattern: 'bolt', x: 100, y: 100, radius: 40, remaining: 1, total: 0.5 })).toBe(false);
  });
});
