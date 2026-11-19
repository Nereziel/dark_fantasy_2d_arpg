import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CAMP, CAMP_RADIUS, generateWorld } from '../../src/game/world/generator';
import { canOccupy, findPath } from '../../src/game/world/navigation';

describe('fresh procedural sessions', () => {
  it('generates deterministic layouts for the same seed and different ones for different seeds', () => {
    const a = generateWorld(1987);
    const b = generateWorld(1987);
    const c = generateWorld(1988);
    expect(a).toEqual(b);
    expect(a.obstacles).not.toEqual(c.obstacles);
    expect(a.encounterPositions).not.toEqual(c.encounterPositions);
    expect(a.obstacles.length).toBeGreaterThan(4);
    expect(a.camp).toEqual(CAMP);
    expect(generateWorld(0).obstacles.length).toBe(4);
  });

  it('never blocks safe camp or the three monster spawns across many seeds', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const world = generateWorld(seed * 9973);
      expect(canOccupy(world.camp, 18, world.obstacles)).toBe(true);
      for (const pos of world.encounterPositions) {
        expect(canOccupy(pos, 18, world.obstacles)).toBe(true);
      }
      expect(world.obstacles.every(wall => {
        const mid = { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
        return wall.id.startsWith('wild-ruin-')
          ? Math.hypot(mid.x - CAMP.x, mid.y - CAMP.y) > CAMP_RADIUS + 75
          : true;
      })).toBe(true);
    }
  });

  it('uses a common seeded layout for collision and navigation', () => {
    const world = generateWorld(2918);
    const wall = world.obstacles.find(w => w.id.startsWith('wild-ruin-'))!;
    const blocked = { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
    expect(canOccupy(blocked, 18, world.obstacles)).toBe(false);
    expect(canOccupy(world.camp, 18, world.obstacles)).toBe(true);
    expect(findPath(world.camp, blocked, 18, world.obstacles)).toEqual([]);
    const sim = new GameSimulation(world.seed);
    const before = sim.snapshot().player;
    sim.command({ type: 'move', destination: blocked });
    expect(sim.snapshot().status).toBe('moving');
    for (let i = 0; i < 30; i++) sim.advance(16.667);
    expect(Math.hypot(sim.snapshot().player.x - before.x,
      sim.snapshot().player.y - before.y)).toBeGreaterThan(30);
    expect(canOccupy(sim.snapshot().player, 18, world.obstacles)).toBe(true);
  });

  it('starts a new seed without losing permanent progression', () => {
    const sim = new GameSimulation(2001);
    const char = sim.character();
    const oldSeed = sim.snapshot().worldSeed;
    expect(sim.restoreCharacter({ ...char, level: 2, gold: 220, kills: 9 }, 3002)).toBe(true);
    const state = sim.snapshot();
    expect(state.worldSeed).toBe(3002);
    expect(state.worldSeed).not.toBe(oldSeed);
    expect(state.player).toMatchObject({ ...CAMP, alive: true });
    expect(state.enemies.every(unit => unit.actor.alive && unit.intent === null)).toBe(true);
    expect(sim.character()).toMatchObject({ level: 2, gold: 220, kills: 9 });
  });

  it('keeps the hero safe from attacks inside the camp radius', () => {
    const sim = new GameSimulation(1201);
    const original = sim.snapshot();
    const wounded = {
      ...original,
      enemies: original.enemies.map((unit, index) => ({
        ...unit,
        actor: { ...unit.actor, x: 520 + index * 30, y: 520 },
        cooldown: 0
      }))
    };
    expect(sim.restore(wounded)).toBe(true);
    for (let tick = 0; tick < 160; tick++) sim.advance(16.667);
    const end = sim.snapshot();
    expect(end.player.health).toBe(end.player.maxHealth);
    expect(end.enemies.every(unit => unit.intent === null)).toBe(true);
  });
});
