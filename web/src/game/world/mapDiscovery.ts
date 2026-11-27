/**
 * Pure, world-instance-scoped map exploration and fog projection (GPL-3.0-only).
 * No UI, Phaser, persistent storage, hidden global RNG or world authority.
 * A caller must provide the player's verified actual position, never a click goal.
 */
import type { Point } from '../core/types';
import type { WildernessFeature } from './wildernessFeatures';
import type { WildernessTerrainResult, TerrainId } from './wildernessTerrain';
import { CAMP } from './generator';
import { WORLD_HEIGHT, WORLD_WIDTH } from './navigation';

export const MAP_CELL_SIZE = 80;
export const MAP_COLUMNS = Math.ceil(WORLD_WIDTH / MAP_CELL_SIZE);
export const MAP_ROWS = Math.ceil(WORLD_HEIGHT / MAP_CELL_SIZE);
export const MAP_CELL_COUNT = MAP_COLUMNS * MAP_ROWS;
export const MAX_REVEAL_RADIUS = 320;
export const MINIMAP_WIDTH=600;
export const MINIMAP_HEIGHT=400;
/** A verified movement sample must not span an unobserved teleport. */
export const MAX_TRAVEL_SEGMENT = 160;

const MAX_FEATURES = 256;
const MAX_WAYPOINTS = 64;
const MAX_QUEST_HINTS = 128;
const WORLD_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const FEATURE_ID = /^(?:act1\.[a-z][a-z0-9_]{0,63}|wild\.(?:poi|treasure|event|encounter)\.[1-9][0-9]{0,3})$/;
const WAYPOINT_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,3}$/;
const HINT_ID = /^[a-z][a-z0-9_.:-]{0,63}$/;
const TRANSLATION_KEY = /^[a-z][a-zA-Z0-9_.]{0,95}$/;
const FOG_ID = /^fog\/(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)$/;
const FEATURE_KINDS = new Set([
  'corruption', 'forest', 'graveyard', 'evidence', 'miniBoss',
  'encounterZone', 'cryptEntrance', 'poi', 'treasure', 'event'
]);

export type FogCellId = string;
export type FogVisibility = 'unexplored' | 'discovered';
export type MapMarkerKind =
  | 'player' | 'town' | 'landmark' | 'dungeonEntrance'
  | 'optionalPoi' | 'quest' | 'waypoint';
export type MapQuestStatus = 'active' | 'complete';

export interface MapWaypoint {
  readonly id: string;
  readonly position: Readonly<Point>;
  readonly presentationKey: string;
}

export interface MapWorldInput {
  /** Must match the authoritative terrain/feature layout seed exactly. */
  readonly seed: number;
  /** Fresh per world session; no cross-session discovery import. */
  readonly worldInstanceId: string;
  readonly features: readonly WildernessFeature[];
  readonly waypoints?: readonly MapWaypoint[];
}

export interface MapDiscoveryState {
  readonly version: 1;
  readonly worldSeed: number;
  readonly worldInstanceId: string;
  /** Stable fingerprint of the same seed's feature and waypoint locations. */
  readonly worldFingerprint: string;
  readonly width: typeof WORLD_WIDTH;
  readonly height: typeof WORLD_HEIGHT;
  readonly cellSize: typeof MAP_CELL_SIZE;
  /** Canonical row-major order, with no duplicates or noncanonical indices. */
  readonly revealedCells: readonly FogCellId[];
  /** Stable IDs only; each must also have an observed cell in this world. */
  readonly discoveredLandmarkIds: readonly string[];
  readonly discoveredWaypointIds: readonly string[];
  readonly activatedWaypointIds: readonly string[];
  /** Last verified observation; not a stored destination/click. */
  readonly lastObservedPosition: Readonly<Point> | null;
}

export interface MapQuestHint {
  readonly id: string;
  readonly status: MapQuestStatus;
  readonly featureId?: string;
  readonly position?: Readonly<Point>;
  readonly presentationKey?: string;
}

