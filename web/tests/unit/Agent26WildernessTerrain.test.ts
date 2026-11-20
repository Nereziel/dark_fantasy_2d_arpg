// GPL-3.0-only — Agent 26, Wave E, Prompt 22.
import { describe, expect, it } from 'vitest';
import { CAMP, CAMP_RADIUS, CRYPT_GATE } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath, OBSTACLES, WORLD_HEIGHT, WORLD_WIDTH } from '../../src/game/world/navigation';
import { getTownManifest } from '../../src/game/world/townManifest';
import { NPC_POSITIONS } from '../../src/game/world/npcs';
import { WORLD_OBJECTS } from '../../src/game/world/interactables';
import {
  generateWildernessTerrain, validateWildernessTerrain,
  MAX_LAYOUT_RETRIES, MAX_OBSTACLE_ATTEMPTS, TERRAIN_TILE_SIZE,
  type WildernessTerrainResult
} from '../../src/game/world/wildernessTerrain';

const seeds = [0, 1, 2, 42, 0xffffffff];
const originalEncounters = [
  { x: 780, y: 520 }, { x: 910, y: 635 }, { x: 1050, y: 535 }
];

function requiredTargets(world: WildernessTerrainResult) {
  return [
    { id: 'crypt-gate', position: CRYPT_GATE },
    ...WORLD_OBJECTS.filter(object => object.zone === 'wilderness')
      .map(object => ({ id: object.id, position: object.position })),
    ...getTownManifest().map(entry => ({ id: entry.id, position: entry.position })),
    ...world.layout.encounterPositions.map((position, index) => ({
      id: 'encounter-' + index, position
    }))
  ];
}
function pointsOnRoute(world: WildernessTerrainResult, points: readonly { x: number; y: number }[]) {
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!, to = points[i]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    for (let j = 0; j <= Math.ceil(length / 12); j++) {
      const t = j / Math.max(1, Math.ceil(length / 12));
      expect(canOccupy({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
        ACTOR_RADIUS, world.layout.obstacles)).toBe(true);
    }
  }
}

