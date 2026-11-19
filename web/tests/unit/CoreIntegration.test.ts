import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { canOccupy } from '../../src/game/world/navigation';
import { generateWorld } from '../../src/game/world/generator';
import { resolveReachableDestination } from '../../src/game/world/navigation';
import { resolveTypedDamage } from '../../src/game/combat/typedDamage';
import { SeededRng } from '../../src/game/data/items';

function frames(sim: GameSimulation, n: number): void {
  for (let i = 0; i < n; i++) sim.advance(16.667);
}

describe('integrated core prompt modules', () => {
  it('routes blocked ground clicks to a reachable location instead of ignoring the command', () => {
    const sim = new GameSimulation(0);
    const origin = sim.snapshot().player;
    const blocked = { x: 1030, y: 365 };
    const world = generateWorld(0);
    expect(canOccupy(blocked, 18, world.obstacles)).toBe(false);
    const reachable = resolveReachableDestination(origin, blocked, 18, world.obstacles);
    expect(reachable).not.toBeNull();
    sim.command({ type: 'move', destination: blocked });
    expect(sim.snapshot().status).toBe('moving');
    frames(sim, 90);
    expect(Math.hypot(sim.snapshot().player.x - origin.x, sim.snapshot().player.y - origin.y)).toBeGreaterThan(40);
    expect(canOccupy(sim.snapshot().player, 18, world.obstacles)).toBe(true);
  });

  it('holds position instead of pursuing enemies and resumes pursuit after release', () => {
    const sim = new GameSimulation(0);
    sim.command({ type: 'holdPosition', value: true });
    const start = sim.snapshot().player;
    sim.command({ type: 'attack', targetId: 'wraith-1' });
    frames(sim, 25);
    expect(sim.snapshot().player.x).toBe(start.x);
    expect(sim.snapshot().player.y).toBe(start.y);
    sim.command({ type: 'holdPosition', value: false });
    frames(sim, 25);
    expect(sim.snapshot().player.x).toBeGreaterThan(start.x);
  });

  it('uses a cooldown-bound evade with collision and never serializes it into a character save', () => {
    const sim = new GameSimulation(0);
    const before = sim.snapshot();
    sim.command({ type: 'evade' });
    const evaded = sim.snapshot();
    expect(evaded.player.x).toBeGreaterThan(before.player.x);
    expect(evaded.evadeCooldown).toBeGreaterThan(0);
    sim.command({ type: 'evade' });
    expect(sim.snapshot().player).toEqual(evaded.player);
    expect('evadeCooldown' in sim.character()).toBe(false);
    frames(sim, 200);
    sim.command({ type: 'evade' });
    expect(sim.snapshot().player.x).toBeGreaterThan(evaded.player.x);
  });

  it('uses typed defender mitigation, dodge/block results and deterministic RNG for enemy attacks', () => {
    const sim = new GameSimulation(0);
    const original = sim.snapshot();
    const player = { ...original.player, x: 860, y: 600 };
    const skeleton = original.enemies[1]!;
    const fixed = {
      ...original,
      player,
      rngState: 1774,
      enemies: original.enemies.map((unit, index) => index === 1
        ? {
          ...unit,
          cooldown: 0,
          intent: { pattern: 'sweep' as const, x: player.x, y: player.y,
            radius: 85, remaining: 0.001, total: 0.6 }
        }
        : {
          ...unit, actor: { ...unit.actor, health: 0, alive: false },
          intent: null, effects: []
        })
    };
    expect(sim.restore(fixed)).toBe(true);
    const expected = resolveTypedDamage({
      type: 'physical', base: 13 + original.level * 2,
      defenderArmor: original.stats.armor, defenderLevel: original.level,
      dodgeChance: original.stats.dodgeChance, blockChance: original.stats.blockChance
    }, new SeededRng(1774));
    frames(sim, 1);
    const after = sim.snapshot();
    expect(player.health - after.player.health).toBe(expected.damage);
    const attacks = sim.drainEvents().filter(e => e.type === 'enemyAttack');
    expect(attacks).toHaveLength(1);
    expect(attacks[0]).toMatchObject({ hit: expected.damage > 0 });
    expect(after.rngState).not.toBe(1774);
  });

  it('keeps a new-game and loaded hero free of transient holding and evade cooldown', () => {
    const sim = new GameSimulation(0);
    sim.command({ type: 'holdPosition', value: true });
    sim.command({ type: 'evade' });
    const hero = sim.character();
    expect(sim.restoreCharacter(hero, 42)).toBe(true);
    expect(sim.snapshot().holdPosition).toBe(false);
    expect(sim.snapshot().evadeCooldown).toBe(0);
    expect(sim.snapshot().worldSeed).toBe(42);
    expect('holdPosition' in sim.character()).toBe(false);
  });
});