export interface MapViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MapProjectionOptions {
  readonly mode?: 'world' | 'minimap';
  /** View window at zoom 1, in world units; zoom crops around its center. */
  readonly viewport?: Readonly<MapViewport>;
  readonly zoom?: number;
  /** Optional map camera center, clamped to the world. Never changes discovery. */
  readonly center?: Readonly<Point>;
  /** null explicitly suppresses quest overlays; undefined preserves legacy projection. */
  readonly trackedQuestId?: string | null;
}

export interface MapFogCell extends MapViewport {
  readonly id: FogCellId;
  readonly visibility: FogVisibility;
  /** World map: discovered terrain only. Local minimap: all viewport terrain. */
  readonly terrainId?: TerrainId;
}

export interface MapMarker {
  readonly id: string;
  readonly kind: MapMarkerKind;
  readonly position: Readonly<Point>;
  readonly presentationKey: string;
  readonly activated?: boolean;
  readonly questStatus?: MapQuestStatus;
}

export interface MapHiddenQuestHint {
  readonly id: string;
  readonly status: MapQuestStatus;
  readonly presentationKey?: string;
  // Deliberately no featureId, location, approximate location or coordinates.
}

export interface MapVisibleRoad {
  readonly id: string;
  readonly cellId: FogCellId;
  readonly from: Readonly<Point>;
  readonly to: Readonly<Point>;
  readonly width: number;
}

export interface MapProjection {
  readonly roads?: readonly MapVisibleRoad[];
  readonly mode: 'world' | 'minimap';
  readonly zoom: number;
  readonly viewport: Readonly<MapViewport>;
  readonly cells: readonly MapFogCell[];
  readonly markers: readonly MapMarker[];
  readonly hints: readonly MapHiddenQuestHint[];
  /** Selected discovered target, even outside the current viewport. No hidden coordinates. */
  readonly navigationTarget?: MapMarker;
  readonly area?: 'wilderness'|'crypt'|'mine'|'cave';
  readonly walls?: readonly MapViewport[];
  readonly navigationRoute?: readonly Readonly<Point>[];
  readonly navigationStage?: 'enter'|'exit'|'objective';
}

export type MapDiscoveryError =
  | 'invalidWorld' | 'invalidState' | 'worldMismatch'
  | 'invalidPosition' | 'invalidRadius' | 'invalidSegment'
  | 'invalidViewport' | 'invalidQuestHints' | 'unknownWaypoint';

export type MapResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: MapDiscoveryError }>;

const failed = (error: MapDiscoveryError): MapResult<never> => ({ ok: false, error });
const succeeded = <T>(value: T): MapResult<T> => ({ ok: true, value });

function uint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= 0 && value <= 0xffffffff;
}

function plainId(value: unknown, regexp: RegExp, limit = 96): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit
    && value !== '__proto__' && value !== 'constructor' && value !== 'prototype'
    && regexp.test(value);
}

/** Pixel coordinates may be fractional: the live actor moves continuously. */
function validPoint(value: unknown): value is Readonly<Point> {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<Point>;
  return typeof p.x === 'number' && Number.isFinite(p.x)
    && typeof p.y === 'number' && Number.isFinite(p.y)
    && p.x >= 0 && p.x < WORLD_WIDTH && p.y >= 0 && p.y < WORLD_HEIGHT;
}

function validRadius(radius: unknown): radius is number {
  return typeof radius === 'number' && Number.isFinite(radius)
    && radius >= 0 && radius <= MAX_REVEAL_RADIUS;
}

function cellId(column: number, row: number): FogCellId {
  return 'fog/' + column + '/' + row;
}

function indices(id: unknown): { column: number; row: number } | null {
  if (typeof id !== 'string' || id.length > 16) return null;
  const match = FOG_ID.exec(id);
  if (!match) return null;
  const column = Number(match[1]);
  const row = Number(match[2]);
  return column < MAP_COLUMNS && row < MAP_ROWS ? { column, row } : null;
}

function pointCell(point: Readonly<Point>): FogCellId {
  return cellId(Math.floor(point.x / MAP_CELL_SIZE), Math.floor(point.y / MAP_CELL_SIZE));
}

