import { describe, expect, it } from 'vitest';
import { CRYPT_BOSS_POSITIONS, CRYPT_EXIT, generateCrypt } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath, WORLD_HEIGHT, WORLD_WIDTH } from '../../src/game/world/navigation';
import {
  MAX_ATTEMPTS,
  MAX_ROOMS,
  MAX_TILE_COUNT,
  generateProceduralDungeon,
  validateProceduralDungeon,
  type DungeonRoomType,
  type ProceduralDungeonResult
} from '../../src/game/world/proceduralDungeon';

const REQUIRED_TYPES: DungeonRoomType[] = [
  'entrance', 'corridor', 'combat', 'elite', 'event', 'treasure', 'trap', 'boss'
];
const EDGE_SEEDS = [0, 1, 2, 42, 0xffffffff];
const OTHER_SEEDS = Array.from({ length: 24 }, (_, i) => (i * 7919 + 17) >>> 0);

function checkConnectivity(dungeon: ProceduralDungeonResult): void {
  const entrance = dungeon.rooms.find(room => room.type === 'entrance')!;
  const boss = dungeon.rooms.find(room => room.type === 'boss')!;
  const byId = new Map(dungeon.rooms.map(room => [room.id, room]));
  const connected = new Map(dungeon.rooms.map(room => [room.id, new Set<string>()]));
  for (const door of dungeon.doors) {
    const a = byId.get(door.roomAId)!;
    const b = byId.get(door.roomBId)!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a.doorIds).toContain(door.id);
    expect(b.doorIds).toContain(door.id);
    expect(canOccupy(door.portalA, ACTOR_RADIUS, dungeon.obstacles)).toBe(true);
    expect(canOccupy(door.portalB, ACTOR_RADIUS, dungeon.obstacles)).toBe(true);
    expect(findPath(door.portalA, door.portalB, ACTOR_RADIUS, dungeon.obstacles).length).toBeGreaterThan(0);
    if (door.kind === 'open') {
      connected.get(a.id)!.add(b.id);
      connected.get(b.id)!.add(a.id);
    } else {
      expect([a.type, b.type]).toContain('secret');
    }
  }
  const reached = new Set([entrance.id]);
  const queue = [entrance.id];
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of connected.get(queue[index]!)!) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  for (const room of dungeon.rooms.filter(room => room.required)) {
    expect(reached.has(room.id), `mandatory room ${room.id}`).toBe(true);
    expect(findPath(dungeon.playerSpawn, room.center, ACTOR_RADIUS, dungeon.obstacles).length,
      `physical room ${room.id}`).toBeGreaterThan(0);
  }
  expect(reached.has(boss.id)).toBe(true);
  for (const point of [dungeon.exitPosition, dungeon.bossSpawn,
    ...dungeon.bossGuardSpawns, ...dungeon.encounterSpawns.map(spawn => spawn.position)]) {
    expect(canOccupy(point, ACTOR_RADIUS, dungeon.obstacles)).toBe(true);
    expect(findPath(dungeon.playerSpawn, point, ACTOR_RADIUS, dungeon.obstacles).length).toBeGreaterThan(0);
  }
}