describe('Agent 26: deterministic corrupted-frontier wilderness terrain', () => {
  it('reproduces bit-for-bit JSON and structured output for the same seed', () => {
    for (const seed of seeds) {
      const first = generateWildernessTerrain(seed);
      const second = generateWildernessTerrain(seed);
      expect(first).toEqual(second);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      expect(JSON.parse(JSON.stringify(first))).toEqual(first);
      expect(first.layout.seed).toBe(seed);
      expect(first.validation.valid).toBe(true);
      expect(first.validation.errors).toEqual([]);
    }
  });

  it('varies seeded biome tiles and geometry while keeping town and its clearing invariant', () => {
    const a = generateWildernessTerrain(42), b = generateWildernessTerrain(43);
    expect(a.layout.camp).toEqual(CAMP);
    expect(b.layout.camp).toEqual(CAMP);
    expect(a.layout.obstacles).not.toEqual(b.layout.obstacles);
    expect(a.tiles.map(tile => tile.terrainId)).not.toEqual(b.tiles.map(tile => tile.terrainId));
    expect(a.layout.encounterPositions).not.toEqual(b.layout.encounterPositions);
    const clearing = (world: WildernessTerrainResult) => world.tiles
      .filter(tile => Math.hypot(tile.x + tile.width / 2 - CAMP.x, tile.y + tile.height / 2 - CAMP.y) < CAMP_RADIUS - TERRAIN_TILE_SIZE / 2);
    expect(clearing(a)).toEqual(clearing(b));
    expect(clearing(a).every(tile => tile.terrainId === 'town_clearing')).toBe(true);
    expect(a.layout.obstacles.some(obstacle => obstacle.id.startsWith('forest-'))).toBe(true);
  });

  it('keeps the authoritative base walls unchanged and respects world bounds', () => {
    const before = JSON.stringify(OBSTACLES);
    for (const seed of seeds) {
      const result = generateWildernessTerrain(seed);
      expect(result.width).toBe(WORLD_WIDTH);
      expect(result.height).toBe(WORLD_HEIGHT);
      expect(result.tileSize).toBe(TERRAIN_TILE_SIZE);
      expect(result.layout.obstacles.slice(0, OBSTACLES.length)).toEqual(OBSTACLES);
      const ids = result.layout.obstacles.map(wall => wall.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const wall of result.layout.obstacles) {
        expect(wall.x).toBeGreaterThanOrEqual(0);
        expect(wall.y).toBeGreaterThanOrEqual(0);
        expect(wall.width).toBeGreaterThan(0);
        expect(wall.height).toBeGreaterThan(0);
        expect(wall.x + wall.width).toBeLessThanOrEqual(WORLD_WIDTH);
        expect(wall.y + wall.height).toBeLessThanOrEqual(WORLD_HEIGHT);
      }
    }
    expect(JSON.stringify(OBSTACLES)).toBe(before);
  });

  it('keeps town, fixed NPCs, shrines, chest, gate and all encounter positions free and reachable', () => {
    for (const seed of seeds) {
      const world = generateWildernessTerrain(seed);
      expect(world.layout.encounterPositions).toHaveLength(3);
      expect(canOccupy(world.layout.camp, ACTOR_RADIUS, world.layout.obstacles)).toBe(true);
      for (const entry of getTownManifest()) {
        expect(canOccupy(entry.position, ACTOR_RADIUS + entry.collisionRadius,
          world.layout.obstacles), entry.id).toBe(true);
      }
      for (const npc of Object.values(NPC_POSITIONS)) {
        expect(canOccupy(npc, ACTOR_RADIUS, world.layout.obstacles)).toBe(true);
      }
      for (const target of requiredTargets(world)) {
        expect(canOccupy(target.position, ACTOR_RADIUS, world.layout.obstacles), target.id).toBe(true);
        expect(findPath(CAMP, target.position, ACTOR_RADIUS, world.layout.obstacles).length,
          target.id).toBeGreaterThan(0);
      }
      for (const point of world.layout.encounterPositions) {
        expect(point.x).toBeGreaterThan(ACTOR_RADIUS);
        expect(point.y).toBeGreaterThan(ACTOR_RADIUS);
        expect(point.x).toBeLessThan(WORLD_WIDTH - ACTOR_RADIUS);
        expect(point.y).toBeLessThan(WORLD_HEIGHT - ACTOR_RADIUS);
        expect(Math.hypot(point.x - CAMP.x, point.y - CAMP.y)).toBeGreaterThan(CAMP_RADIUS);
      }
    }
  });

  it('keeps new obstacles outside town, mandatory interaction clearances and road segments', () => {
    for (const seed of seeds) {
      const world = generateWildernessTerrain(seed);
      for (const wall of world.layout.obstacles.filter(item => item.id.startsWith('forest-'))) {
        const nearestX = Math.max(wall.x, Math.min(CAMP.x, wall.x + wall.width));
        const nearestY = Math.max(wall.y, Math.min(CAMP.y, wall.y + wall.height));
        expect(Math.hypot(nearestX - CAMP.x, nearestY - CAMP.y))
          .toBeGreaterThan(CAMP_RADIUS + ACTOR_RADIUS);
        for (const target of [CRYPT_GATE, ...WORLD_OBJECTS.map(object => object.position)]) {
          const x = Math.max(wall.x, Math.min(target.x, wall.x + wall.width));
          const y = Math.max(wall.y, Math.min(target.y, wall.y + wall.height));
          expect(Math.hypot(x - target.x, y - target.y)).toBeGreaterThan(70);
        }
      }
      for (const road of world.roads) pointsOnRoute(world, road.points);
    }
  });

  it('creates ordered, typed, bounded tiles covering the entire region without overlaps', () => {
    const world = generateWildernessTerrain(42);
    const cols = Math.ceil(WORLD_WIDTH / TERRAIN_TILE_SIZE);
    const rows = Math.ceil(WORLD_HEIGHT / TERRAIN_TILE_SIZE);
    expect(world.biomeId).toBe('corrupted_frontier');
    expect(world.tiles).toHaveLength(cols * rows);
    const allowed = new Set([
      'town_clearing', 'dark_grass', 'dead_leaves', 'corrupted_soil',
      'broken_stone', 'dirt_road'
    ]);
    expect(new Set(world.tiles.map(tile => tile.terrainId)).size).toBeGreaterThan(2);
    world.tiles.forEach((tile, index) => {
      const x = (index % cols) * TERRAIN_TILE_SIZE;
      const y = Math.floor(index / cols) * TERRAIN_TILE_SIZE;
      expect(tile).toMatchObject({
        x, y,
        width: Math.min(TERRAIN_TILE_SIZE, WORLD_WIDTH - x),
        height: Math.min(TERRAIN_TILE_SIZE, WORLD_HEIGHT - y)
      });
      expect(allowed.has(tile.terrainId)).toBe(true);
      expect(tile.variant).toBeGreaterThanOrEqual(0);
      expect(tile.variant).toBeLessThan(4);
    });
  });

  it('emits communicable road links with stable IDs and reachable line segments', () => {
    const world = generateWildernessTerrain(42);
    const roads = world.roads;
    expect(roads.length).toBeGreaterThanOrEqual(6);
    expect(new Set(roads.map(road => road.id)).size).toBe(roads.length);
    for (const road of roads) {
      expect(road.id).toMatch(/^road-[a-z0-9_-]+$/);
      expect(road.width).toBeGreaterThanOrEqual(ACTOR_RADIUS * 2);
      expect(road.from).toEqual(CAMP);
      expect(road.points[0]).toEqual(road.from);
      expect(road.points.at(-1)).toEqual(road.to);
      expect(road.points.length).toBeGreaterThanOrEqual(2);
      pointsOnRoute(world, road.points);
    }
    for (const target of requiredTargets(world)) {
      expect(roads.some(road => road.to.x === target.position.x && road.to.y === target.position.y),
        target.id).toBe(true);
    }
  });

  it('gives the three historical encounter anchors deterministic, separated safe spawns', () => {
    for (const seed of seeds) {
      const world = generateWildernessTerrain(seed);
      world.layout.encounterPositions.forEach((point, index) => {
        const original = originalEncounters[index]!;
        expect(Math.abs(point.x - original.x)).toBeLessThanOrEqual(32);
        expect(Math.abs(point.y - original.y)).toBeLessThanOrEqual(32);
        for (let j = 0; j < index; j++) {
          const other = world.layout.encounterPositions[j]!;
          expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThan(80);
        }
      });
    }
  });

  it('rejects non-uint32 seeds rather than silently wrapping or truncating', () => {
    const invalid: unknown[] = [
      Number.NaN, Infinity, -Infinity, -1, -0.5, 1.2,
      0x100000000, Number.MAX_SAFE_INTEGER, '42', null, undefined, {}
    ];
    for (const seed of invalid) {
      expect(() => generateWildernessTerrain(seed as number), String(seed)).toThrow(RangeError);
    }
    expect(generateWildernessTerrain(0).layout.seed).toBe(0);
    expect(generateWildernessTerrain(0xffffffff).layout.seed).toBe(0xffffffff);
  });

  it('returns fresh nested data without mutating global geometry or subsequent calls', () => {
    const originalCamp = { ...CAMP };
    const first = generateWildernessTerrain(6);
    const snapshot = JSON.stringify(first);
    first.layout.camp.x = 1;
    first.layout.obstacles[0]!.x = 1;
    first.layout.encounterPositions[0]!.x = 1;
    first.tiles[0]!.terrainId = 'broken_stone';
    first.roads[0]!.points[0]!.x = 1;
    first.validation.errors.push({ code: 'invalidLayout' });
    expect(JSON.stringify(generateWildernessTerrain(6))).toBe(snapshot);
    expect(CAMP).toEqual(originalCamp);
  });

  it('bounds deterministic placement attempts and reports any safe fallback', () => {
    expect(MAX_LAYOUT_RETRIES).toBeGreaterThan(0);
    expect(MAX_LAYOUT_RETRIES).toBeLessThanOrEqual(5);
    expect(MAX_OBSTACLE_ATTEMPTS).toBeLessThanOrEqual(200);
    for (let seed = 0; seed < 20; seed++) {
      const world = generateWildernessTerrain(seed);
      expect(world.validation.valid).toBe(true);
      expect(world.validation.generationAttempts).toBeGreaterThanOrEqual(1);
      expect(world.validation.generationAttempts).toBeLessThanOrEqual(MAX_LAYOUT_RETRIES);
      expect(world.validation.obstacleAttempts).toBeLessThanOrEqual(MAX_LAYOUT_RETRIES * MAX_OBSTACLE_ATTEMPTS);
      expect(typeof world.validation.usedFallback).toBe('boolean');
    }
  });

  it('validates the generated representation and detects duplicate obstacle IDs', () => {
    const valid = generateWildernessTerrain(42);
    expect(validateWildernessTerrain(valid)).toEqual([]);
    const bad = structuredClone(valid);
    bad.layout.obstacles.push({ ...bad.layout.obstacles[0]! });
    const issues = validateWildernessTerrain(bad);
    expect(issues.some(issue => issue.code === 'duplicateObstacleId')).toBe(true);
  });

  it('reports invalid bounds, geometry, camp and required blocked points', () => {
    const base = generateWildernessTerrain(1);
    expect(validateWildernessTerrain(null).map(e => e.code)).toContain('invalidLayout');
    const brokenSeed = structuredClone(base);
    brokenSeed.layout.seed = Number.NaN;
    expect(validateWildernessTerrain(brokenSeed).map(e => e.code)).toContain('invalidSeed');
    const badBounds = structuredClone(base);
    badBounds.width = -1;
    expect(validateWildernessTerrain(badBounds).map(e => e.code)).toContain('invalidBounds');
    const badWall = structuredClone(base);
    badWall.layout.obstacles.push({ id: 'invalid', x: -20, y: 4, width: 80, height: 80 });
    expect(validateWildernessTerrain(badWall).map(e => e.code)).toContain('invalidObstacle');
    const badTown = structuredClone(base);
    badTown.layout.camp.x += 100;
    expect(validateWildernessTerrain(badTown).map(e => e.code)).toContain('invalidCamp');
    const blocked = structuredClone(base);
    blocked.layout.obstacles.push({ id: 'blocking-camp', x: 370, y: 450, width: 40, height: 40 });
    expect(validateWildernessTerrain(blocked).map(e => e.code)).toContain('blockedPoint');
  });

  it('rejects missing or invalid encounters, incomplete tile coverage and malformed roads', () => {
    const base = generateWildernessTerrain(2);
    const short = structuredClone(base);
    short.layout.encounterPositions.pop();
    expect(validateWildernessTerrain(short).map(e => e.code)).toContain('invalidEncounters');
    const badTile = structuredClone(base);
    badTile.tiles[0]!.terrainId = 'not_an_id' as typeof badTile.tiles[0]['terrainId'];
    expect(validateWildernessTerrain(badTile).map(e => e.code)).toContain('invalidTile');
    const missingTile = structuredClone(base);
    missingTile.tiles.pop();
    expect(validateWildernessTerrain(missingTile).map(e => e.code)).toContain('invalidTileCoverage');
    const badRoad = structuredClone(base);
    badRoad.roads[0]!.points[0]!.x = -Infinity;
    expect(validateWildernessTerrain(badRoad).map(e => e.code)).toContain('invalidRoad');
  });

  it('recognizes unreachable but otherwise in-bounds mandatory positions', () => {
    const world = generateWildernessTerrain(42);
    // A wall across the entire region isolates one spawn shifted east of it.
    world.layout.obstacles.push({ id: 'sealed-frontier', x: 1150, y: 0, width: 100, height: WORLD_HEIGHT });
    world.layout.encounterPositions[2] = { x: 1600, y: 535 };
    const issues = validateWildernessTerrain(world);
    expect(issues.some(issue => issue.code === 'unreachable' && issue.id === 'encounter-2')).toBe(true);
  });
});
