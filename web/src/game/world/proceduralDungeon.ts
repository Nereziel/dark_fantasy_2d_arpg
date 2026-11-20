/**
 * GPL-3.0-only. Session-only, renderer-independent modular dungeon plan.
 *
 * All geometry is on the 40-unit navigation grid. Solid tiles are coalesced
 * into the SAME collision rectangles used by the existing canOccupy/findPath.
 * A hidden secret door is a discoverability hint, not a locked collision gate.
 * The coordinator connects the plan to existing crypt runtime/Phaser/quests.
 */
import type { Point } from '../core/types';
import {
  ACTOR_RADIUS, canOccupy, findPath, WORLD_HEIGHT, WORLD_WIDTH,
  type Obstacle
} from './navigation';
import { CRYPT_BOSS_POSITIONS, CRYPT_EXIT } from './generator';

export const DUNGEON_TILE_SIZE = 40;
export const MAX_ATTEMPTS = 4;
export const MAX_ROOMS = 9;
export const MAX_TILE_COUNT = (WORLD_WIDTH / DUNGEON_TILE_SIZE) * (WORLD_HEIGHT / DUNGEON_TILE_SIZE);

export type DungeonSeed = number;
export type DungeonRoomType =
  | 'entrance' | 'corridor' | 'combat' | 'elite' | 'event'
  | 'treasure' | 'trap' | 'secret' | 'boss';

export interface DungeonBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface DungeonCell { readonly col: number; readonly row: number }
export interface DungeonFeature {
  readonly id: string;
  readonly kind: Exclude<DungeonRoomType, 'entrance' | 'corridor'>;
  /** Stable untranslated integration hook, never directly grants rewards. */
  readonly hookId: string;
  readonly position: Point;
}
export interface DungeonRoom {
  readonly id: string;
  readonly type: DungeonRoomType;
  readonly slot: DungeonCell;
  readonly bounds: DungeonBounds;
  readonly center: Point;
  readonly required: boolean;
  /** Each undirected door is listed exactly once at EACH endpoint. */
  readonly doorIds: readonly string[];
  readonly feature?: DungeonFeature;
}
export interface DungeonDoor {
  readonly id: string;
  readonly roomAId: string;
  readonly roomBId: string;
  readonly kind: 'open' | 'hidden';
  readonly portalA: Point;
  readonly portalB: Point;
  /** Physical straight floor between portal-bearing adjacent rooms. */
  readonly passage: DungeonBounds;
}
export interface DungeonTile {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: 'wall' | 'floor';
  readonly roomId?: string;
  readonly doorId?: string;
}
export interface DungeonEncounterSpawn {
  readonly id: string;
  readonly roomId: string;
  readonly kind: 'combat' | 'elite';
  readonly position: Point;
}
export interface DungeonValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly checkedPaths: number;
}
export interface ProceduralDungeonResult {
  readonly seed: DungeonSeed;
  readonly width: number;
  readonly height: number;
  readonly source: 'generated' | 'fallback';
  readonly rooms: readonly DungeonRoom[];
  readonly doors: readonly DungeonDoor[];
  readonly tiles: readonly DungeonTile[];
  readonly obstacles: readonly Obstacle[];
  readonly playerSpawn: Point;
  readonly exitPosition: Point;
  readonly encounterSpawns: readonly DungeonEncounterSpawn[];
  readonly bossSpawn: Point;
  readonly bossGuardSpawns: readonly Point[];
  readonly validation: DungeonValidationReport;
}
export interface DungeonGenerationOptions {
  /** Zero skips procedural attempts and tests the deterministic fallback. */
  readonly maxAttempts?: number;
  /** Must match the fixed navigation dimensions until the coordinator adapts navigation. */
  readonly bounds?: Readonly<{ width: number; height: number }>;
}