describe('Agent30 — procedural dungeon generator (isolated Prompt 25)', () => {
  it.each(EDGE_SEEDS)('repeats a byte-identical, valid dungeon for edge seed %s', seed => {
    const a = generateProceduralDungeon(seed);
    const b = generateProceduralDungeon(seed);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.seed).toBe(seed);
    expect(a.validation).toMatchObject({ valid: true, errors: [] });
    expect(a.source).toBe('generated');
    expect(validateProceduralDungeon(a).valid).toBe(true);
    expect(a.width).toBe(WORLD_WIDTH);
    expect(a.height).toBe(WORLD_HEIGHT);
    expect(a.playerSpawn).toEqual(CRYPT_EXIT);
    expect(a.exitPosition).toEqual(CRYPT_EXIT);
    expect(a.bossSpawn).toEqual(CRYPT_BOSS_POSITIONS[0]);
    expect(a.bossGuardSpawns).toEqual(CRYPT_BOSS_POSITIONS.slice(1));
    checkConnectivity(a);
  });

  it('generates dozens of bounded valid seeds with genuine geometry and objective variation', () => {
    const layouts = [...EDGE_SEEDS, ...OTHER_SEEDS].map(seed => generateProceduralDungeon(seed));
    const signatures = new Set(layouts.map(layout =>
      JSON.stringify(layout.rooms.map(room => [room.type, room.bounds]))));
    expect(signatures.size).toBeGreaterThan(5);
    for (const dungeon of layouts) {
      expect(dungeon.validation.valid).toBe(true);
      expect(dungeon.rooms.length).toBeLessThanOrEqual(MAX_ROOMS);
      expect(dungeon.doors.length).toBeLessThanOrEqual(MAX_ROOMS);
      expect(dungeon.tiles.length).toBeLessThanOrEqual(MAX_TILE_COUNT);
      expect(dungeon.obstacles.length).toBeGreaterThan(0);
      expect(new Set(dungeon.tiles.map(tile => tile.id)).size).toBe(dungeon.tiles.length);
      const types = dungeon.rooms.map(room => room.type);
      for (const type of REQUIRED_TYPES) expect(types).toContain(type);
      expect(dungeon.rooms.filter(room => room.type === 'secret').length).toBeLessThanOrEqual(1);
      const ids = [
        ...dungeon.rooms.map(room => room.id),
        ...dungeon.doors.map(door => door.id),
        ...dungeon.tiles.map(tile => tile.id),
        ...dungeon.rooms.flatMap(room => room.feature ? [room.feature.id] : []),
        ...dungeon.encounterSpawns.map(spawn => spawn.id)
      ];
      expect(new Set(ids).size).toBe(ids.length);
      expect(dungeon.encounterSpawns.map(spawn => spawn.kind).sort()).toEqual(['combat', 'elite']);
      for (const room of dungeon.rooms) {
        expect(room.bounds.width).toBeGreaterThan(0);
        expect(room.bounds.height).toBeGreaterThan(0);
        expect(Number.isFinite(room.center.x) && Number.isFinite(room.center.y)).toBe(true);
        if (!['corridor', 'entrance'].includes(room.type)) {
          expect(room.feature?.id).toBeTruthy();
          expect(room.feature?.hookId).toBeTruthy();
        }
      }
    }
  });

  it('has genuine room geometry and traversable portals without overlapping room interiors', () => {
    for (const seed of [0, 1, 2, 42]) {
      const dungeon = generateProceduralDungeon(seed);
      const rooms = dungeon.rooms;
      for (let a = 0; a < rooms.length; a += 1) {
        for (let b = a + 1; b < rooms.length; b += 1) {
          const x = rooms[a]!.bounds;
          const y = rooms[b]!.bounds;
          const intersect = x.x < y.x + y.width && x.x + x.width > y.x
            && x.y < y.y + y.height && x.y + x.height > y.y;
          expect(intersect).toBe(false);
        }
      }
      checkConnectivity(dungeon);
    }
  });

  it('does not require an optional secret room to reach any critical objective', () => {
    const withSecret = OTHER_SEEDS.map(seed => generateProceduralDungeon(seed))
      .find(layout => layout.rooms.some(room => room.type === 'secret'));
    expect(withSecret).toBeDefined();
    const secret = withSecret!.rooms.find(room => room.type === 'secret')!;
    expect(secret.required).toBe(false);
    expect(withSecret!.doors.filter(door => door.roomAId === secret.id || door.roomBId === secret.id))
      .toEqual([expect.objectContaining({ kind: 'hidden' })]);
    checkConnectivity(withSecret!);
  });

  it('uses a validated deterministic fallback when the bounded attempt budget is zero', () => {
    expect(MAX_ATTEMPTS).toBeGreaterThan(0);
    const fallback = generateProceduralDungeon(42, { maxAttempts: 0 });
    expect(fallback.source).toBe('fallback');
    expect(fallback).toEqual(generateProceduralDungeon(42, { maxAttempts: 0 }));
    expect(fallback.validation.valid).toBe(true);
    expect(validateProceduralDungeon(fallback).valid).toBe(true);
    checkConnectivity(fallback);
  });

  it('rejects malformed seeds, attempt limits and world dimensions rather than normalizing them', () => {
    for (const seed of [-1, Number.NaN, Infinity, -Infinity, 1.5, 0x100000000,
      Number.MAX_SAFE_INTEGER, '42', null, undefined, {}]) {
      expect(() => generateProceduralDungeon(seed as number)).toThrow(RangeError);
    }
    for (const options of [
      { maxAttempts: -1 }, { maxAttempts: 1.5 }, { maxAttempts: MAX_ATTEMPTS + 1 },
      { maxAttempts: Infinity }, { maxAttempts: NaN },
      { bounds: { width: 500, height: 400 } },
      { bounds: { width: WORLD_WIDTH + 40, height: WORLD_HEIGHT } },
      { bounds: { width: 0, height: WORLD_HEIGHT } },
      { bounds: { width: 1.5, height: WORLD_HEIGHT } },
      { bounds: { width: WORLD_WIDTH, height: Number.NaN } }
    ]) {
      expect(() => generateProceduralDungeon(3, options)).toThrow(RangeError);
    }
  });

  it('never mutates caller options and round-trips strictly through JSON', () => {
    const bounds = Object.freeze({ width: WORLD_WIDTH, height: WORLD_HEIGHT });
    const options = Object.freeze({ maxAttempts: 2, bounds });
    const original = JSON.stringify(options);
    const result = generateProceduralDungeon(0, options);
    expect(JSON.stringify(options)).toBe(original);
    expect(validateProceduralDungeon(JSON.parse(JSON.stringify(result))).valid).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('fails closed on forged graph, missing targets, secret-only paths and duplicated IDs', () => {
    const original = generateProceduralDungeon(42);
    const corruptions: Array<(draft: any) => void> = [
      draft => { draft.rooms[1].id = draft.rooms[0].id; },
      draft => { draft.doors[0].id = draft.rooms[0].id; },
      draft => { draft.doors[0].roomBId = 'ghost-room'; },
      draft => { draft.rooms[1].doorIds = []; },
      draft => { draft.doors[0].kind = 'hidden'; },
      draft => { draft.rooms[1].bounds.x = draft.rooms[0].bounds.x; draft.rooms[1].bounds.y = draft.rooms[0].bounds.y; },
      draft => { draft.doors[0].passage.x += 80; },
      draft => { draft.rooms[0].required = false; },
      draft => { draft.rooms[0].feature = { id: 'forged', hookId: 'fake', kind: 'loot', position: { x: 0, y: 0 } }; },
      draft => { draft.rooms[2].center.x = -1; }
    ];
    for (const mutate of corruptions) {
      const bad = structuredClone(original);
      mutate(bad);
      expect(validateProceduralDungeon(bad).valid, JSON.stringify(bad.doors[0])).toBe(false);
    }
  });

  it('fails closed on malformed floors, overlapping walls and blocked boss/exit/spawns', () => {
    const original = generateProceduralDungeon(1);
    const corruptions: Array<(draft: any) => void> = [
      draft => { draft.tiles[0].id = draft.tiles[1].id; },
      draft => { draft.tiles[0].kind = 'floor'; },
      draft => { draft.tiles.pop(); },
      draft => { draft.obstacles[0].x += 30; },
      draft => { draft.obstacles.push({ ...draft.obstacles[0], id: 'overlapping-wall' }); },
      draft => { draft.bossSpawn.x = 0; },
      draft => { draft.exitPosition.x = 1900; },
      draft => { draft.playerSpawn = { x: -1, y: 2 }; },
      draft => { draft.encounterSpawns[0].position = { x: 0, y: 0 }; },
      draft => { draft.bossGuardSpawns[0] = { ...draft.bossSpawn }; }
    ];
    for (const mutate of corruptions) {
      const bad = structuredClone(original);
      mutate(bad);
      expect(validateProceduralDungeon(bad).valid).toBe(false);
    }
    expect(validateProceduralDungeon({ ...original, rooms: Array(100000).fill({}) }).valid).toBe(false);
    expect(validateProceduralDungeon(null).valid).toBe(false);
    expect(validateProceduralDungeon({}).valid).toBe(false);
  });

  it('never changes the legacy crypt or shared gameplay data', () => {
    const old = generateCrypt(42);
    generateProceduralDungeon(42);
    generateProceduralDungeon(0, { maxAttempts: 0 });
    expect(generateCrypt(42)).toEqual(old);
  });
});
