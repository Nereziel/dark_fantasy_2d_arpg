import { describe, expect, it } from 'vitest';
import { ACTOR_RADIUS, OBSTACLES, canOccupy, findPath, moveActor, WORLD_HEIGHT, WORLD_WIDTH } from '../../src/game/world/navigation';
import { GameSimulation } from '../../src/game/core/GameSimulation';

describe('world collisions and deterministic navigation', () => {
  it('shares a walkability map across all actors and blocks terrain', () => {
    expect(OBSTACLES.length).toBeGreaterThanOrEqual(3);
    expect(canOccupy({ x: -1, y: 300 })).toBe(false);
    expect(canOccupy({ x: WORLD_WIDTH + 1, y: WORLD_HEIGHT - 60 })).toBe(false);
    expect(canOccupy({ x: 1025, y: 355 })).toBe(false);
    expect(canOccupy({ x: 390, y: 470 })).toBe(true);
    expect(canOccupy({ x: Number.NaN, y: 470 })).toBe(false);
  });

  it('prevents wall tunneling by stepping collision-aware movement', () => {
    const actor = { x: 430, y: 742 };
    const goal = { x: 795, y: 742 };
    expect(canOccupy(actor, ACTOR_RADIUS)).toBe(true);
    moveActor(actor, goal, 300);
    expect(canOccupy(actor)).toBe(true);
    expect(actor.x).toBeLessThan(470 - ACTOR_RADIUS + 0.001);
  });

  it('finds a route around a wall and leaves the original goal unmodified', () => {
    const from = { x: 430, y: 742 };
    const goal = { x: 810, y: 742 };
    const original = { ...goal };
    const path = findPath(from, goal);
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(goal);
    expect(goal).toEqual(original);
    expect(path.every(point => canOccupy(point))).toBe(true);
    const second = findPath(from, goal);
    expect(second).toEqual(path);
    let actor = { ...from };
    for (const waypoint of path) {
      for (let steps = 0; steps < 200 && Math.hypot(actor.x - waypoint.x, actor.y - waypoint.y) > 5; steps++) {
        moveActor(actor, waypoint, 4);
      }
    }
    expect(Math.hypot(actor.x - goal.x, actor.y - goal.y)).toBeLessThan(8);
  });

  it('stops at reachable ground beside an obstacle instead of ignoring the click', () => {
    const sim = new GameSimulation();
    const prior = sim.snapshot();
    const blocked = { x: 1030, y: 370 };
    expect(findPath(prior.player, blocked)).toEqual([]);
    sim.command({ type: 'move', destination: blocked });
    expect(sim.snapshot().status).toBe('moving');
    for (let i = 0; i < 45; i++) sim.advance(16.667);
    expect(Math.hypot(sim.snapshot().player.x - prior.player.x,
      sim.snapshot().player.y - prior.player.y)).toBeGreaterThan(30);
    expect(canOccupy(sim.snapshot().player)).toBe(true);
  });
});
