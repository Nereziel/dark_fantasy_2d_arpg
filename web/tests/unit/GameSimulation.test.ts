import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';

describe('renderer-independent fixed-step simulation', () => {
  it('moves by click command, not by Svelte/Phaser state', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'move', destination: { x: 550, y: 470 } });
    for (let i = 0; i < 30; i++) sim.advance(16.667);
    expect(sim.snapshot().player.x).toBeGreaterThan(410);
    expect(sim.snapshot().player.x).toBeLessThanOrEqual(550);
  });
  it('kills an enemy deterministically via typed attack command', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'attack', targetId: 'wraith-1' });
    for (let i = 0; i < 600 && sim.snapshot().kills === 0; i++) sim.advance(16.667);
    expect(sim.snapshot().kills).toBe(1);
  });
  it('rejects invalid coordinates and corrupted snapshots safely', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'move', destination: { x: Number.NaN, y: 99 } });
    expect(sim.snapshot().status).toBe('ready');
    const saved = sim.snapshot();
    expect(sim.restore({ ...saved, player: { ...saved.player, health: -200 } })).toBe(false);
    expect(sim.restore(saved)).toBe(true);
  });
  it('pauses and resets all class-specific game state', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'move', destination: { x: 800, y: 470 } });
    sim.command({ type: 'pause', value: true });
    const before = sim.snapshot().player.x;
    sim.advance(1000);
    expect(sim.snapshot().player.x).toBe(before);
    sim.command({ type: 'reset', classId: 'MAGE' });
    expect(sim.snapshot().status).toBe('ready');
    expect(sim.snapshot().classId).toBe('MAGE');
    expect(sim.snapshot().resource).toBe(120);
  });
});


describe('auto attack never blocks manual skills', () => {
  it('preempts an in-flight basic attack for class abilities across five classes', () => {
    const scenarios = [
      { classId: 'WARRIOR', command: { type: 'warriorAbility', id: 'warCry' }, skill: 'warCry' },
      { classId: 'PALADIN', command: { type: 'paladinAbility', id: 'divineShield' }, skill: 'divineShield' },
      { classId: 'MAGE', command: { type: 'mageAbility', id: 'arcaneBarrier' }, skill: 'arcaneBarrier' },
      { classId: 'ROGUE', command: { type: 'rogueAbility', id: 'fanOfKnives' }, skill: 'fanOfKnives' },
      { classId: 'NECROMANCER', command: { type: 'necroAbility', id: 'deathNova' }, skill: 'deathNova' }
    ] as const;
    for (const scenario of scenarios) {
      const sim = new GameSimulation(42);
      sim.command({ type: 'reset', seed: 42, classId: scenario.classId });
      const before = sim.snapshot();
      const target = before.enemies.find(enemy => enemy.actor.alive)!.actor;
      expect(sim.restore({ ...before, player: { ...before.player, x: target.x, y: target.y } })).toBe(true);
      sim.command({ type: 'attack', targetId: target.id });
      sim.advance(33.334);
      const swinging = sim.snapshot();
      expect(scenario.classId === 'WARRIOR' ? swinging.warriorAction?.id : swinging.classAction?.kind)
        .toBe(scenario.classId === 'WARRIOR' ? 'basicAttack' : 'basic');
      sim.drainEvents();
      sim.command(scenario.command);
      const cast = sim.snapshot();
      expect(scenario.classId === 'WARRIOR'
        ? cast.warriorAction?.id : cast.classAction?.timeline.actionId).toBe(scenario.skill);
      expect(sim.drainEvents().some(event => event.type === 'cast' && event.skillId === scenario.skill))
        .toBe(true);
    }
  });

  it('restores a basic swing on a rejected cast and resumes after a successful buff', () => {
    const sim = new GameSimulation(42);
    sim.command({ type: 'reset', seed: 42, classId: 'MAGE' });
    const base = sim.snapshot();
    const enemy = base.enemies.find(unit => unit.actor.alive)!.actor;
    expect(sim.restore({ ...base, player: { ...base.player, x: enemy.x, y: enemy.y } })).toBe(true);
    sim.command({ type: 'attack', targetId: enemy.id });
    sim.advance(33.334);
    const inFlight = sim.snapshot().classAction;
    expect(inFlight?.kind).toBe('basic');
    sim.command({ type: 'mageAbility', id: 'meteor' }); // no target position: rejected
    expect(sim.snapshot().classAction).toEqual(inFlight);
    sim.command({ type: 'mageAbility', id: 'arcaneBarrier' });
    expect(sim.snapshot().classAction?.mageAbilityId).toBe('arcaneBarrier');
    sim.drainEvents();
    const events = [];
    for (let i = 0; i < 240; i++) {
      sim.advance(16.667);
      events.push(...sim.drainEvents());
    }
    expect(events.some(event => event.type === 'cast' && event.skillId === 'basicAttack')).toBe(true);
  });
});
