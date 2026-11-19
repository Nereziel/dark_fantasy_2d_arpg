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
