// GPL-3.0-only — Wave F / Agent 28 / Prompt 23.
// Pure projection of the authoritative wilderness; no spawning, renderer or save writes.
import type { Point } from '../core/types';
import { CAMP, CRYPT_GATE } from './generator';
import { WORLD_HEIGHT, WORLD_WIDTH, type Obstacle } from './navigation';
import { getTownManifest } from './townManifest';
import { WORLD_OBJECTS } from './interactables';
import { MANDATORY_FEATURE_IDS, type WildernessFeature } from './wildernessFeatures';
import type { TerrainRoad, TerrainTile } from './wildernessTerrain';
import type { WildernessRuntimeWorld } from './wildernessRuntime';

export const CHUNK_SIZE = 400;
const COLUMNS = Math.ceil(WORLD_WIDTH / CHUNK_SIZE);
const ROWS = Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);
const TILE_SIZE = 80;
const MAX_FEATURES = 512;
const MAX_WALLS = 512;
const MAX_ROADS = 128;
const MAX_ROAD_POINTS = 512;
const MAX_LEDGER_FACTS = 10000;
const ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const CHUNK_PATTERN = /^wilderness\/(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)$/;
const SESSION_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TERRAIN_IDS = ['town_clearing', 'dark_grass', 'dead_leaves',
  'corrupted_soil', 'broken_stone', 'dirt_road'] as const;
const FEATURE_KINDS = ['corruption', 'forest', 'graveyard', 'evidence', 'miniBoss',
  'encounterZone', 'cryptEntrance', 'poi', 'treasure', 'event'] as const;

export type ChunkId = string;
export interface ChunkCoord { readonly cx: number; readonly cy: number }
export interface ChunkBounds {
  readonly minX: number; readonly minY: number;
  readonly maxX: number; readonly maxY: number;
}
export interface ChunkRoadSegment {
  readonly roadId: string;
  readonly segmentIndex: number;
  readonly from: Readonly<Point>;
  readonly to: Readonly<Point>;
  readonly width: number;
}
export interface ChunkAnchor {
  readonly id: string;
  readonly kind: 'camp' | 'cryptGate' | 'town' | 'worldObject';
  readonly position: Readonly<Point>;
  readonly radius: number;
}
export interface ChunkEncounter {
  readonly id: string;
  readonly position: Readonly<Point>;
}
export type WorldFactKind =
  | 'chestOpened' | 'eventCompleted' | 'uniqueEnemyDefeated'
  | 'landmarkDiscovered' | 'waypointActivated';
export interface WorldFactTarget {
  readonly kind: WorldFactKind;
  readonly entityId: string;
  /** The owner (center) chunk, even when a visual overlaps neighbors. */
  readonly homeChunkId: ChunkId;
}
export interface ChunkManifest {
  readonly id: ChunkId;
  readonly coord: ChunkCoord;
  readonly bounds: ChunkBounds;
  readonly seed: number;
  /** Unclipped world-coordinate geometry; only the references are chunk-local. */
  readonly tiles: readonly Readonly<TerrainTile>[];
  readonly roads: readonly ChunkRoadSegment[];
  readonly obstacles: readonly Readonly<Obstacle>[];
  readonly encounters: readonly ChunkEncounter[];
  readonly featureIds: readonly string[];
  readonly anchors: readonly ChunkAnchor[];
}
export interface ChunkIndex {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly chunkSize: number;
  readonly tileSize: number;
  readonly chunks: readonly ChunkManifest[];
  /** Whitelist of stable identifiers that may be recorded, not gameplay authorization. */
  readonly factTargets: readonly WorldFactTarget[];
}

