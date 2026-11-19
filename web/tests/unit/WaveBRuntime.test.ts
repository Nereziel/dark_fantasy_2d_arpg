import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';

const frame = 1000 / 60;
const advance = (sim: GameSimulation, ticks: number) => {
  for (let n = 0; n < ticks; n++) sim.advance(frame + 0.001);
};
function warriorNearSkeleton(): GameSimulation {
  const sim = new GameSimulation();
  const state = sim.snapshot();
  expect(sim.restore({
    ...state,
    player: { ...state.player, x: 860, y: 635 },
    enemies: state.enemies.map((unit, index) => ({
      ...unit, cooldown: 3,
      ...(index === 1 ? {} : { actor: { ...unit.actor, alive: false, health: 0 } })
    }))
  })).toBe(true);
  return sim;
}

describe('Wave B integrated Warrior abilities and status engine', () => {
  it('casts War Cry on an authoritative hit tick, gains Rage and exposes active statuses', () => {
    const sim = new GameSimulation();
    const before = sim.snapshot();
    sim.command({ type: 'warriorAbility', id: 'warCry' });
    expect(sim.snapshot().warriorAction?.id).toBe('warCry');
    expect(sim.snapshot().resource).toBe(before.resource);
    advance(sim, 6);
    expect(sim.snapshot().statusEffects?.player).toHaveLength(0);
    advance(sim, 14);
    const after = sim.snapshot();
    expect(after.resource).toBeGreaterThan(before.resource);
    expect(after.statusEffects?.player.some(effect => effect.id === 'haste')).toBe(true);
    expect(after.statusEffects?.player.some(effect => effect.id === 'fortified')).toBe(true);
    expect(after.warriorCooldowns?.warCry).toBeGreaterThan(0);
  });

  it('applies Execute only after windup and starts its Rage cooldown', () => {
    const sim = warriorNearSkeleton();
    const before = sim.snapshot();
    const enemy = before.enemies[1]!.actor;
    sim.command({ type: 'warriorAbility', id: 'execute', targetId: enemy.id });
    expect(sim.snapshot().resource).toBe(before.resource - 20);
    expect(sim.snapshot().enemies[1]!.actor.health).toBe(enemy.health);
    advance(sim, 10);
    expect(sim.snapshot().enemies[1]!.actor.health).toBe(enemy.health);
    advance(sim, 22);
    expect(sim.snapshot().enemies[1]!.actor.health).toBeLessThan(enemy.health);
    expect(sim.snapshot().warriorCooldowns?.execute).toBeGreaterThan(0);
  });

  it('prevents hold-position from initiating out-of-range auto-approach', () => {
    const sim = new GameSimulation();
    const before = sim.snapshot();
    sim.command({ type: 'holdPosition', value: true });
    sim.command({ type: 'warriorAbility', id: 'execute', targetId: before.enemies[1]!.actor.id });
    advance(sim, 10);
    expect(sim.snapshot().player.x).toEqual(before.player.x);
    expect(sim.snapshot().warriorAction).toBeNull();
    expect(sim.snapshot().warriorCooldowns?.execute ?? 0).toBe(0);
  });

  it('keeps new combat runtime state out of character-only saves', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'warriorAbility', id: 'warCry' });
    advance(sim, 21);
    const character = sim.character();
    expect('statusEffects' in character).toBe(false);
    expect('warriorCooldowns' in character).toBe(false);
    expect('warriorAction' in character).toBe(false);
  });
});
