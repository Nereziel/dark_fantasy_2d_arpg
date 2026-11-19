import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/game/core/types';
import { generateWorld } from '../../src/game/world/generator';
import {
  ACTOR_RADIUS, OBSTACLES, WORLD_HEIGHT, WORLD_WIDTH,
  canOccupy, findPath, resolveReachableDestination, type Obstacle
} from '../../src/game/world/navigation';

function expectReachable(from: Point, destination: Point | null, radius = ACTOR_RADIUS,
  obstacles: readonly Obstacle[] = OBSTACLES): Point {
  expect(destination).not.toBeNull();
  if (!destination) throw new Error('Expected a reachable destination');
  expect(canOccupy(destination, radius, obstacles)).toBe(true);
  expect(findPath(from, destination, radius, obstacles).length).toBeGreaterThan(0);
  return destination;
}

describe('Agent 02 — nearest reachable navigation destination', () => {
  it('resolves a click inside collapsed-wall to a reachable position', () => {
    const from = { x: 430, y: 742 };
    const requested = { x: 520, y: 745 };
    const destination = expectReachable(from, resolveReachableDestination(from, requested));
    expect(destination).not.toEqual(requested);
  });

  it('preserves exact coordinates of a reachable ground click without aliasing the input', () => {
    const from = { x: 390, y: 470 };
    const requested = { x: 422.75, y: 480.25 };
    const destination = resolveReachableDestination(from, requested);
    expect(destination).toEqual(requested);
    expect(destination).not.toBe(requested);
  });

  it('searches only the start component when a passable destination is disconnected', () => {
    const walls: Obstacle[] = [{ id: 'full-height-divider', x: 1050, y: 0, width: 100, height: WORLD_HEIGHT }];
    const from = { x: 200, y: 700 };
    const requested = { x: 1900, y: 700 };
    expect(canOccupy(requested, ACTOR_RADIUS, walls)).toBe(true);
    expect(findPath(from, requested, ACTOR_RADIUS, walls)).toEqual([]);
    const result = expectReachable(from, resolveReachableDestination(from, requested, ACTOR_RADIUS, walls), ACTOR_RADIUS, walls);
    expect(result.x).toBeLessThanOrEqual(1050 - ACTOR_RADIUS);
  });

  it('does not cross a sealed diagonal corner', () => {
    const walls: Obstacle[] = [
      { id: 'top', x: 80, y: 0, width: 40, height: 80 },
      { id: 'left', x: 0, y: 80, width: 80, height: 40 }
    ];
    const from = { x: 60, y: 60 };
    const requested = { x: 120, y: 120 };
    expect(canOccupy(requested, 18, walls)).toBe(true);
    const result = expectReachable(from, resolveReachableDestination(from, requested, 18, walls), 18, walls);
    expect(result).not.toEqual(requested);
  });

  it('returns a valid in-world target for an off-map click', () => {
    const from = { x: 390, y: 470 };
    const requestedPoints = [
      { x: -500, y: 480 },
      { x: WORLD_WIDTH + 500, y: WORLD_HEIGHT + 500 },
      { x: Number.MAX_VALUE, y: 900 }
    ];
    for (const requested of requestedPoints) {
      const result = expectReachable(from, resolveReachableDestination(from, requested));
      expect(result.x).toBeGreaterThanOrEqual(ACTOR_RADIUS);
      expect(result.x).toBeLessThanOrEqual(WORLD_WIDTH - ACTOR_RADIUS);
      expect(result.y).toBeGreaterThanOrEqual(ACTOR_RADIUS);
      expect(result.y).toBeLessThanOrEqual(WORLD_HEIGHT - ACTOR_RADIUS);
    }
  });

  it('rejects invalid starts, requests, radii and obstacle geometry deterministically', () => {
    const from = { x: 390, y: 470 };
    const requested = { x: 500, y: 500 };
    for (const badStart of [
      { x: NaN, y: 470 }, { x: Infinity, y: 470 }, { x: -1, y: 470 }, { x: 520, y: 745 }
    ]) expect(resolveReachableDestination(badStart, requested)).toBeNull();
    for (const badRequest of [
      { x: NaN, y: 470 }, { x: -Infinity, y: 470 }, { x: Infinity, y: 480 }
    ]) expect(resolveReachableDestination(from, badRequest)).toBeNull();
    for (const radius of [0, -1, NaN, Infinity]) {
      expect(resolveReachableDestination(from, requested, radius)).toBeNull();
    }
    const invalidWalls = [{ id: 'invalid', x: 4, y: 4, width: -1, height: 10 }];
    expect(resolveReachableDestination(from, requested, 18, invalidWalls)).toBeNull();
    expect(resolveReachableDestination(from, requested, 18, [{ id: 'nan', x: NaN, y: 4, width: 10, height: 10 }])).toBeNull();
  });

  it('does not mutate any input and yields the same result ten times', () => {
    const from = Object.freeze({ x: 430, y: 742 });
    const requested = Object.freeze({ x: 520, y: 745 });
    const obstacles = Object.freeze(OBSTACLES.map(wall => Object.freeze({ ...wall })));
    const first = resolveReachableDestination(from, requested, ACTOR_RADIUS, obstacles);
    for (let n = 0; n < 10; n++) {
      expect(resolveReachableDestination(from, requested, ACTOR_RADIUS, obstacles)).toEqual(first);
    }
    expect(from).toEqual({ x: 430, y: 742 });
    expect(requested).toEqual({ x: 520, y: 745 });
  });

  it('resolves blocked destinations in a deterministic generated world', () => {
    const world = generateWorld(987);
    const ruins = world.obstacles.filter(wall => wall.id.startsWith('wild-ruin-')).slice(0, 3);
    expect(ruins.length).toBeGreaterThan(0);
    for (const wall of ruins) {
      const requested = { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
      expect(canOccupy(requested, ACTOR_RADIUS, world.obstacles)).toBe(false);
      const first = expectReachable(world.camp,
        resolveReachableDestination(world.camp, requested, ACTOR_RADIUS, world.obstacles),
        ACTOR_RADIUS, world.obstacles);
      for (let n = 0; n < 10; n++) {
        expect(resolveReachableDestination(world.camp, requested, ACTOR_RADIUS, world.obstacles)).toEqual(first);
      }
    }
  });

  it('ranks candidates against the original distant target, without unsafe distance overflow', () => {
    const walls: Obstacle[] = [{ id: 'edge-wall', x: 2175, y: 850, width: 25, height: 100 }];
    const from = { x: 390, y: 470 };
    const result = expectReachable(from,
      resolveReachableDestination(from, { x: Number.MAX_VALUE, y: 900 }, 18, walls), 18, walls);
    expect(result).toEqual({ x: 2180, y: 820 });
  });
});