function compareCells(a: FogCellId, b: FogCellId): number {
  const aa = indices(a)!;
  const bb = indices(b)!;
  return aa.row - bb.row || aa.column - bb.column;
}

function canonicalIds(ids: readonly string[], validator: (id: unknown) => boolean, max: number): boolean {
  if (!Array.isArray(ids) || ids.length > max) return false;
  let previous = '';
  for (const id of ids) {
    if (!validator(id) || (previous !== '' && previous >= id)) return false;
    previous = id;
  }
  return true;
}

function canonicalCells(value: unknown): value is readonly FogCellId[] {
  if (!Array.isArray(value) || value.length > MAP_CELL_COUNT) return false;
  let lastRow = -1;
  let lastCol = -1;
  for (const id of value) {
    const item = indices(id);
    if (!item) return false;
    if (item.row < lastRow || (item.row === lastRow && item.column <= lastCol)) return false;
    lastRow = item.row;
    lastCol = item.column;
  }
  return true;
}

function validWorld(value: unknown): value is Readonly<MapWorldInput> {
  if (!value || typeof value !== 'object') return false;
  const w = value as Partial<MapWorldInput>;
  if (!uint32(w.seed) || !plainId(w.worldInstanceId, WORLD_ID, 64)
    || !Array.isArray(w.features) || w.features.length > MAX_FEATURES
    || (w.waypoints !== undefined && (!Array.isArray(w.waypoints)
      || w.waypoints.length > MAX_WAYPOINTS))) return false;
  const used = new Set<string>();
  for (const feature of w.features) {
    if (!feature || !plainId(feature.id, FEATURE_ID, 80)
      || used.has(feature.id) || !validPoint(feature.position)
      || !FEATURE_KINDS.has(feature.kind)
      || typeof feature.mandatory !== 'boolean'
      || typeof feature.radius !== 'number' || !Number.isFinite(feature.radius)
      || feature.radius <= 0 || feature.radius > MAX_REVEAL_RADIUS
      || !plainId(feature.presentationKey, TRANSLATION_KEY, 96)) return false;
    used.add(feature.id);
  }
  for (const waypoint of w.waypoints ?? []) {
    if (!waypoint || !plainId(waypoint.id, WAYPOINT_ID, 64)
      || used.has(waypoint.id) || !validPoint(waypoint.position)
      || !plainId(waypoint.presentationKey, TRANSLATION_KEY, 96)) return false;
    used.add(waypoint.id);
  }
  return true;
}