function uint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= 0 && value <= 0xffffffff;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function point(value: unknown): value is Readonly<Point> {
  return record(value) && typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.y === 'number' && Number.isFinite(value.y);
}
function inWorld(value: unknown): value is Readonly<Point> {
  return point(value) && value.x >= 0 && value.y >= 0
    && value.x < WORLD_WIDTH && value.y < WORLD_HEIGHT;
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function idString(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}
function copyPoint(p: Readonly<Point>): Readonly<Point> {
  return Object.freeze({ x: p.x, y: p.y });
}
function freezeList<T>(items: T[]): readonly T[] {
  return Object.freeze(items);
}

function validCoord(value: unknown): value is ChunkCoord {
  return record(value)
    && Number.isInteger(value.cx) && Number.isInteger(value.cy)
    && (value.cx as number) >= 0 && (value.cx as number) < COLUMNS
    && (value.cy as number) >= 0 && (value.cy as number) < ROWS;
}
function parseChunk(value: unknown): ChunkCoord | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const match = CHUNK_PATTERN.exec(value);
  if (!match) return null;
  const coord = { cx: Number(match[1]), cy: Number(match[2]) };
  return validCoord(coord) ? coord : null;
}
export function chunkId(coord: unknown): ChunkId {
  if (!validCoord(coord)) throw new RangeError('Invalid wilderness chunk coordinates');
  return 'wilderness/' + coord.cx + '/' + coord.cy;
}
export function chunkBounds(coord: unknown): ChunkBounds {
  if (!validCoord(coord)) throw new RangeError('Invalid wilderness chunk coordinates');
  return Object.freeze({
    minX: coord.cx * CHUNK_SIZE,
    minY: coord.cy * CHUNK_SIZE,
    maxX: Math.min((coord.cx + 1) * CHUNK_SIZE, WORLD_WIDTH),
    maxY: Math.min((coord.cy + 1) * CHUNK_SIZE, WORLD_HEIGHT)
  });
}
/** A point on an internal boundary belongs to the following chunk. */
export function chunkForPoint(position: unknown): ChunkCoord | null {
  if (!inWorld(position)) return null;
  return { cx: Math.floor(position.x / CHUNK_SIZE), cy: Math.floor(position.y / CHUNK_SIZE) };
}
/** Domain-separated 32-bit FNV/murmur-style finalizer; no mutable RNG state. */
export function chunkSeed(worldSeed: unknown, id: unknown): number {
  if (!uint32(worldSeed) || !parseChunk(id)) {
    throw new RangeError('Invalid chunk seed or ID');
  }
  let hash = (worldSeed ^ 0x43554e4b) >>> 0;
  for (let i = 0; i < (id as string).length; i++) {
    hash = Math.imul(hash ^ (id as string).charCodeAt(i), 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function rectOverlap(a: ChunkBounds, b: ChunkBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX
    && a.minY < b.maxY && a.maxY > b.minY;
}
function boundsOf(x: number, y: number, width: number, height: number): ChunkBounds {
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
}
function pointRectDistanceSq(p: Readonly<Point>, r: ChunkBounds): number {
  const x = Math.max(r.minX - p.x, 0, p.x - r.maxX);
  const y = Math.max(r.minY - p.y, 0, p.y - r.maxY);
  return x * x + y * y;
}
function pointSegmentDistanceSq(p: Readonly<Point>, a: Readonly<Point>, b: Readonly<Point>): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0
    : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  const x = p.x - a.x - dx * t, y = p.y - a.y - dy * t;
  return x * x + y * y;
}
/** Parametric slab clipping detects a segment crossing an axis-aligned rectangle. */
function lineTouchesRect(a: Readonly<Point>, b: Readonly<Point>, r: ChunkBounds): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  let low = 0, high = 1;
  const checks: readonly (readonly [number, number])[] = [
    [-dx, a.x - r.minX], [dx, r.maxX - a.x],
    [-dy, a.y - r.minY], [dy, r.maxY - a.y]
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) low = Math.max(low, t);
      else high = Math.min(high, t);
      if (low > high) return false;
    }
  }
  return true;
}
/** Exact capsule/rectangle intersection (not just an expanded AABB corner hit). */
function roadTouchesChunk(a: Readonly<Point>, b: Readonly<Point>, width: number,
  r: ChunkBounds): boolean {
  if (lineTouchesRect(a, b, r)) return true;
  const corners = [
    { x: r.minX, y: r.minY }, { x: r.minX, y: r.maxY },
    { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }
  ];
  const nearest = Math.min(pointRectDistanceSq(a, r), pointRectDistanceSq(b, r),
    ...corners.map(corner => pointSegmentDistanceSq(corner, a, b)));
  return nearest <= (width / 2) ** 2;
}
function circleTouchesChunk(p: Readonly<Point>, radius: number, r: ChunkBounds): boolean {
  return pointRectDistanceSq(p, r) <= radius * radius;
}
function validRect(r: unknown): r is Obstacle {
  if (!record(r) || !idString(r.id)
    || typeof r.x !== 'number' || typeof r.y !== 'number'
    || !positive(r.width) || !positive(r.height)) return false;
  return Number.isFinite(r.x) && Number.isFinite(r.y)
    && r.x >= 0 && r.y >= 0
    && r.x + r.width <= WORLD_WIDTH && r.y + r.height <= WORLD_HEIGHT;
}
function equalPoint(a: Readonly<Point>, b: Readonly<Point>): boolean {
  return a.x === b.x && a.y === b.y;
}
function validFeature(f: unknown): f is WildernessFeature {
  return record(f) && idString(f.id) && typeof f.kind === 'string'
    && (FEATURE_KINDS as readonly string[]).includes(f.kind)
    && inWorld(f.position) && positive(f.radius) && f.radius <= 512
    && typeof f.mandatory === 'boolean'
    && typeof f.presentationKey === 'string' && f.presentationKey.length <= 128
    && (f.eventKind === null || (typeof f.eventKind === 'string' && f.eventKind.length <= 128))
    && typeof f.visualKey === 'string' && f.visualKey.length <= 128;
}
function validRoad(r: unknown): r is TerrainRoad {
  if (!record(r) || typeof r.id !== 'string' || !/^road-[a-z0-9_-]{1,80}$/.test(r.id)
    || !positive(r.width) || r.width > 300
    || !Array.isArray(r.points) || r.points.length < 2 || r.points.length > MAX_ROAD_POINTS
    || !inWorld(r.from) || !inWorld(r.to)) return false;
  const points = r.points as unknown[];
  return points.every(inWorld)
    && equalPoint(points[0] as Point, r.from)
    && equalPoint(points[points.length - 1] as Point, r.to);
}
function validTile(t: unknown): t is TerrainTile {
  return record(t) && typeof t.x === 'number' && typeof t.y === 'number'
    && Number.isInteger(t.x) && Number.isInteger(t.y)
    && t.x >= 0 && t.y >= 0 && t.x < WORLD_WIDTH && t.y < WORLD_HEIGHT
    && t.x % TILE_SIZE === 0 && t.y % TILE_SIZE === 0
    && t.width === Math.min(TILE_SIZE, WORLD_WIDTH - t.x)
    && t.height === Math.min(TILE_SIZE, WORLD_HEIGHT - t.y)
    && typeof t.terrainId === 'string'
    && (TERRAIN_IDS as readonly string[]).includes(t.terrainId)
    && Number.isInteger(t.variant) && (t.variant as number) >= 0 && (t.variant as number) <= 3;
}
/** Reject malformed or oversized worlds before indexing; no partial result. */
function assertWorld(value: unknown): asserts value is WildernessRuntimeWorld {
  if (!record(value) || !record(value.layout) || !record(value.terrain)
    || !Array.isArray(value.features) || typeof value.usedFeatureFallback !== 'boolean') {
    throw new RangeError('Invalid wilderness world');
  }
  const world = value as unknown as WildernessRuntimeWorld;
  const layout = world.layout, terrain = world.terrain;
  if (!uint32(layout.seed) || terrain.biomeId !== 'corrupted_frontier'
    || terrain.width !== WORLD_WIDTH || terrain.height !== WORLD_HEIGHT
    || terrain.tileSize !== TILE_SIZE || !record(terrain.validation)
    || terrain.validation.valid !== true
    || !record(terrain.layout) || terrain.layout.seed !== layout.seed
    || !point(layout.camp) || !equalPoint(layout.camp, CAMP)
    || !point(terrain.layout.camp) || !equalPoint(terrain.layout.camp, CAMP)
    || !Array.isArray(layout.obstacles) || !Array.isArray(layout.encounterPositions)
    || !Array.isArray(terrain.layout.obstacles) || !Array.isArray(terrain.layout.encounterPositions)
    || !Array.isArray(terrain.tiles) || !Array.isArray(terrain.roads)
    || layout.obstacles.length > MAX_WALLS || layout.encounterPositions.length !== 3
    || world.features.length < MANDATORY_FEATURE_IDS.length || world.features.length > MAX_FEATURES
    || terrain.tiles.length !== Math.ceil(WORLD_WIDTH / TILE_SIZE) * Math.ceil(WORLD_HEIGHT / TILE_SIZE)
    || terrain.roads.length > MAX_ROADS
    || terrain.layout.obstacles.length !== layout.obstacles.length
    || terrain.layout.encounterPositions.length !== layout.encounterPositions.length) {
    throw new RangeError('Invalid world geometry or size');
  }
  const wallIds = new Set<string>();
  for (let i = 0; i < layout.obstacles.length; i++) {
    const wall = layout.obstacles[i]!;
    const other = terrain.layout.obstacles[i]!;
    if (!validRect(wall) || !validRect(other) || wallIds.has(wall.id)
      || wall.id !== other.id || wall.x !== other.x || wall.y !== other.y
      || wall.width !== other.width || wall.height !== other.height) {
      throw new RangeError('Invalid or duplicate obstacle');
    }
    wallIds.add(wall.id);
  }
  const encounters = new Set<string>();
  for (let i = 0; i < layout.encounterPositions.length; i++) {
    const a = layout.encounterPositions[i]!, b = terrain.layout.encounterPositions[i]!;
    if (!inWorld(a) || !inWorld(b) || !equalPoint(a, b)
      || encounters.has(a.x + '/' + a.y)) throw new RangeError('Invalid encounters');
    encounters.add(a.x + '/' + a.y);
  }
  const tiles = new Set<string>();
  for (const tile of terrain.tiles) {
    if (!validTile(tile)) throw new RangeError('Invalid terrain tile');
    const key = tile.x + '/' + tile.y;
    if (tiles.has(key)) throw new RangeError('Duplicate terrain tile');
    tiles.add(key);
  }
  const roads = new Set<string>();
  for (const road of terrain.roads) {
    if (!validRoad(road) || roads.has(road.id)) throw new RangeError('Invalid or duplicate road');
    roads.add(road.id);
  }
  const featureIds = new Set<string>();
  for (const feature of world.features) {
    if (!validFeature(feature) || featureIds.has(feature.id)
      || (feature.mandatory && !MANDATORY_FEATURE_IDS.some(id => id === feature.id))) {
      throw new RangeError('Invalid or duplicate wilderness feature');
    }
    featureIds.add(feature.id);
  }
  for (const id of MANDATORY_FEATURE_IDS) {
    if (!world.features.some(feature => feature.id === id && feature.mandatory)) {
      throw new RangeError('Missing story feature');
    }
  }
}

