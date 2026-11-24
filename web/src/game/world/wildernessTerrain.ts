// GPL-3.0-only — Agent 26 / Wave E / Prompt 22.
// Pure, session-local world data; the integrator alone connects it to simulation/rendering.
import type { Point } from '../core/types';
import { CAMP, CAMP_RADIUS, CRYPT_GATE, type WorldLayout } from './generator';
import {
  ACTOR_RADIUS, OBSTACLES, WORLD_HEIGHT, WORLD_WIDTH,
  canOccupy, findPath, type Obstacle
} from './navigation';
import { getTownManifest } from './townManifest';
import { WORLD_OBJECTS } from './interactables';
import { regionalRoadClear } from './regionalTopology';

/**
 * Seed policy: accept only integral uint32 values [0, 0xffffffff], including 0.
 * Do not coerce strings, round fractions, wrap negatives or silently replace NaN.
 * Numeric inputs outside this range throw RangeError, not a partial world.
 */
export type TerrainId =
  | 'town_clearing'
  | 'dark_grass'
  | 'dead_leaves'
  | 'corrupted_soil'
  | 'broken_stone'
  | 'dirt_road';

export interface TerrainTile {
  x: number;
  y: number;
  width: number;
  height: number;
  terrainId: TerrainId;
  /** Pure visual variation: not authoritative collision or localized text. */
  variant: number;
}

export interface TerrainRoad {
  id: string;
  from: Point;
  to: Point;
  width: number;
  /** Connected waypoints validated against the same obstacles as gameplay. */
  points: Point[];
}

export type WildernessIssueCode =
  | 'invalidLayout'
  | 'invalidSeed'
  | 'invalidBounds'
  | 'invalidCamp'
  | 'invalidObstacle'
  | 'duplicateObstacleId'
  | 'invalidEncounters'
  | 'invalidTileCoverage'
  | 'invalidTile'
  | 'invalidRoad'
  | 'blockedPoint'
  | 'unreachable';

export interface WildernessValidationIssue {
  code: WildernessIssueCode;
  id?: string;
}

export interface WildernessValidationReport {
  valid: boolean;
  errors: WildernessValidationIssue[];
  generationAttempts: number;
  /** Number of placement trials attempted across all generation attempts. */
  obstacleAttempts: number;
  usedFallback: boolean;
}

export interface WildernessTerrainResult {
  biomeId: 'corrupted_frontier';
  width: number;
  height: number;
  tileSize: number;
  layout: WorldLayout;
  tiles: TerrainTile[];
  roads: TerrainRoad[];
  validation: WildernessValidationReport;
}

export const TERRAIN_TILE_SIZE = 80;
export const MAX_OBSTACLE_ATTEMPTS = 120;
export const MAX_LAYOUT_RETRIES = 3;
const MAX_GENERATED_OBSTACLES = 20;
const OBSTACLE_GAP = 28;
const ROAD_GUARD = 48;
const TOWN_GUARD = CAMP_RADIUS + ACTOR_RADIUS + 36;

const ENCOUNTER_ANCHORS: readonly Point[] = [
  { x: 780, y: 520 }, { x: 910, y: 635 }, { x: 1050, y: 535 }
];
const TERRAIN_IDS: readonly TerrainId[] = [
  'town_clearing', 'dark_grass', 'dead_leaves', 'corrupted_soil',
  'broken_stone', 'dirt_road'
];

function validSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= 0 && value <= 0xffffffff;
}
function finitePoint(point: unknown): point is Point {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return false;
  const candidate = point as Partial<Point>;
  return typeof candidate.x === 'number' && Number.isFinite(candidate.x)
    && typeof candidate.y === 'number' && Number.isFinite(candidate.y);
}
function validObstacle(wall: unknown): wall is Obstacle {
  if (!wall || typeof wall !== 'object' || Array.isArray(wall)) return false;
  const candidate = wall as Partial<Obstacle>;
  return typeof candidate.id === 'string' && /^[a-z][a-z0-9-]*$/.test(candidate.id)
    && Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
    && Number.isFinite(candidate.width) && Number.isFinite(candidate.height)
    && candidate.x !== undefined && candidate.y !== undefined
    && candidate.width !== undefined && candidate.height !== undefined
    && candidate.width > 0 && candidate.height > 0
    && candidate.x >= 0 && candidate.y >= 0
    && candidate.x + candidate.width <= WORLD_WIDTH
    && candidate.y + candidate.height <= WORLD_HEIGHT;
}
function clonePoint(point: Readonly<Point>): Point { return { x: point.x, y: point.y }; }
function fixedWalls(): Obstacle[] { return OBSTACLES.map(wall => ({ ...wall })); }
function squareDistance(a: Readonly<Point>, b: Readonly<Point>): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
function rectangleDistance(point: Readonly<Point>, wall: Readonly<Obstacle>): number {
  const x = Math.max(wall.x, Math.min(point.x, wall.x + wall.width));
  const y = Math.max(wall.y, Math.min(point.y, wall.y + wall.height));
  return Math.hypot(x - point.x, y - point.y);
}
function wallsOverlap(a: Readonly<Obstacle>, b: Readonly<Obstacle>, gap: number): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}
function distanceToSegmentSquared(point: Readonly<Point>, a: Readonly<Point>, b: Readonly<Point>): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const divisor = dx * dx + dy * dy;
  const ratio = divisor > 0 ? Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / divisor)) : 0;
  return squareDistance(point, { x: a.x + ratio * dx, y: a.y + ratio * dy });
}
/** Conservative rectangle/route test with fixed spatial steps (never unbounded). */
function nearSegment(wall: Readonly<Obstacle>, start: Readonly<Point>, end: Readonly<Point>): boolean {
  const distance = Math.hypot(start.x - end.x, start.y - end.y);
  const steps = Math.max(1, Math.ceil(distance / 16));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (rectangleDistance({ x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t }, wall) <= ROAD_GUARD) return true;
  }
  return false;
}
/** Local seeded PRNG. No mutable module state; no browser or clock usage. */
function randomFor(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function hash(seed: number, x: number, y: number): number {
  let value = (seed ^ Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca77)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

interface RequiredTarget { id: string; position: Point }
function targets(encounters: readonly Point[]): RequiredTarget[] {
  return [
    { id: 'crypt-gate', position: clonePoint(CRYPT_GATE) },
    ...WORLD_OBJECTS.filter(object => object.zone === 'wilderness')
      .map(object => ({ id: object.id, position: clonePoint(object.position) })),
    ...getTownManifest().map(entry => ({ id: entry.id, position: clonePoint(entry.position) })),
    ...encounters.map((position, index) => ({
      id: 'encounter-' + index, position: clonePoint(position)
    }))
  ];
}
function encountersFor(seed: number, random: () => number): Point[] {
  return ENCOUNTER_ANCHORS.map(point => seed === 0 ? clonePoint(point) : {
    x: point.x + Math.round((random() - 0.5) * 56),
    y: point.y + Math.round((random() - 0.5) * 56)
  });
}
function protectedWall(wall: Obstacle, encounters: readonly Point[]): boolean {
  if (rectangleDistance(CAMP, wall) <= TOWN_GUARD) return true;
  const landmarks = [CRYPT_GATE, ...WORLD_OBJECTS.filter(object => object.zone === 'wilderness')
    .map(object => object.position)];
  if (landmarks.some(point => rectangleDistance(point, wall) <= 94)) return true;
  if (encounters.some(point => rectangleDistance(point, wall) <= 90)) return true;
  return targets(encounters).some(target => nearSegment(wall, CAMP, target.position));
}
function generateObstacles(random: () => number, encounters: readonly Point[]): {
  obstacles: Obstacle[]; attempts: number
} {
  const obstacles = fixedWalls();
  let attempts = 0;
  while (attempts < MAX_OBSTACLE_ATTEMPTS
    && obstacles.length < OBSTACLES.length + MAX_GENERATED_OBSTACLES) {
    attempts++;
    const width = 40 + Math.floor(random() * 85);
    const height = 40 + Math.floor(random() * 90);
    const wall: Obstacle = {
      id: 'forest-' + (obstacles.length - OBSTACLES.length),
      x: 55 + Math.floor(random() * (WORLD_WIDTH - width - 110)),
      y: 55 + Math.floor(random() * (WORLD_HEIGHT - height - 110)),
      width, height
    };
    if (protectedWall(wall, encounters)) continue;
    if (obstacles.some(other => wallsOverlap(wall, other, OBSTACLE_GAP))) continue;
    obstacles.push(wall);
  }
  return { obstacles, attempts };
}
function buildRoads(encounters: readonly Point[], obstacles: readonly Obstacle[]): TerrainRoad[] {
  const roads: TerrainRoad[] = [];
  for (const target of targets(encounters)) {
    const path = findPath(CAMP, target.position, ACTOR_RADIUS, obstacles);
    if (path.length === 0) continue;
    roads.push({
      id: 'road-' + target.id,
      from: clonePoint(CAMP),
      to: clonePoint(target.position),
      width: 44,
      points: [clonePoint(CAMP), ...path.map(clonePoint)]
    });
  }
  return roads;
}
export function makeWildernessTiles(seed: number, roads: readonly TerrainRoad[]): TerrainTile[] {
  const tiles: TerrainTile[] = [];
  const cols = Math.ceil(WORLD_WIDTH / TERRAIN_TILE_SIZE);
  const rows = Math.ceil(WORLD_HEIGHT / TERRAIN_TILE_SIZE);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * TERRAIN_TILE_SIZE, py = y * TERRAIN_TILE_SIZE;
      const width = Math.min(TERRAIN_TILE_SIZE, WORLD_WIDTH - px);
      const height = Math.min(TERRAIN_TILE_SIZE, WORLD_HEIGHT - py);
      const middle = { x: px + width / 2, y: py + height / 2 };
      const noise = hash(seed, Math.floor(x / 3), Math.floor(y / 3)) % 100;
      const detail = hash(seed ^ 0xc2b2ae35, x, y);
      let terrainId: TerrainId = noise < 33 ? 'dark_grass'
        : noise < 57 ? 'dead_leaves'
          : noise < 85 ? 'corrupted_soil' : 'broken_stone';
      if (roads.some(road => {
        for (let i = 1; i < road.points.length; i++) {
          if (distanceToSegmentSquared(middle, road.points[i - 1]!, road.points[i]!)
            <= (TERRAIN_TILE_SIZE * 0.48) ** 2) return true;
        }
        return false;
      })) terrainId = 'dirt_road';
      if (Math.hypot(middle.x - CAMP.x, middle.y - CAMP.y)
        < CAMP_RADIUS + TERRAIN_TILE_SIZE * 0.1) terrainId = 'town_clearing';
      tiles.push({ x: px, y: py, width, height, terrainId,
        variant: terrainId === 'town_clearing' ? 0 : detail % 4 });
    }
  }
  return tiles;
}