/** Order-independent identity; detects accidental reuse with another layout. */
function worldFingerprint(world: Readonly<MapWorldInput>): string {
  const features = world.features.map(f => [
    f.id, f.kind, f.mandatory, f.position.x, f.position.y
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const waypoints = (world.waypoints ?? []).map(w => [
    w.id, w.position.x, w.position.y
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const encoded = JSON.stringify([world.seed, world.worldInstanceId, features, waypoints]);
  let hash = 2166136261;
  for (let i = 0; i < encoded.length; i++) {
    hash = Math.imul(hash ^ encoded.charCodeAt(i), 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function freezeState(state: MapDiscoveryState): MapDiscoveryState {
  return Object.freeze({
    ...state,
    lastObservedPosition: state.lastObservedPosition
      ? Object.freeze({ x: state.lastObservedPosition.x, y: state.lastObservedPosition.y })
      : null,
    revealedCells: Object.freeze([...state.revealedCells]),
    discoveredLandmarkIds: Object.freeze([...state.discoveredLandmarkIds]),
    discoveredWaypointIds: Object.freeze([...state.discoveredWaypointIds]),
    activatedWaypointIds: Object.freeze([...state.activatedWaypointIds])
  });
}

/** Fail-closed structural validation, including foreign-world discoveries. */
export function validateMapDiscovery(value: unknown, world?: Readonly<MapWorldInput>): value is MapDiscoveryState {
  try {
    if (!value || typeof value !== 'object') return false;
    const state = value as Partial<MapDiscoveryState>;
    if (state.version !== 1 || !uint32(state.worldSeed)
      || !plainId(state.worldInstanceId, WORLD_ID, 64)
      || typeof state.worldFingerprint !== 'string'
      || !/^[a-f0-9]{8}$/.test(state.worldFingerprint)
      || state.width !== WORLD_WIDTH || state.height !== WORLD_HEIGHT
      || state.cellSize !== MAP_CELL_SIZE || !canonicalCells(state.revealedCells)
      || !canonicalIds(state.discoveredLandmarkIds ?? [], id => plainId(id, FEATURE_ID, 80), MAX_FEATURES)
      || !canonicalIds(state.discoveredWaypointIds ?? [], id => plainId(id, WAYPOINT_ID, 64), MAX_WAYPOINTS)
      || !canonicalIds(state.activatedWaypointIds ?? [], id => plainId(id, WAYPOINT_ID, 64), MAX_WAYPOINTS)
      || !Array.isArray(state.discoveredLandmarkIds)
      || !Array.isArray(state.discoveredWaypointIds)
      || !Array.isArray(state.activatedWaypointIds)
      || (state.lastObservedPosition !== null && !validPoint(state.lastObservedPosition))) return false;
    const cellSet = new Set(state.revealedCells);
    if (state.lastObservedPosition !== null && !cellSet.has(pointCell(state.lastObservedPosition!))) return false;
    const discoveredWaypoints = new Set(state.discoveredWaypointIds);
    if (state.activatedWaypointIds!.some(id => !discoveredWaypoints.has(id))) return false;
    if (world !== undefined) {
      if (!validWorld(world)
        || state.worldSeed !== world.seed
        || state.worldInstanceId !== world.worldInstanceId
        || state.worldFingerprint !== worldFingerprint(world)) return false;
      const features = new Map(world.features.map(feature => [feature.id, feature]));
      const waypoints = new Map((world.waypoints ?? []).map(waypoint => [waypoint.id, waypoint]));
      for (const id of state.discoveredLandmarkIds!) {
        const feature = features.get(id as WildernessFeature['id']);
        if (!feature || !cellSet.has(pointCell(feature.position))) return false;
      }
      for (const id of state.discoveredWaypointIds!) {
        const waypoint = waypoints.get(id);
        if (!waypoint || !cellSet.has(pointCell(waypoint.position))) return false;
      }
    }
    return true;
  } catch {
    // Malformed/proxy-like external values never crash the map or save boundary.
    return false;
  }
}

function matchesWorld(state: MapDiscoveryState, world: MapWorldInput): boolean {
  return state.worldSeed === world.seed
    && state.worldInstanceId === world.worldInstanceId
    && state.worldFingerprint === worldFingerprint(world);
}

function validatePair(state: MapDiscoveryState, world: MapWorldInput): MapDiscoveryError | null {
  if (!validWorld(world)) return 'invalidWorld';
  if (!validateMapDiscovery(state)) return 'invalidState';
  return matchesWorld(state, world) && validateMapDiscovery(state, world)
    ? null : 'worldMismatch';
}

/** New session: town marker is known, but no surrounding cells are explored. */
export function createMapDiscovery(
  world: Readonly<MapWorldInput>,
  startPosition?: Readonly<Point>,
  startRadius = 0
): MapResult<MapDiscoveryState> {
  if (!validWorld(world)) return failed('invalidWorld');
  if (!validRadius(startRadius) || (startPosition === undefined && startRadius !== 0)) {
    return failed('invalidRadius');
  }
  const fresh = freezeState({
    version: 1, worldSeed: world.seed, worldInstanceId: world.worldInstanceId,
    worldFingerprint: worldFingerprint(world), width: WORLD_WIDTH, height: WORLD_HEIGHT,
    cellSize: MAP_CELL_SIZE, revealedCells: [], discoveredLandmarkIds: [],
    discoveredWaypointIds: [], activatedWaypointIds: [], lastObservedPosition: null
  });
  if (startPosition === undefined) return succeeded(fresh);
  return revealAtPosition(fresh, startPosition, startRadius, world);
}

/**
 * Reveals only cell centers inside the observation circle, plus the cell the
 * hero actually occupies. Never reveals cells along a travel/click destination.
 */
export function revealAtPosition(
  state: Readonly<MapDiscoveryState>,
  position: Readonly<Point>,
  radius: number,
  world: Readonly<MapWorldInput>
): MapResult<MapDiscoveryState> {
  const error = validatePair(state, world);
  if (error) return failed(error);
  if (!validPoint(position)) return failed('invalidPosition');
  if (!validRadius(radius)) return failed('invalidRadius');

  const revealed = new Set<FogCellId>(state.revealedCells);
  const minCol = Math.max(0, Math.floor((position.x - radius) / MAP_CELL_SIZE));
  const maxCol = Math.min(MAP_COLUMNS - 1, Math.floor((position.x + radius) / MAP_CELL_SIZE));
  const minRow = Math.max(0, Math.floor((position.y - radius) / MAP_CELL_SIZE));
  const maxRow = Math.min(MAP_ROWS - 1, Math.floor((position.y + radius) / MAP_CELL_SIZE));
  const currentCell = pointCell(position);
  revealed.add(currentCell);
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const centerX = col * MAP_CELL_SIZE + Math.min(MAP_CELL_SIZE, WORLD_WIDTH - col * MAP_CELL_SIZE) / 2;
      const centerY = row * MAP_CELL_SIZE + Math.min(MAP_CELL_SIZE, WORLD_HEIGHT - row * MAP_CELL_SIZE) / 2;
      if (Math.hypot(centerX - position.x, centerY - position.y) <= radius) {
        revealed.add(cellId(col, row));
      }
    }
  }

  const observed = (target: Readonly<Point>): boolean =>
    revealed.has(pointCell(target))
    && Math.hypot(target.x - position.x, target.y - position.y) <= radius;

  const landmarks = new Set(state.discoveredLandmarkIds);
  for (const feature of world.features) {
    if (observed(feature.position)) landmarks.add(feature.id);
  }
  const waypoints = new Set(state.discoveredWaypointIds);
  for (const waypoint of world.waypoints ?? []) {
    if (observed(waypoint.position)) waypoints.add(waypoint.id);
  }
  const unchanged = revealed.size === state.revealedCells.length
    && landmarks.size === state.discoveredLandmarkIds.length
    && waypoints.size === state.discoveredWaypointIds.length
    && state.lastObservedPosition?.x === position.x
    && state.lastObservedPosition?.y === position.y;
  if (unchanged) return succeeded(state);
  return succeeded(freezeState({
    ...state, lastObservedPosition: { x: position.x, y: position.y },
    revealedCells: [...revealed].sort(compareCells),
    discoveredLandmarkIds: [...landmarks].sort(),
    discoveredWaypointIds: [...waypoints].sort()
  }));
}

/**
 * Call only for verified movement samples. Longer jumps (including teleports)
 * are rejected: the integrator should observe their destination separately.
 */
export function revealTravelSegment(
  state: Readonly<MapDiscoveryState>,
  from: Readonly<Point>,
  to: Readonly<Point>,
  radius: number,
  world: Readonly<MapWorldInput>
): MapResult<MapDiscoveryState> {
  const error = validatePair(state, world);
  if (error) return failed(error);
  if (!validPoint(from) || !validPoint(to)) return failed('invalidPosition');
  if (!validRadius(radius)) return failed('invalidRadius');
  if (!state.lastObservedPosition
    || state.lastObservedPosition.x !== from.x || state.lastObservedPosition.y !== from.y
    || Math.hypot(to.x - from.x, to.y - from.y) > MAX_TRAVEL_SEGMENT) {
    return failed('invalidSegment');
  }
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / (MAP_CELL_SIZE / 2)));
  let next = state;
  for (let step = 1; step <= steps; step++) {
    const ratio = step / steps;
    const position = step === steps ? to : {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio
    };
    const updated = revealAtPosition(next, position, radius, world);
    if (!updated.ok) return updated;
    next = updated.value;
  }
  return succeeded(next);
}

/** Only a previously visited waypoint can receive the activated flag. No travel. */
export function activateMapWaypoint(
  state: Readonly<MapDiscoveryState>,
  waypointId: unknown,
  world: Readonly<MapWorldInput>
): MapResult<MapDiscoveryState> {
  const error = validatePair(state, world);
  if (error) return failed(error);
  if (!plainId(waypointId, WAYPOINT_ID, 64)
    || !state.discoveredWaypointIds.includes(waypointId)
    || !(world.waypoints ?? []).some(w => w.id === waypointId)) {
    return failed('unknownWaypoint');
  }
  if (state.activatedWaypointIds.includes(waypointId)) return succeeded(state);
  return succeeded(freezeState({
    ...state, activatedWaypointIds: [...state.activatedWaypointIds, waypointId].sort()
  }));
}

/** Deeply freeze a validated JSON round-trip; never apply it to another world. */
export function restoreMapDiscovery(
  external: unknown,
  world: Readonly<MapWorldInput>
): MapResult<MapDiscoveryState> {
  if (!validWorld(world)) return failed('invalidWorld');
  if (!validateMapDiscovery(external)) return failed('invalidState');
  if (!validateMapDiscovery(external, world)) return failed('worldMismatch');
  return succeeded(freezeState(external));
}

function validViewport(value: unknown): value is MapViewport {
  if (!value || typeof value !== 'object') return false;
  const rect = value as Partial<MapViewport>;
  return [rect.x, rect.y, rect.width, rect.height].every(v =>
    typeof v === 'number' && Number.isFinite(v))
    && rect.x! >= 0 && rect.y! >= 0 && rect.width! > 0 && rect.height! > 0
    && rect.x! + rect.width! <= WORLD_WIDTH
    && rect.y! + rect.height! <= WORLD_HEIGHT;
}

function observedRect(rect: MapViewport, point: Readonly<Point>): boolean {
  return point.x >= rect.x && point.y >= rect.y
    && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}

function validQuestHints(value: unknown): value is readonly MapQuestHint[] {
  if (!Array.isArray(value) || value.length > MAX_QUEST_HINTS) return false;
  const ids = new Set<string>();
  for (const hint of value) {
    if (!hint || !plainId(hint.id, HINT_ID, 64) || ids.has(hint.id)
      || (hint.status !== 'active' && hint.status !== 'complete')
      || (hint.featureId !== undefined && !plainId(hint.featureId, FEATURE_ID, 80))
      || (hint.position !== undefined && !validPoint(hint.position))
      || (hint.presentationKey !== undefined
        && !plainId(hint.presentationKey, TRANSLATION_KEY, 96))) return false;
    ids.add(hint.id);
  }
  return true;
}

function freezeMarker(marker: MapMarker): MapMarker {
  return Object.freeze({
    ...marker,
    position: Object.freeze({ x: marker.position.x, y: marker.position.y })
  });
}

/**
 * One authoritative state for world map and minimap. Revealed cells contain no
 * secret terrain metadata; unknown quest targets appear only as unlocated hints.
 */
export function projectMap(
  state: Readonly<MapDiscoveryState>,
  world: Readonly<MapWorldInput>,
  playerPosition: Readonly<Point>,
  questHints: readonly MapQuestHint[] = [],
  options: Readonly<MapProjectionOptions> = {}
): MapResult<MapProjection> {
  const error = validatePair(state, world);
  if (error) return failed(error);
  if (!validPoint(playerPosition)) return failed('invalidPosition');
  if (!validQuestHints(questHints)) return failed('invalidQuestHints');
  if (!options || typeof options !== 'object') return failed('invalidViewport');
  const mode = options.mode ?? 'world';
  const zoom = options.zoom ?? 1;
  if ((mode !== 'world' && mode !== 'minimap')
    || typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom < 0.5 || zoom > 8
    || (options.center !== undefined && !validPoint(options.center))) {
    return failed('invalidViewport');
  }
  const base: MapViewport = options.viewport ?? (mode === 'minimap'
    ? {
        x: Math.max(0, Math.min(WORLD_WIDTH - MINIMAP_WIDTH, playerPosition.x - MINIMAP_WIDTH/2)),
        y: Math.max(0, Math.min(WORLD_HEIGHT - MINIMAP_HEIGHT, playerPosition.y - MINIMAP_HEIGHT/2)),
        width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT
      }
    : { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT });
  if (!validViewport(base)) return failed('invalidViewport');
  const width = Math.min(WORLD_WIDTH, base.width / zoom);
  const height = Math.min(WORLD_HEIGHT, base.height / zoom);
  const focus = options.center ?? {
    x: base.x + base.width / 2, y: base.y + base.height / 2
  };
  const viewport = Object.freeze({
    x: Math.max(0, Math.min(WORLD_WIDTH - width, focus.x - width / 2)),
    y: Math.max(0, Math.min(WORLD_HEIGHT - height, focus.y - height / 2)),
    width, height
  });

  const knownCells = new Set(state.revealedCells);
  const cells: MapFogCell[] = [];
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLUMNS; col++) {
      const x = col * MAP_CELL_SIZE;
      const y = row * MAP_CELL_SIZE;
      const cellWidth = Math.min(MAP_CELL_SIZE, WORLD_WIDTH - x);
      const cellHeight = Math.min(MAP_CELL_SIZE, WORLD_HEIGHT - y);
      if (x >= viewport.x + width || x + cellWidth <= viewport.x
        || y >= viewport.y + height || y + cellHeight <= viewport.y) continue;
      const id = cellId(col, row);
      cells.push(Object.freeze({
        id, x, y, width: cellWidth, height: cellHeight,
        visibility: knownCells.has(id) ? 'discovered' : 'unexplored'
      }));
    }
  }

  const markers: MapMarker[] = [];
  const append = (marker: MapMarker): void => {
    if (observedRect(viewport, marker.position)) markers.push(freezeMarker(marker));
  };
  append({ id: 'player', kind: 'player', position: playerPosition, presentationKey: 'map.player' });
  // City visibility is independent of its cell's fog and of incidental town services.
  append({ id: 'town.camp', kind: 'town', position: CAMP, presentationKey: 'map.town' });

  const featureById = new Map(world.features.map(feature => [feature.id, feature]));
  for (const feature of world.features) {
    if (!state.discoveredLandmarkIds.includes(feature.id)
      || !knownCells.has(pointCell(feature.position))) continue;
    append({
      id: feature.id,
      kind: feature.kind === 'cryptEntrance' ? 'dungeonEntrance'
        : feature.mandatory ? 'landmark' : 'optionalPoi',
      position: feature.position, presentationKey: feature.presentationKey
    });
  }
  for (const waypoint of world.waypoints ?? []) {
    if (!state.discoveredWaypointIds.includes(waypoint.id)
      || !knownCells.has(pointCell(waypoint.position))) continue;
    append({
      id: waypoint.id, kind: 'waypoint', position: waypoint.position,
      presentationKey: waypoint.presentationKey,
      activated: state.activatedWaypointIds.includes(waypoint.id)
    });
  }

  const hints: MapHiddenQuestHint[] = [];
  let navigationTarget: MapMarker | undefined;
  for (const hint of options.trackedQuestId===null?[]:questHints) {
    const target = hint.featureId !== undefined
      ? (state.discoveredLandmarkIds.includes(hint.featureId)
        ? featureById.get(hint.featureId as WildernessFeature['id'])?.position : undefined)
      : hint.position;
    const isTown = hint.featureId === undefined && target?.x === CAMP.x && target.y === CAMP.y;
    if (target && (isTown || knownCells.has(pointCell(target)))) {
      if (hint.id===options.trackedQuestId && hint.status==='active') navigationTarget=freezeMarker({
        id:'quest/'+hint.id,kind:'quest',position:target,presentationKey:hint.presentationKey??'map.quest',questStatus:hint.status
      });
      // A discovered but off-viewport quest has an unlocated hint for this view.
      if (observedRect(viewport, target)) {
        append({
          id: 'quest/' + hint.id, kind: 'quest', position: target,
          presentationKey: hint.presentationKey ?? 'map.quest',
          questStatus: hint.status
        });
        continue;
      }
    }
    hints.push(Object.freeze({
      id: hint.id, status: hint.status,
      ...(hint.presentationKey === undefined ? {} : { presentationKey: hint.presentationKey })
    }));
  }

  markers.sort((a, b) => a.id.localeCompare(b.id));
  hints.sort((a, b) => a.id.localeCompare(b.id));
  return succeeded(Object.freeze({
    mode, zoom, viewport, cells: Object.freeze(cells),
    markers: Object.freeze(markers), hints: Object.freeze(hints),
    ...(navigationTarget?{navigationTarget}:{})
  }));
}

/** Line clipping never returns coordinates outside a discovered cell.
 * No hidden road geometry is serialized into the UI projection, even if
 * the full terrain generator already knows the undiscovered world.
 */
function clipRoadSegment(a: Readonly<Point>, b: Readonly<Point>,
  rect: Readonly<MapViewport>): { from: Point; to: Point } | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx * dx + dy * dy < 0.01)
    return null;
  let first = 0, last = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [
    a.x - rect.x, rect.x + rect.width - a.x,
    a.y - rect.y, rect.y + rect.height - a.y
  ];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]!) < 1e-9) {
      if (q[i]! < 0) return null;
    } else {
      const ratio = q[i]! / p[i]!;
      if (p[i]! < 0) first = Math.max(first, ratio);
      else last = Math.min(last, ratio);
      if (last <= first + 1e-9) return null;
    }
  }
  const from = { x: a.x + dx * first, y: a.y + dy * first };
  const to = { x: a.x + dx * last, y: a.y + dy * last };
  return { from, to };
}