/** Includes all unmodified source coordinates, even for cross-boundary features. */
export function createChunkIndex(world: Readonly<WildernessRuntimeWorld>): ChunkIndex {
  assertWorld(world);
  const terrain = world.terrain, layout = world.layout;
  const anchors: ChunkAnchor[] = [
    { id: 'camp', kind: 'camp', position: copyPoint(CAMP), radius: 0 },
    { id: 'crypt_gate', kind: 'cryptGate', position: copyPoint(CRYPT_GATE), radius: 30 },
    ...getTownManifest().map(town => ({
      id: town.id, kind: 'town' as const,
      position: copyPoint(town.position), radius: town.collisionRadius
    })),
    ...WORLD_OBJECTS.filter(obj => obj.zone === 'wilderness').map(obj => ({
      id: obj.id, kind: 'worldObject' as const,
      position: copyPoint(obj.position), radius: obj.hitRadius
    }))
  ];
  const factTargets: WorldFactTarget[] = [];
  const includeFact = (kind: WorldFactKind, id: string, position: Readonly<Point>): void => {
    const coord = chunkForPoint(position);
    if (!coord) throw new RangeError('Invalid world fact target');
    factTargets.push(Object.freeze({ kind, entityId: id, homeChunkId: chunkId(coord) }));
  };
  includeFact('landmarkDiscovered', 'camp', CAMP);
  includeFact('landmarkDiscovered', 'crypt_gate', CRYPT_GATE);
  for (const feature of world.features) {
    includeFact('landmarkDiscovered', feature.id, feature.position);
    if (feature.kind === 'treasure') includeFact('chestOpened', feature.id, feature.position);
    if (feature.kind === 'event') includeFact('eventCompleted', feature.id, feature.position);
    if (feature.kind === 'miniBoss') includeFact('uniqueEnemyDefeated', feature.id, feature.position);
  }
  for (const obj of WORLD_OBJECTS) {
    if (obj.zone === 'wilderness' && obj.kind === 'chest') {
      includeFact('chestOpened', obj.id, obj.position);
    }
  }
  for (const town of getTownManifest()) {
    if (town.role === 'waypoint') includeFact('waypointActivated', town.id, town.position);
  }

  const chunks: ChunkManifest[] = [];
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLUMNS; cx++) {
      const coord = Object.freeze({ cx, cy });
      const id = chunkId(coord), bounds = chunkBounds(coord);
      const tiles = terrain.tiles.filter(tile =>
        rectOverlap(bounds, boundsOf(tile.x, tile.y, tile.width, tile.height)))
        .map(tile => Object.freeze({ ...tile }));
      const obstacles = layout.obstacles.filter(o =>
        rectOverlap(bounds, boundsOf(o.x, o.y, o.width, o.height)))
        .map(o => Object.freeze({ ...o }));
      const roads: ChunkRoadSegment[] = [];
      for (const road of terrain.roads) {
        for (let i = 1; i < road.points.length; i++) {
          const from = road.points[i - 1]!, to = road.points[i]!;
          if (roadTouchesChunk(from, to, road.width, bounds)) {
            roads.push(Object.freeze({
              roadId: road.id, segmentIndex: i - 1,
              from: copyPoint(from), to: copyPoint(to), width: road.width
            }));
          }
        }
      }
      const encounters = layout.encounterPositions.flatMap((position, i) =>
        chunkForPoint(position)?.cx === cx && chunkForPoint(position)?.cy === cy
          ? [Object.freeze({
              id: 'encounter-' + i, position: copyPoint(position)
            })] : []);
      const featureIds = world.features.filter(f =>
        circleTouchesChunk(f.position, f.radius, bounds)).map(f => f.id);
      const localAnchors = anchors.filter(a =>
        circleTouchesChunk(a.position, a.radius, bounds))
        .map(a => Object.freeze({ ...a, position: copyPoint(a.position) }));
      chunks.push(Object.freeze({
        id, coord, bounds, seed: chunkSeed(layout.seed, id),
        tiles: freezeList(tiles), roads: freezeList(roads),
        obstacles: freezeList(obstacles), encounters: freezeList(encounters),
        featureIds: freezeList(featureIds), anchors: freezeList(localAnchors)
      }));
    }
  }
  const result: ChunkIndex = Object.freeze({
    seed: layout.seed, width: WORLD_WIDTH, height: WORLD_HEIGHT,
    chunkSize: CHUNK_SIZE, tileSize: TILE_SIZE,
    chunks: freezeList(chunks), factTargets: freezeList(factTargets)
  });
  if (!validateChunkIndex(result)) throw new RangeError('Invalid generated chunk index');
  return result;
}