export function routeClear(points: readonly Point[], obstacles: readonly Obstacle[]): boolean {
  if (points.length < 2) return false;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!, to = points[index]!;
    if (!finitePoint(from) || !finitePoint(to)) return false;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / 12));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      if (!canOccupy({ x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t }, ACTOR_RADIUS, obstacles)) return false;
    }
  }
  return true;
}

/**
 * Defensive validation of an untrusted or generated wilderness payload.
 * No mutation or exceptions. Invalid geometry is rejected before pathfinding.
 * Critical targets are the original town/service NPCs, world interactions,
 * crypt gate, and exactly three historical encounter anchors (±32).
 */
export function validateWildernessTerrain(value: unknown): WildernessValidationIssue[] {
  const errors: WildernessValidationIssue[] = [];
  const add = (code: WildernessIssueCode, id?: string): void => {
    errors.push(id === undefined ? { code } : { code, id });
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [{ code: 'invalidLayout' }];
  }
  const world = value as Partial<WildernessTerrainResult>;
  const layout = world.layout as Partial<WorldLayout> | undefined;
  if (!layout || typeof layout !== 'object'
    || !Array.isArray(layout.obstacles) || !Array.isArray(layout.encounterPositions)
    || !Array.isArray(world.tiles) || !Array.isArray(world.roads)) {
    return [{ code: 'invalidLayout' }];
  }
  if (!validSeed(layout.seed)) add('invalidSeed');
  if (world.width !== WORLD_WIDTH || world.height !== WORLD_HEIGHT
    || world.tileSize !== TERRAIN_TILE_SIZE || world.biomeId !== 'corrupted_frontier') add('invalidBounds');
  if (!finitePoint(layout.camp) || layout.camp.x !== CAMP.x || layout.camp.y !== CAMP.y) add('invalidCamp');

  const ids = new Set<string>();
  let validWalls = true;
  for (const obstacle of layout.obstacles) {
    if (!validObstacle(obstacle)) {
      add('invalidObstacle');
      validWalls = false;
      continue;
    }
    if (ids.has(obstacle.id)) add('duplicateObstacleId', obstacle.id);
    ids.add(obstacle.id);
  }
  for (const fixed of OBSTACLES) {
    const preserved = layout.obstacles.some(obstacle => validObstacle(obstacle)
      && obstacle.id === fixed.id && obstacle.x === fixed.x && obstacle.y === fixed.y
      && obstacle.width === fixed.width && obstacle.height === fixed.height);
    if (!preserved) add('invalidObstacle', fixed.id);
  }

  const encounters = layout.encounterPositions;
  if (encounters.length !== ENCOUNTER_ANCHORS.length) add('invalidEncounters');
  for (let i = 0; i < encounters.length; i++) {
    const point = encounters[i];
    const anchor = ENCOUNTER_ANCHORS[i];
    if (!anchor || !finitePoint(point) || Math.abs(point.x - anchor.x) > 32
      || Math.abs(point.y - anchor.y) > 32
      || Math.hypot(point.x - CAMP.x, point.y - CAMP.y) <= CAMP_RADIUS) {
      add('invalidEncounters', 'encounter-' + i);
    }
  }

  const expectedCols = Math.ceil(WORLD_WIDTH / TERRAIN_TILE_SIZE);
  const expectedCount = expectedCols * Math.ceil(WORLD_HEIGHT / TERRAIN_TILE_SIZE);
  if (world.tiles.length !== expectedCount) add('invalidTileCoverage');
  world.tiles.forEach((tile, index) => {
    const x = (index % expectedCols) * TERRAIN_TILE_SIZE;
    const y = Math.floor(index / expectedCols) * TERRAIN_TILE_SIZE;
    if (!tile || !Number.isFinite(tile.x) || !Number.isFinite(tile.y)
      || tile.x !== x || tile.y !== y
      || tile.width !== Math.min(TERRAIN_TILE_SIZE, WORLD_WIDTH - x)
      || tile.height !== Math.min(TERRAIN_TILE_SIZE, WORLD_HEIGHT - y)
      || !TERRAIN_IDS.includes(tile.terrainId)
      || !Number.isInteger(tile.variant) || tile.variant < 0 || tile.variant > 3) {
      add('invalidTile', 'tile-' + index);
    }
  });
  if (!validWalls || !finitePoint(layout.camp)) return errors;

  const walls = layout.obstacles;
  const required = [
    { id: 'camp', position: CAMP },
    ...targets(encounters.filter(finitePoint))
  ];
  for (const { id, position } of required) {
    if (!canOccupy(position, ACTOR_RADIUS, walls)) {
      add('blockedPoint', id);
    } else if (canOccupy(CAMP, ACTOR_RADIUS, walls)
      && findPath(CAMP, position, ACTOR_RADIUS, walls).length === 0) {
      add('unreachable', id);
    }
  }
  for (const entry of getTownManifest()) {
    if (!canOccupy(entry.position, ACTOR_RADIUS + entry.collisionRadius, walls)) {
      add('blockedPoint', entry.id);
    }
  }
  const seenRoads = new Set<string>();
  const validRegional: TerrainRoad[] = [];
  const samePoint = (a: Point,b: Point) => a.x===b.x && a.y===b.y;
  const regional = (id: string) => /^road-(trade|trail)-[a-z0-9_-]+$/.test(id);
  for (const road of world.roads) {
    const isRegional = typeof road?.id === 'string' && regional(road.id);
    if (!road || typeof road.id !== 'string' || !/^road-[a-z0-9_-]+$/.test(road.id)
      || seenRoads.has(road.id) || !Array.isArray(road.points)
      || !finitePoint(road.from) || !finitePoint(road.to)
      || !Number.isFinite(road.width) || road.width < (isRegional && road.id.startsWith('road-trail-') ? 24 : ACTOR_RADIUS * 2)
      || (!isRegional && !samePoint(road.from,CAMP)
        && !world.roads.some(main => main && main !== road && main.from?.x === CAMP.x
          && main.from.y === CAMP.y && Array.isArray(main.points)
          && [road.from, road.to].every(junction => main.points.some(
            point => point?.x === junction.x && point.y === junction.y))))
      || !road.points.every(finitePoint)
      || road.points.length < 2
      || !samePoint(road.points[0]!,road.from) || !samePoint(road.points.at(-1)!,road.to)
      || (isRegional ? !regionalRoadClear(road.points,road.width,walls) : !routeClear(road.points,walls))) {
      add('invalidRoad', road?.id);
    } else if (isRegional) validRegional.push(road);
    if (road && typeof road.id === 'string') seenRoads.add(road.id);
  }
  // A valid isolated segment is not a connected trade network. Flood only
  // trade endpoints from camp; branch trails may attach to any point on a
  // connected trade segment (including interior junctions).
  const trade = validRegional.filter(r=>r.id.startsWith('road-trade-'));
  const connected: TerrainRoad[] = [];
  const junctions: Point[] = [CAMP];
  for (let i=0;i<trade.length;i++) {
    let changed=false;
    for (const road of trade) {
      if (connected.includes(road) || !junctions.some(p=>samePoint(p,road.from)||samePoint(p,road.to))) continue;
      connected.push(road);junctions.push(road.from,road.to);changed=true;
    }
    if(!changed)break;
  }
  for(const road of trade)if(!connected.includes(road))add('invalidRoad',road.id);
  for(const road of validRegional.filter(r=>r.id.startsWith('road-trail-'))) {
    if(!connected.some(main=>main.points.slice(1).some((p,i)=>
      distanceToSegmentSquared(road.from,main.points[i]!,p)<=1e-8)))add('invalidRoad',road.id);
  }
  for (const target of targets(encounters.filter(finitePoint))) {
    if (!world.roads.some(road => road && road.id === 'road-' + target.id
      && finitePoint(road.to)
      && road.to.x === target.position.x && road.to.y === target.position.y)) {
      add('invalidRoad', 'road-' + target.id);
    }
  }
  return errors;
}