/** Local terrain visibility is deliberately independent of recorded exploration.
 * Only the minimap may paint the entire local viewport; markers and routes
 * remain governed by discovery. World map geometry stays discovered-only. */
export function mapCellPainted(mode:MapProjection['mode'],cell:MapFogCell):boolean{
  return mode==='minimap'||cell.visibility==='discovered';
}
/** Geometry is clipped to painted cells without changing discovery or save data. */
export function projectVisibleTerrain(
  projection: Readonly<MapProjection>, terrain: Readonly<WildernessTerrainResult>
): MapProjection {
  const visible = projection.cells.filter(cell => mapCellPainted(projection.mode,cell));
  if (!visible.length) return Object.freeze({
    ...projection, roads: Object.freeze([] as MapVisibleRoad[])
  });
  const tiles = new Map(terrain.tiles.map(tile => [tile.x + '/' + tile.y, tile]));
  const cells = projection.cells.map(cell => {
    if (!mapCellPainted(projection.mode,cell)) return cell;
    const tile = tiles.get(cell.x + '/' + cell.y);
    if (!tile || tile.width !== cell.width || tile.height !== cell.height) return cell;
    return Object.freeze({ ...cell, terrainId: tile.terrainId });
  });
  const roads: MapVisibleRoad[] = [];
  for (const road of terrain.roads) {
    if (!Array.isArray(road.points) || road.points.length > 4096
      || !Number.isFinite(road.width) || road.width <= 0) continue;
    for (let i = 1; i < road.points.length; i++) {
      const start = road.points[i - 1]!, end = road.points[i]!;
      for (const cell of visible) {
        if (Math.max(start.x, end.x) < cell.x
          || Math.min(start.x, end.x) > cell.x + cell.width
          || Math.max(start.y, end.y) < cell.y
          || Math.min(start.y, end.y) > cell.y + cell.height) continue;
        const clipped = clipRoadSegment(start, end, cell);
        if (!clipped) continue;
        roads.push(Object.freeze({
          id: road.id + '/' + i + '/' + cell.id,
          cellId: cell.id,
          from: Object.freeze(clipped.from), to: Object.freeze(clipped.to),
          width: road.width
        }));
      }
    }
  }
  return Object.freeze({
    ...projection, cells: Object.freeze(cells), roads: Object.freeze(roads)
  });
}