export function validateChunkIndex(value: unknown): value is ChunkIndex {
  if (!record(value) || !uint32(value.seed)
    || value.width !== WORLD_WIDTH || value.height !== WORLD_HEIGHT
    || value.chunkSize !== CHUNK_SIZE || value.tileSize !== TILE_SIZE
    || !Array.isArray(value.chunks) || value.chunks.length !== COLUMNS * ROWS
    || !Array.isArray(value.factTargets) || value.factTargets.length > MAX_FEATURES * 4) return false;
  const input = value as unknown as ChunkIndex;
  let tileCount = 0;
  for (let i = 0; i < input.chunks.length; i++) {
    const chunk = input.chunks[i]!;
    if (!record(chunk) || !validCoord(chunk.coord)) return false;
    const expected = { cx: i % COLUMNS, cy: Math.floor(i / COLUMNS) };
    if (chunk.coord.cx !== expected.cx || chunk.coord.cy !== expected.cy
      || chunk.id !== chunkId(expected)
      || !record(chunk.bounds)
      || JSON.stringify(chunk.bounds) !== JSON.stringify(chunkBounds(expected))
      || chunk.seed !== chunkSeed(input.seed, chunk.id)
      || !Array.isArray(chunk.tiles) || chunk.tiles.length > 100
      || !Array.isArray(chunk.roads) || chunk.roads.length > MAX_ROADS * MAX_ROAD_POINTS
      || !Array.isArray(chunk.obstacles) || chunk.obstacles.length > MAX_WALLS
      || !Array.isArray(chunk.encounters) || chunk.encounters.length > 3
      || !Array.isArray(chunk.featureIds) || chunk.featureIds.length > MAX_FEATURES
      || !Array.isArray(chunk.anchors) || chunk.anchors.length > 128) return false;
    tileCount += chunk.tiles.length;
    for (const tile of chunk.tiles) {
      if (!validTile(tile) || !rectOverlap(chunk.bounds,
        boundsOf(tile.x, tile.y, tile.width, tile.height))) return false;
    }
    for (const obs of chunk.obstacles) {
      if (!validRect(obs) || !rectOverlap(chunk.bounds,
        boundsOf(obs.x, obs.y, obs.width, obs.height))) return false;
    }
    for (const road of chunk.roads) {
      if (!record(road) || !idString(road.roadId) && !/^road-[a-z0-9_-]{1,80}$/.test(String(road.roadId))
        || !Number.isInteger(road.segmentIndex) || road.segmentIndex < 0
        || !inWorld(road.from) || !inWorld(road.to)
        || !positive(road.width) || road.width > 300
        || !roadTouchesChunk(road.from, road.to, road.width, chunk.bounds)) return false;
    }
    for (const item of chunk.encounters) {
      if (!record(item) || !idString(item.id) || !inWorld(item.position)
        || chunkId(chunkForPoint(item.position)!) !== chunk.id) return false;
    }
    if (new Set(chunk.featureIds).size !== chunk.featureIds.length
      || chunk.featureIds.some(id => !idString(id))) return false;
    const anchorIds = new Set<string>();
    for (const anchor of chunk.anchors) {
      if (!record(anchor) || !idString(anchor.id) || anchorIds.has(anchor.id)
        || !inWorld(anchor.position) || typeof anchor.radius !== 'number'
        || !Number.isFinite(anchor.radius) || anchor.radius < 0
        || !['camp', 'cryptGate', 'town', 'worldObject'].includes(anchor.kind)
        || !circleTouchesChunk(anchor.position, anchor.radius, chunk.bounds)) return false;
      anchorIds.add(anchor.id);
    }
  }
  if (tileCount !== Math.ceil(WORLD_WIDTH / TILE_SIZE) * Math.ceil(WORLD_HEIGHT / TILE_SIZE)) return false;
  const seen = new Set<string>();
  for (const target of input.factTargets) {
    if (!record(target) || !FACT_KINDS.includes(target.kind)
      || !idString(target.entityId) || !parseChunk(target.homeChunkId)
      || seen.has(target.kind + '/' + target.entityId)) return false;
    seen.add(target.kind + '/' + target.entityId);
  }
  return true;
}