/**
 * Deterministic seed → 3 encounter anchors → bounded obstacles → walkable roads
 * → serializable terrain tiles → validation. On failed attempts, use the
 * *tested* fixed-wall world and historical encounter positions, not an unsafe map.
 * All returned graphs are freshly allocated; caller mutation cannot affect replay.
 */
export function generateWildernessTerrain(seed: number): WildernessTerrainResult {
  if (!validSeed(seed)) throw new RangeError('Wilderness seed must be a uint32 integer');
  let attempts = 0;
  let obstacleAttempts = 0;
  let selected: Omit<WildernessTerrainResult, 'validation'> | null = null;
  let validationErrors: WildernessValidationIssue[] = [];

  for (let retry = 0; retry < MAX_LAYOUT_RETRIES; retry++) {
    attempts++;
    const random = randomFor((seed ^ Math.imul(retry, 0x9e3779b1)) >>> 0);
    const encounters = encountersFor(seed, random);
    const generated = generateObstacles(random, encounters);
    obstacleAttempts += generated.attempts;
    const layout: WorldLayout = {
      seed, camp: clonePoint(CAMP),
      obstacles: generated.obstacles, encounterPositions: encounters
    };
    const roads = buildRoads(encounters, layout.obstacles);
    const proposed: Omit<WildernessTerrainResult, 'validation'> = {
      biomeId: 'corrupted_frontier',
      width: WORLD_WIDTH, height: WORLD_HEIGHT, tileSize: TERRAIN_TILE_SIZE,
      layout, roads, tiles: makeWildernessTiles(seed, roads)
    };
    validationErrors = validateWildernessTerrain(proposed);
    if (validationErrors.length === 0) {
      selected = proposed;
      break;
    }
  }

  let usedFallback = false;
  if (selected === null) {
    usedFallback = true;
    const layout: WorldLayout = {
      seed, camp: clonePoint(CAMP),
      obstacles: fixedWalls(),
      encounterPositions: ENCOUNTER_ANCHORS.map(clonePoint)
    };
    const roads = buildRoads(layout.encounterPositions, layout.obstacles);
    selected = {
      biomeId: 'corrupted_frontier',
      width: WORLD_WIDTH, height: WORLD_HEIGHT, tileSize: TERRAIN_TILE_SIZE,
      layout, roads, tiles: makeWildernessTiles(seed, roads)
    };
    validationErrors = validateWildernessTerrain(selected);
  }

  // A failure here signals a broken invariant in the shipped baseline; do not
  // return an unsafe success even if the fallback itself becomes unusable.
  if (validationErrors.length > 0) {
    throw new Error('Wilderness generation failed validation: '
      + validationErrors.map(issue => issue.code + ':' + (issue.id ?? '')).join(','));
  }
  return {
    ...selected,
    validation: {
      valid: true, errors: [], generationAttempts: attempts,
      obstacleAttempts, usedFallback
    }
  };
}