const REQUIRED: readonly DungeonRoomType[] = [
  'entrance', 'corridor', 'combat', 'elite', 'event', 'treasure', 'trap', 'boss'
];
const TYPES: readonly DungeonRoomType[] = [...REQUIRED, 'secret'];
const COLUMNS = WORLD_WIDTH / DUNGEON_TILE_SIZE;
const ROWS = WORLD_HEIGHT / DUNGEON_TILE_SIZE;
type Slot = readonly [number, number];
const SLOT_PATHS: readonly (readonly Slot[])[] = [
  [[0, 1], [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [3, 2], [3, 1]],
  [[0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [3, 0], [3, 1]],
  [[0, 1], [0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [3, 2], [3, 1]],
  [[0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [2, 0], [3, 0], [3, 1]],
  [[0, 1], [1, 1], [1, 0], [2, 0], [2, 1], [2, 2], [3, 2], [3, 1]],
  [[0, 1], [1, 1], [1, 2], [2, 2], [2, 1], [2, 0], [3, 0], [3, 1]]
];
const SLOT_X = [240, 600, 960, 1320] as const;
const SLOT_Y = [240, 600, 960] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uint32 = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const finitePoint = (value: unknown): value is Point =>
  isRecord(value) && typeof value.x === 'number' && Number.isFinite(value.x)
  && typeof value.y === 'number' && Number.isFinite(value.y);
const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const sameBounds = (a: DungeonBounds, b: DungeonBounds): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const inside = (p: Point, b: DungeonBounds, radius = 0): boolean =>
  p.x >= b.x + radius && p.y >= b.y + radius
  && p.x <= b.x + b.width - radius && p.y <= b.y + b.height - radius;
const intersects = (a: DungeonBounds, b: DungeonBounds): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x
  && a.y < b.y + b.height && a.y + a.height > b.y;
const slotKey = (slot: DungeonCell): string => `${slot.col}-${slot.row}`;
const roomId = (seed: number, slot: DungeonCell): string =>
  `dungeon/${seed}/room/${slotKey(slot)}`;
const featureId = (seed: number, slot: DungeonCell): string =>
  `dungeon/${seed}/feature/${slotKey(slot)}`;
const doorId = (seed: number, a: DungeonCell, b: DungeonCell): string => {
  const names = [slotKey(a), slotKey(b)].sort();
  return `dungeon/${seed}/door/${names[0]}_${names[1]}`;
};
const centerOf = (b: DungeonBounds): Point =>
  ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

function roomBounds(slot: DungeonCell): DungeonBounds {
  return slot.col === 3 && slot.row === 1
    ? { x: 1280, y: 520, width: 480, height: 400 }
    : { x: SLOT_X[slot.col]!, y: SLOT_Y[slot.row]!, width: 240, height: 240 };
}

/** Verify and derive a corridor between two orthogonally adjacent room slots. */
function connection(a: DungeonRoom, b: DungeonRoom):
  { passage: DungeonBounds; portalA: Point; portalB: Point } | null {
  const dx = b.slot.col - a.slot.col;
  const dy = b.slot.row - a.slot.row;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  if (dy === 0) {
    const left = dx > 0 ? a : b;
    const right = dx > 0 ? b : a;
    const start = left.bounds.x + left.bounds.width;
    const gap = right.bounds.x - start;
    if (gap <= 0 || centerOf(left.bounds).y !== centerOf(right.bounds).y) return null;
    const y = centerOf(left.bounds).y;
    const portalLeft = { x: start - 20, y };
    const portalRight = { x: right.bounds.x + 20, y };
    return {
      passage: { x: start, y: y - 80, width: gap, height: 160 },
      portalA: dx > 0 ? portalLeft : portalRight,
      portalB: dx > 0 ? portalRight : portalLeft
    };
  }
  const top = dy > 0 ? a : b;
  const bottom = dy > 0 ? b : a;
  const start = top.bounds.y + top.bounds.height;
  const gap = bottom.bounds.y - start;
  if (gap <= 0) return null;
  const x = a.slot.col === 3 ? 1440 : centerOf(top.bounds).x;
  const portalTop = { x, y: start - 20 };
  const portalBottom = { x, y: bottom.bounds.y + 20 };
  return {
    passage: { x: x - 80, y: start, width: 160, height: gap },
    portalA: dy > 0 ? portalTop : portalBottom,
    portalB: dy > 0 ? portalBottom : portalTop
  };
}

function randomSource(seed: number): () => number {
  let state = (seed ^ 0xa5a5a5a5) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Canonical tiles: the entire world is solid except explicit rooms/passages. */
function makeTiles(seed: number, rooms: readonly DungeonRoom[], doors: readonly DungeonDoor[]): DungeonTile[] {
  const tiles: DungeonTile[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLUMNS; col += 1) {
      const x = col * DUNGEON_TILE_SIZE;
      const y = row * DUNGEON_TILE_SIZE;
      const point = { x: x + DUNGEON_TILE_SIZE / 2, y: y + DUNGEON_TILE_SIZE / 2 };
      const room = rooms.find(item => inside(point, item.bounds));
      const door = room ? undefined : doors.find(item => inside(point, item.passage));
      const tile: DungeonTile = {
        id: `dungeon/${seed}/tile/${col}-${row}`, x, y,
        kind: room || door ? 'floor' : 'wall',
        ...(room ? { roomId: room.id } : {}),
        ...(door ? { doorId: door.id } : {})
      };
      tiles.push(tile);
    }
  }
  return tiles;
}

/** Vertically coalesce equal wall runs; these obstacles are authoritative geometry. */
function makeObstacles(seed: number, tiles: readonly DungeonTile[]): Obstacle[] {
  const walls: Obstacle[] = [];
  let previous = new Map<string, Obstacle>();
  for (let row = 0; row < ROWS; row += 1) {
    const current = new Map<string, Obstacle>();
    for (let col = 0; col < COLUMNS;) {
      if (tiles[row * COLUMNS + col]!.kind !== 'wall') { col += 1; continue; }
      const first = col;
      while (col < COLUMNS && tiles[row * COLUMNS + col]!.kind === 'wall') col += 1;
      const x = first * DUNGEON_TILE_SIZE;
      const width = (col - first) * DUNGEON_TILE_SIZE;
      const key = `${x}/${width}`;
      const existing = previous.get(key);
      if (existing) {
        existing.height += DUNGEON_TILE_SIZE;
        current.set(key, existing);
      } else {
        const wall: Obstacle = {
          id: `dungeon/${seed}/wall/${x}-${row * DUNGEON_TILE_SIZE}`,
          x, y: row * DUNGEON_TILE_SIZE, width, height: DUNGEON_TILE_SIZE
        };
        walls.push(wall);
        current.set(key, wall);
      }
    }
    previous = current;
  }
  return walls;
}

function makeDungeon(
  seed: number, slots: readonly Slot[], middle: readonly DungeonRoomType[],
  secretSlot?: Slot
): Omit<ProceduralDungeonResult, 'validation' | 'source'> {
  const rooms: DungeonRoom[] = slots.map(([col, row], index) => {
    const slot = { col, row };
    const type: DungeonRoomType = index === 0 ? 'entrance' : index === 7 ? 'boss' : middle[index - 1]!;
    const bounds = roomBounds(slot);
    const center = centerOf(bounds);
    return {
      id: roomId(seed, slot), type, slot, bounds, center, required: true, doorIds: [],
      ...(['entrance', 'corridor'].includes(type) ? {} : {
        feature: {
          id: featureId(seed, slot), kind: type as DungeonFeature['kind'],
          hookId: `dungeon.${type}`, position: { ...center }
        }
      })
    };
  });
  const doors: DungeonDoor[] = [];
  const addDoor = (a: DungeonRoom, b: DungeonRoom): void => {
    const geometry = connection(a, b);
    if (!geometry) throw new RangeError('Disconnected dungeon module slots');
    const id = doorId(seed, a.slot, b.slot);
    doors.push({
      id, roomAId: a.id, roomBId: b.id,
      kind: a.type === 'secret' || b.type === 'secret' ? 'hidden' : 'open',
      ...geometry
    });
    // Room objects are freshly constructed mutable internal data.
    (a.doorIds as string[]).push(id);
    (b.doorIds as string[]).push(id);
  };
  for (let index = 1; index < rooms.length; index += 1) {
    addDoor(rooms[index - 1]!, rooms[index]!);
  }
  if (secretSlot) {
    const slot = { col: secretSlot[0], row: secretSlot[1] };
    const bounds = roomBounds(slot);
    const center = centerOf(bounds);
    const secret: DungeonRoom = {
      id: roomId(seed, slot), slot, bounds, center, type: 'secret',
      required: false, doorIds: [],
      feature: { id: featureId(seed, slot), kind: 'secret', hookId: 'dungeon.secret', position: { ...center } }
    };
    const neighbor = rooms.find(room => room.type !== 'boss'
      && Math.abs(room.slot.col - slot.col) + Math.abs(room.slot.row - slot.row) === 1);
    if (!neighbor) throw new RangeError('Secret module has no accessible corridor');
    rooms.push(secret);
    addDoor(neighbor, secret);
  }
  const tiles = makeTiles(seed, rooms, doors);
  const obstacles = makeObstacles(seed, tiles);
  const encounterSpawns: DungeonEncounterSpawn[] = (['combat', 'elite'] as const).map(kind => {
    const room = rooms.find(item => item.type === kind)!;
    return { id: `dungeon/${seed}/spawn/${kind}`, kind, roomId: room.id, position: { ...room.center } };
  });
  return {
    seed, width: WORLD_WIDTH, height: WORLD_HEIGHT, rooms, doors, tiles, obstacles,
    playerSpawn: { ...CRYPT_EXIT }, exitPosition: { ...CRYPT_EXIT },
    encounterSpawns, bossSpawn: { ...CRYPT_BOSS_POSITIONS[0]! },
    bossGuardSpawns: CRYPT_BOSS_POSITIONS.slice(1).map(point => ({ ...point }))
  };
}

const invalid = (reason: string): DungeonValidationReport => ({
  valid: false, errors: [reason], checkedPaths: 0
});
const validBounds = (value: unknown): value is DungeonBounds => {
  if (!isRecord(value)) return false;
  const b = value;
  return [b.x, b.y, b.width, b.height].every(number =>
    typeof number === 'number' && Number.isSafeInteger(number))
    && (b.width as number) > 0 && (b.height as number) > 0
    && (b.x as number) >= 0 && (b.y as number) >= 0
    && (b.x as number) + (b.width as number) <= WORLD_WIDTH
    && (b.y as number) + (b.height as number) <= WORLD_HEIGHT;
};

/**
 * Check topology, geometry, canonical solid tiles and real navigation paths.
 * Never trust a supplied validation flag. Bounded before any large traversal.
 */
export function validateProceduralDungeon(input: unknown): DungeonValidationReport {
  if (!isRecord(input)) return invalid('layout must be a plain object');
  if (!uint32(input.seed)) return invalid('invalid uint32 dungeon seed');
  if (input.width !== WORLD_WIDTH || input.height !== WORLD_HEIGHT) return invalid('unsupported bounds');
  if (input.source !== 'generated' && input.source !== 'fallback') return invalid('invalid generation source');
  if (!Array.isArray(input.rooms) || input.rooms.length < REQUIRED.length || input.rooms.length > MAX_ROOMS
    || !Array.isArray(input.doors) || input.doors.length < REQUIRED.length - 1 || input.doors.length > MAX_ROOMS
    || !Array.isArray(input.tiles) || input.tiles.length !== MAX_TILE_COUNT
    || !Array.isArray(input.obstacles) || input.obstacles.length > MAX_TILE_COUNT
    || !Array.isArray(input.encounterSpawns) || input.encounterSpawns.length !== 2
    || !Array.isArray(input.bossGuardSpawns) || input.bossGuardSpawns.length !== 2) {
    return invalid('invalid or unbounded collections');
  }

  const seed = input.seed;
  const rooms = input.rooms as DungeonRoom[];
  const doors = input.doors as DungeonDoor[];
  const tiles = input.tiles as DungeonTile[];
  const obstacles = input.obstacles as Obstacle[];
  const spawns = input.encounterSpawns as DungeonEncounterSpawn[];
  const guards = input.bossGuardSpawns as Point[];
  const ids = new Set<string>();
  const addId = (id: unknown): boolean => {
    if (typeof id !== 'string' || !id || ids.has(id)) return false;
    ids.add(id);
    return true;
  };

  const types = new Set<DungeonRoomType>();
  const slots = new Set<string>();
  const roomMap = new Map<string, DungeonRoom>();
  for (const room of rooms) {
    if (!isRecord(room) || !isRecord(room.slot)
      || !Number.isInteger(room.slot.col) || !Number.isInteger(room.slot.row)
      || room.slot.col < 0 || room.slot.col > 3 || room.slot.row < 0 || room.slot.row > 2
      || !TYPES.includes(room.type) || types.has(room.type)
      || typeof room.required !== 'boolean' || room.required !== (room.type !== 'secret')
      || !validBounds(room.bounds) || !finitePoint(room.center)
      || !sameBounds(room.bounds, roomBounds(room.slot))
      || !samePoint(room.center, centerOf(room.bounds))
      || !Array.isArray(room.doorIds) || room.doorIds.length > 4
      || room.doorIds.some(id => typeof id !== 'string')
      || new Set(room.doorIds).size !== room.doorIds.length
      || room.id !== roomId(seed, room.slot) || !addId(room.id)
      || slots.has(slotKey(room.slot))) return invalid('invalid room, ID, slot or bounds');
    if ((room.type === 'entrance' && slotKey(room.slot) !== '0-1')
      || (room.type === 'boss' && slotKey(room.slot) !== '3-1')) {
      return invalid('entrance or boss moved away from canonical spawn');
    }
    slots.add(slotKey(room.slot));
    types.add(room.type);
    roomMap.set(room.id, room);
    if (room.type === 'entrance' || room.type === 'corridor') {
      if (room.feature !== undefined) return invalid('non-feature room declares a hook');
    } else if (!isRecord(room.feature)
      || room.feature.id !== featureId(seed, room.slot)
      || !addId(room.feature.id)
      || room.feature.kind !== room.type
      || room.feature.hookId !== `dungeon.${room.type}`
      || !finitePoint(room.feature.position)
      || !samePoint(room.feature.position, room.center)) {
      return invalid('invalid room feature and hook');
    }
  }
  if (REQUIRED.some(type => !types.has(type))) return invalid('missing required room type');
  for (let a = 0; a < rooms.length; a += 1) {
    for (let b = a + 1; b < rooms.length; b += 1) {
      if (intersects(rooms[a]!.bounds, rooms[b]!.bounds)) return invalid('overlapping room interiors');
    }
  }

  const seenPairs = new Set<string>();
  const expectedRoomDoors = new Map(rooms.map(room => [room.id, new Set<string>()]));
  const adjacency = new Map(rooms.map(room => [room.id, new Set<string>()]));
  for (const door of doors) {
    if (!isRecord(door) || !addId(door.id)
      || typeof door.roomAId !== 'string' || typeof door.roomBId !== 'string'
      || door.roomAId === door.roomBId) return invalid('invalid door ID');
    const a = roomMap.get(door.roomAId);
    const b = roomMap.get(door.roomBId);
    if (!a || !b) return invalid('missing door target');
    const geometry = connection(a, b);
    const pair = doorId(seed, a.slot, b.slot);
    if (!geometry || door.id !== pair || seenPairs.has(pair)
      || door.kind !== (a.type === 'secret' || b.type === 'secret' ? 'hidden' : 'open')
      || !validBounds(door.passage) || !sameBounds(door.passage, geometry.passage)
      || !finitePoint(door.portalA) || !finitePoint(door.portalB)
      || !samePoint(door.portalA, geometry.portalA)
      || !samePoint(door.portalB, geometry.portalB)
      || !inside(door.portalA, a.bounds, ACTOR_RADIUS)
      || !inside(door.portalB, b.bounds, ACTOR_RADIUS)) {
      return invalid('door connection is geometrically impossible');
    }
    seenPairs.add(pair);
    expectedRoomDoors.get(a.id)!.add(door.id);
    expectedRoomDoors.get(b.id)!.add(door.id);
    if (door.kind === 'open') {
      adjacency.get(a.id)!.add(b.id);
      adjacency.get(b.id)!.add(a.id);
    }
  }
  for (const room of rooms) {
    const expected = expectedRoomDoors.get(room.id)!;
    if (room.doorIds.length !== expected.size || room.doorIds.some(id => !expected.has(id))
      || expected.size < 1 || (room.type === 'secret' && expected.size !== 1)) {
      return invalid('missing reverse adjacency or isolated room');
    }
  }
  const entrance = rooms.find(room => room.type === 'entrance')!;
  const boss = rooms.find(room => room.type === 'boss')!;
  const seen = new Set([entrance.id]);
  const queue = [entrance.id];
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of adjacency.get(queue[index]!)!) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  if (rooms.some(room => room.required && !seen.has(room.id))) {
    return invalid('required objective reachable only through hidden/absent door');
  }

  if (!finitePoint(input.playerSpawn) || !finitePoint(input.exitPosition)
    || !finitePoint(input.bossSpawn)
    || !samePoint(input.playerSpawn, CRYPT_EXIT)
    || !samePoint(input.exitPosition, CRYPT_EXIT)
    || !samePoint(input.bossSpawn, CRYPT_BOSS_POSITIONS[0]!)
    || !inside(input.playerSpawn, entrance.bounds, ACTOR_RADIUS)
    || !inside(input.bossSpawn, boss.bounds, ACTOR_RADIUS)) {
    return invalid('player, boss or exit spawn is invalid');
  }
  for (let index = 0; index < 2; index += 1) {
    if (!finitePoint(guards[index])
      || !samePoint(guards[index]!, CRYPT_BOSS_POSITIONS[index + 1]!)
      || !inside(guards[index]!, boss.bounds, ACTOR_RADIUS)) {
      return invalid('invalid boss guard spawn');
    }
  }
  for (const kind of ['combat', 'elite'] as const) {
    const room = rooms.find(item => item.type === kind)!;
    const matching = spawns.filter(spawn => isRecord(spawn) && spawn.kind === kind);
    if (matching.length !== 1 || !isRecord(matching[0])
      || matching[0]!.id !== `dungeon/${seed}/spawn/${kind}`
      || matching[0]!.roomId !== room.id || !finitePoint(matching[0]!.position)
      || !samePoint(matching[0]!.position, room.center)
      || !addId(matching[0]!.id)) return invalid('invalid encounter spawn');
  }
  const allSpawns = [input.playerSpawn, input.bossSpawn, ...guards, ...spawns.map(spawn => spawn.position)];
  for (let index = 0; index < allSpawns.length; index += 1) {
    for (let next = index + 1; next < allSpawns.length; next += 1) {
      const a = allSpawns[index]!, b = allSpawns[next]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < ACTOR_RADIUS * 2) {
        return invalid('overlapping actor spawns');
      }
    }
  }
  const expectedTiles = makeTiles(seed, rooms, doors);
  for (let index = 0; index < MAX_TILE_COUNT; index += 1) {
    const tile = tiles[index], expected = expectedTiles[index]!;
    if (!isRecord(tile) || !addId(tile.id)
      || tile.id !== expected.id || tile.kind !== expected.kind
      || tile.x !== expected.x || tile.y !== expected.y
      || tile.roomId !== expected.roomId || tile.doorId !== expected.doorId) {
      return invalid('tile differs from canonical floor/wall geometry');
    }
  }
  const expectedWalls = makeObstacles(seed, expectedTiles);
  if (obstacles.length !== expectedWalls.length) return invalid('wall geometry differs from tiles');
  for (let index = 0; index < obstacles.length; index += 1) {
    const wall = obstacles[index], expected = expectedWalls[index]!;
    if (!isRecord(wall) || !addId(wall.id) || !validBounds(wall)
      || wall.id !== expected.id || !sameBounds(wall, expected)) {
      return invalid('overlapping/forged wall geometry');
    }
  }

  // Explicitly verify physical access using the existing authoritative pathfinder.
  const goals: Point[] = [input.exitPosition, input.bossSpawn, ...guards,
    ...rooms.filter(room => room.required).map(room => room.center),
    ...spawns.map(spawn => spawn.position)];
  if (!canOccupy(input.playerSpawn, ACTOR_RADIUS, obstacles)) return invalid('blocked player spawn');
  for (const door of doors) {
    if (!canOccupy(door.portalA, ACTOR_RADIUS, obstacles)
      || !canOccupy(door.portalB, ACTOR_RADIUS, obstacles)) return invalid('blocked door portal');
  }
  for (const goal of goals) {
    if (!canOccupy(goal, ACTOR_RADIUS, obstacles)
      || (!samePoint(input.playerSpawn, goal)
        && findPath(input.playerSpawn, goal, ACTOR_RADIUS, obstacles).length === 0)) {
      return invalid('unreachable physical objective, boss, encounter or exit');
    }
  }
  if (![[-40, 0], [40, 0], [0, -40], [0, 40]].some(([dx, dy]) =>
    canOccupy({ x: input.playerSpawn.x + dx!, y: input.playerSpawn.y + dy! }, ACTOR_RADIUS, obstacles))) {
    return invalid('no safe first movement step');
  }
  return { valid: true, errors: [], checkedPaths: goals.length };
}

/**
 * Strict uint32 inputs; deterministic, bounded path template attempts.
 * Invalid world dimensions are not scaled silently because findPath uses a
 * fixed global grid. Attempts=0 exercises the independent safe fallback.
 */
export function generateProceduralDungeon(
  seed: number, options: DungeonGenerationOptions = {}
): ProceduralDungeonResult {
  if (!uint32(seed)) throw new RangeError('DungeonSeed must be an exact uint32');
  if (!isRecord(options) || Object.keys(options).some(key => key !== 'maxAttempts' && key !== 'bounds')) {
    throw new RangeError('Invalid dungeon generation options');
  }
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 0 || maxAttempts > MAX_ATTEMPTS) {
    throw new RangeError('Dungeon attempt budget must be bounded');
  }
  if (options.bounds !== undefined
    && (!isRecord(options.bounds)
      || Object.keys(options.bounds).some(key => key !== 'width' && key !== 'height')
      || options.bounds.width !== WORLD_WIDTH || options.bounds.height !== WORLD_HEIGHT)) {
    throw new RangeError('Dungeon bounds must match the fixed navigation grid');
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const random = randomSource((seed ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0);
    const slots = SLOT_PATHS[Math.floor(random() * SLOT_PATHS.length)]!;
    const middle: DungeonRoomType[] = ['corridor', 'combat', 'elite', 'event', 'treasure', 'trap'];
    for (let index = middle.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [middle[index], middle[other]] = [middle[other]!, middle[index]!];
    }
    const used = new Set(slots.map(([col, row]) => `${col}-${row}`));
    const candidates: Slot[] = [];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        if (!used.has(`${col}-${row}`) && slots.some(([a, b], index) =>
          index > 0 && index < slots.length - 1 && Math.abs(col - a) + Math.abs(row - b) === 1)) {
          candidates.push([col, row]);
        }
      }
    }
    const secret = random() < 0.75 && candidates.length > 0
      ? candidates[Math.floor(random() * candidates.length)]
      : undefined;
    const plan = makeDungeon(seed, slots, middle, secret);
    const draft = { ...plan, source: 'generated' as const };
    const validation = validateProceduralDungeon(draft);
    if (validation.valid) return { ...draft, validation };
  }

  // Known fixed, open eight-room path with all required features and boss guards.
  // This is subject to the SAME full validation; no invalid fallback can escape.
  const fallback = {
    ...makeDungeon(seed, SLOT_PATHS[0]!, ['corridor', 'combat', 'elite', 'event', 'treasure', 'trap']),
    source: 'fallback' as const
  };
  const validation = validateProceduralDungeon(fallback);
  if (!validation.valid) {
    throw new RangeError(`No physically valid dungeon for seed ${seed}: ${validation.errors.join('; ')}`);
  }
  return { ...fallback, validation };
}