export interface StreamOptions {
  readonly loadRadius?: number;
  readonly unloadRadius?: number;
  readonly loadBudget?: number;
  readonly unloadBudget?: number;
  readonly zone?: 'wilderness' | 'crypt';
  readonly reset?: boolean;
}
export type ChunkPlan =
  | { readonly ok: true; readonly load: readonly ChunkId[];
      readonly unload: readonly ChunkId[]; readonly nextActive: readonly ChunkId[] }
  | { readonly ok: false; readonly error:
      'invalidIndex' | 'invalidPosition' | 'invalidActive' | 'invalidOptions' | 'insufficientBudget' };

function planError(code: Extract<ChunkPlan, { ok: false }>['error']): ChunkPlan {
  return Object.freeze({ ok: false as const, error: code });
}
function coordDistanceSq(a: ChunkCoord, b: ChunkCoord): number {
  return (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
}
function coordOrder(a: ChunkId, b: ChunkId): number {
  const aa = parseChunk(a)!, bb = parseChunk(b)!;
  return aa.cx - bb.cx || aa.cy - bb.cy;
}
function validOptionInteger(value: unknown, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
}
/** Pure, finite delta: caller applies load/unload and passes nextActive at the next tick. */
export function planVisibleChunks(index: unknown, playerPosition: unknown,
  activeIds: unknown, options: StreamOptions = {}): ChunkPlan {
  if (!validateChunkIndex(index)) return planError('invalidIndex');
  if (!record(options)
    || (options.zone !== undefined && options.zone !== 'wilderness' && options.zone !== 'crypt')
    || (options.reset !== undefined && typeof options.reset !== 'boolean')) {
    return planError('invalidOptions');
  }
  const loadRadius = options.loadRadius ?? 1, unloadRadius = options.unloadRadius ?? 2;
  const loadBudget = options.loadBudget ?? 4, unloadBudget = options.unloadBudget ?? 4;
  if (!validOptionInteger(loadRadius, COLUMNS)
    || !validOptionInteger(unloadRadius, COLUMNS + ROWS)
    || loadRadius > unloadRadius
    || !validOptionInteger(loadBudget, COLUMNS * ROWS)
    || !validOptionInteger(unloadBudget, COLUMNS * ROWS)) return planError('invalidOptions');

  if (!Array.isArray(activeIds) || activeIds.length > index.chunks.length) {
    return planError('invalidActive');
  }
  const present = new Set<ChunkId>();
  for (const id of activeIds as unknown[]) {
    if (typeof id !== 'string' || !parseChunk(id) || present.has(id)) {
      return planError('invalidActive');
    }
    present.add(id);
  }
  const clearing = options.zone === 'crypt' || options.reset === true;
  const player = clearing ? null : chunkForPoint(playerPosition);
  if (!clearing && !player) return planError('invalidPosition');

  const load: ChunkId[] = [], unload: ChunkId[] = [];
  if (clearing) {
    const pending = [...present].sort(coordOrder);
    unload.push(...pending.slice(0, unloadBudget));
  } else if (player) {
    const near = (coord: ChunkCoord, radius: number): boolean =>
      Math.max(Math.abs(player.cx - coord.cx), Math.abs(player.cy - coord.cy)) <= radius;
    const candidate = index.chunks.filter(c => near(c.coord, loadRadius) && !present.has(c.id))
      .sort((a, b) => coordDistanceSq(a.coord, player) - coordDistanceSq(b.coord, player)
        || a.coord.cx - b.coord.cx || a.coord.cy - b.coord.cy);
    if (candidate.some(c => c.coord.cx === player.cx && c.coord.cy === player.cy)
      && loadBudget === 0) return planError('insufficientBudget');
    load.push(...candidate.slice(0, loadBudget).map(c => c.id));
    const far = [...present].filter(id =>
      id !== chunkId(player) && !near(parseChunk(id)!, unloadRadius))
      .sort((a, b) => coordDistanceSq(parseChunk(b)!, player) -
        coordDistanceSq(parseChunk(a)!, player) || coordOrder(a, b));
    unload.push(...far.slice(0, unloadBudget));
  }
  const next = new Set([...present].filter(id => !unload.includes(id)).concat(load));
  const order = (a: ChunkId, b: ChunkId): number =>
    player ? coordDistanceSq(parseChunk(a)!, player) - coordDistanceSq(parseChunk(b)!, player)
      || coordOrder(a, b) : coordOrder(a, b);
  return Object.freeze({
    ok: true as const,
    load: freezeList(load), unload: freezeList(unload),
    nextActive: freezeList([...next].sort(order))
  });
}

const FACT_KINDS: readonly WorldFactKind[] = [
  'chestOpened', 'eventCompleted', 'uniqueEnemyDefeated',
  'landmarkDiscovered', 'waypointActivated'
];
export interface WorldFact {
  /** Canonical occurrence key, unique within its world-instance ledger. */
  readonly id: string;
  readonly worldInstanceId: string;
  readonly kind: WorldFactKind;
  readonly chunkId: ChunkId;
  readonly entityId: string;
}
export interface WorldFactLedger {
  readonly worldInstanceId: string;
  readonly worldSeed: number;
  readonly entries: readonly WorldFact[];
}
export interface WorldFactApplyResult {
  readonly changed: boolean;
  readonly state: WorldFactLedger;
}
function sessionMatches(index: ChunkIndex, id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const prefix = 'wilderness/' + index.seed + '/';
  return id.startsWith(prefix) && SESSION_PATTERN.test(id.slice(prefix.length));
}
function targetFor(index: ChunkIndex, kind: unknown, entityId: unknown): WorldFactTarget | null {
  if (!FACT_KINDS.includes(kind as WorldFactKind) || !idString(entityId)) return null;
  return index.factTargets.find(t => t.kind === kind && t.entityId === entityId) ?? null;
}
function validFact(index: ChunkIndex, fact: unknown, instanceId: string): fact is WorldFact {
  if (!record(fact) || fact.worldInstanceId !== instanceId
    || typeof fact.id !== 'string' || !idString(fact.entityId)) return false;
  const target = targetFor(index, fact.kind, fact.entityId);
  return !!target && fact.chunkId === target.homeChunkId
    && fact.id === fact.kind + '/' + fact.entityId
    && Object.keys(fact).length === 5;
}
/**
 * Token must uniquely identify the current session/seed instance; no randomness is
 * synthesized here. A fresh seed or session token must create a different ledger.
 */
export function createWorldFactLedger(index: ChunkIndex, sessionToken: unknown): WorldFactLedger {
  if (!validateChunkIndex(index) || typeof sessionToken !== 'string'
    || !SESSION_PATTERN.test(sessionToken)) throw new RangeError('Invalid world session');
  return Object.freeze({
    worldInstanceId: 'wilderness/' + index.seed + '/' + sessionToken,
    worldSeed: index.seed, entries: freezeList([])
  });
}
/** Only known, kind-compatible entities have a canonical record. */
export function makeWorldFact(index: ChunkIndex, worldInstanceId: unknown,
  kind: unknown, entityId: unknown): WorldFact {
  if (!validateChunkIndex(index) || !sessionMatches(index, worldInstanceId)) {
    throw new RangeError('Invalid world instance');
  }
  const target = targetFor(index, kind, entityId);
  if (!target) throw new RangeError('Unknown or incompatible world fact entity');
  return Object.freeze({
    id: target.kind + '/' + target.entityId,
    worldInstanceId, kind: target.kind, chunkId: target.homeChunkId,
    entityId: target.entityId
  });
}
export function validateWorldFactLedger(index: unknown, state: unknown): state is WorldFactLedger {
  if (!validateChunkIndex(index) || !record(state)
    || !sessionMatches(index, state.worldInstanceId)
    || state.worldSeed !== index.seed
    || !Array.isArray(state.entries) || state.entries.length > MAX_LEDGER_FACTS
    || Object.keys(state).length !== 3) return false;
  const seen = new Set<string>();
  for (const fact of state.entries) {
    if (!validFact(index, fact, state.worldInstanceId) || seen.has(fact.id)) return false;
    seen.add(fact.id);
  }
  return true;
}
/** Immutable exactly-once session facts; never grants loot, XP, quest or waypoint travel. */
export function applyWorldFact(index: ChunkIndex, state: WorldFactLedger,
  fact: WorldFact): WorldFactApplyResult {
  if (!validateWorldFactLedger(index, state)
    || !validFact(index, fact, state.worldInstanceId)) {
    throw new RangeError('Invalid world fact or ledger');
  }
  if (state.entries.some(entry => entry.id === fact.id)) {
    return Object.freeze({ changed: false, state });
  }
  if (state.entries.length >= MAX_LEDGER_FACTS) throw new RangeError('World ledger limit');
  const next: WorldFactLedger = Object.freeze({
    worldInstanceId: state.worldInstanceId,
    worldSeed: state.worldSeed,
    entries: freezeList([...state.entries, Object.freeze({ ...fact })])
  });
  return Object.freeze({ changed: true, state: next });
}
