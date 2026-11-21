/**
 * Prompt 40 / Agent 35 — deterministic Mage combat geometry and effect pulses.
 * Pure planners only. GameSimulation remains the only authority for damage,
 * statuses, cooldowns, Mana, enemy death and session state. GPL-3.0-only.
 */
import { ACTOR_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, canOccupy, hasLineOfSight,
  type Obstacle } from '../world/navigation';

export interface MagePoint { readonly x: number; readonly y: number }
export interface MageTarget extends MagePoint {
  readonly id: string;
  readonly alive: boolean;
}
export interface MageChainHit {
  readonly id: string;
  /** Multiply canonical resolveTypedDamage; never roll damage in the planner. */
  readonly multiplier: number;
}
export interface MageChainOptions {
  readonly maxHits: number;
  readonly hopRange: number;
  readonly maxRange: number;
  readonly obstacles: readonly Obstacle[];
}

export interface MageTimedZone {
  readonly id: string;
  readonly ownerId: string;
  readonly position: MagePoint;
  readonly radius: number;
  readonly element: 'frost' | 'fire';
  readonly remaining: number;
  readonly tickSeconds: number;
  readonly nextPulseIn: number;
}
export type MageZoneStep = {
  readonly zone: MageTimedZone | null;
  readonly done: boolean;
  /** One stable target-ID list per elapsed pulse, in chronological order. */
  readonly pulses: readonly (readonly string[])[];
};

function point(p: unknown): p is MagePoint {
  return !!p && typeof p === 'object' && !Array.isArray(p)
    && typeof (p as MagePoint).x === 'number'
    && typeof (p as MagePoint).y === 'number'
    && Number.isFinite((p as MagePoint).x) && Number.isFinite((p as MagePoint).y);
}
function worldPoint(p: unknown): p is MagePoint {
  return point(p) && p.x >= 0 && p.y >= 0 && p.x <= WORLD_WIDTH && p.y <= WORLD_HEIGHT;
}
function identifier(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128
    && id !== '__proto__' && id !== 'constructor' && id !== 'prototype'
    && /^[a-zA-Z0-9_.:-]+$/.test(id);
}
function distance(a: MagePoint, b: MagePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function validObstacles(obstacles: unknown): obstacles is readonly Obstacle[] {
  if (!Array.isArray(obstacles) || obstacles.length > 512) return false;
  const seen = new Set<string>();
  for (const o of obstacles as Obstacle[]) {
    if (!o || !identifier(o.id) || seen.has(o.id)
      || !Number.isFinite(o.x) || !Number.isFinite(o.y)
      || !Number.isFinite(o.width) || !Number.isFinite(o.height)
      || o.width <= 0 || o.height <= 0
      || o.x < 0 || o.y < 0 || o.x + o.width > WORLD_WIDTH
      || o.y + o.height > WORLD_HEIGHT) return false;
    seen.add(o.id);
  }
  return true;
}
function validTargets(targets: unknown): targets is readonly MageTarget[] {
  if (!Array.isArray(targets) || targets.length > 256) return false;
  const ids = new Set<string>();
  for (const t of targets as MageTarget[]) {
    if (!t || !identifier(t.id) || !worldPoint(t)
      || typeof t.alive !== 'boolean' || ids.has(t.id)) return false;
    ids.add(t.id);
  }
  return true;
}
function byDistanceThenId(anchor: MagePoint, a: MageTarget, b: MageTarget): number {
  return distance(anchor, a) - distance(anchor, b)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Choose an initial explicit target, then the nearest unhit living neighbor.
 * Reject all malformed sets rather than partially allocating damage.
 * Stable across enemy insertion order and replay, with no RNG.
 */
export function planMageChain(
  origin: unknown, initialId: unknown, targets: unknown, options: unknown
): readonly MageChainHit[] {
  if (!worldPoint(origin) || !identifier(initialId) || !validTargets(targets)
    || !options || typeof options !== 'object') return [];
  const opt = options as Partial<MageChainOptions>;
  if (!Number.isSafeInteger(opt.maxHits) || opt.maxHits! < 1 || opt.maxHits! > 8
    || typeof opt.hopRange !== 'number' || !Number.isFinite(opt.hopRange)
    || opt.hopRange <= 0 || opt.hopRange > 650
    || typeof opt.maxRange !== 'number' || !Number.isFinite(opt.maxRange)
    || opt.maxRange <= 0 || opt.maxRange > 750
    || !validObstacles(opt.obstacles)) return [];
  const safe = opt as MageChainOptions;
  const first = targets.find(t => t.id === initialId && t.alive);
  if (!first || distance(origin, first) > safe.maxRange
    || !hasLineOfSight(origin, first, safe.obstacles)) return [];
  const hits: MageChainHit[] = [];
  const used = new Set<string>();
  let current: MageTarget | undefined = first;
  while (current && hits.length < safe.maxHits) {
    hits.push({ id: current.id, multiplier: Number(Math.max(0.1, 1 - hits.length * 0.18).toFixed(2)) });
    used.add(current.id);
    const anchor: MageTarget = current;
    current = targets.filter(t => t.alive && !used.has(t.id)
        && distance(anchor, t) <= safe.hopRange
        && hasLineOfSight(anchor, t, safe.obstacles))
      .sort((a, b) => byDistanceThenId(anchor, a, b))[0];
  }
  return hits;
}

/** Deterministic cover-aware enemy IDs inside a circular blast. */
export function planMageArea(
  center: unknown, radius: unknown, targets: unknown, obstacles: unknown
): readonly string[] {
  if (!worldPoint(center) || typeof radius !== 'number' || !Number.isFinite(radius)
    || radius < 0 || radius > 650 || !validTargets(targets) || !validObstacles(obstacles))
    return [];
  return targets.filter(t => t.alive && distance(center, t) <= radius
      && hasLineOfSight(center, t, obstacles))
    .map(t => t.id)
    .sort();
}

/**
 * Teleport directly to the clicked destination, never through blocked tiles.
 * The full actor-radius swept segment prevents skipping dungeon doors/walls.
 * The final GameSimulation command must revalidate with its live world.
 */
export function planMageTeleport(
  origin: unknown, destination: unknown, maxRange: unknown,
  obstacles: unknown, radius = ACTOR_RADIUS
): MagePoint | null {
  if (!worldPoint(origin) || !worldPoint(destination)
    || typeof maxRange !== 'number' || !Number.isFinite(maxRange)
    || maxRange <= 0 || maxRange > 1500
    || !Number.isFinite(radius) || radius < 1 || radius > 100
    || !validObstacles(obstacles)) return null;
  const travel = distance(origin, destination);
  if (travel > maxRange || !canOccupy(origin, radius, obstacles)
    || !canOccupy(destination, radius, obstacles)) return null;
  const steps = Math.max(1, Math.ceil(travel / Math.max(3, radius / 2)));
  for (let i = 1; i <= steps; i++) {
    const part = i / steps;
    if (!canOccupy({
      x: origin.x + (destination.x - origin.x) * part,
      y: origin.y + (destination.y - origin.y) * part
    }, radius, obstacles)) return null;
  }
  return { x: destination.x, y: destination.y };
}

/** A queued world-space area pulse. Not persisted in character save records. */
export function createMageZone(
  id: unknown, ownerId: unknown, position: unknown, radius: unknown,
  duration: unknown, tickSeconds: unknown, element: unknown
): MageTimedZone | null {
  if (!identifier(id) || !identifier(ownerId) || !worldPoint(position)
    || typeof radius !== 'number' || !Number.isFinite(radius)
    || radius <= 0 || radius > 650
    || typeof duration !== 'number' || !Number.isFinite(duration)
    || duration <= 0 || duration > 30
    || typeof tickSeconds !== 'number' || !Number.isFinite(tickSeconds)
    || tickSeconds < 0.05 || tickSeconds > 5 || duration < tickSeconds
    || (element !== 'frost' && element !== 'fire')) return null;
  return {
    id, ownerId, position: { ...position }, radius, element,
    remaining: duration, tickSeconds, nextPulseIn: tickSeconds
  };
}

export function validMageZone(value: unknown): value is MageTimedZone {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<MageTimedZone>;
  return identifier(v.id) && identifier(v.ownerId) && worldPoint(v.position)
    && (v.element === 'fire' || v.element === 'frost')
    && typeof v.radius === 'number' && Number.isFinite(v.radius) && v.radius > 0 && v.radius <= 650
    && typeof v.remaining === 'number' && Number.isFinite(v.remaining) && v.remaining > 0 && v.remaining <= 30
    && typeof v.tickSeconds === 'number' && Number.isFinite(v.tickSeconds)
    && v.tickSeconds >= 0.05 && v.tickSeconds <= 5
    && typeof v.nextPulseIn === 'number' && Number.isFinite(v.nextPulseIn)
    && v.nextPulseIn > 0 && v.nextPulseIn <= v.tickSeconds + 0.000001;
}

/**
 * Fixed-duration zone pulses. Caller applies each pulse through the canonical
 * damage/status pipeline, and must not save zones in character-only v11 data.
 */
export function stepMageZone(
  state: unknown, dt: unknown, targets: unknown, obstacles: unknown
): MageZoneStep | null {
  if (!validMageZone(state) || typeof dt !== 'number' || !Number.isFinite(dt)
    || dt <= 0 || dt > 1 || !validTargets(targets) || !validObstacles(obstacles))
    return null;
  const elapsed = Math.min(dt, state.remaining);
  let timeToNext = state.nextPulseIn;
  const pulses: string[][] = [];
  let available = elapsed;
  for (let i = 0; i < 20 && available + 1e-8 >= timeToNext; i++) {
    available -= timeToNext;
    pulses.push([...planMageArea(state.position, state.radius, targets, obstacles)]);
    timeToNext = state.tickSeconds;
  }
  const nextPulseIn = Math.max(0.000001, timeToNext - Math.max(0, available));
  const remaining = Math.max(0, state.remaining - elapsed);
  if (remaining <= 1e-8) return { zone: null, done: true, pulses };
  return {
    done: false, pulses,
    zone: { ...state, remaining, nextPulseIn }
  };
}

/** Snapshot-independent non-healing barrier strength, always bounded. */
export function planMageBarrier(
  maxHealth: unknown, willpower: unknown, shieldRatio: unknown
): number | null {
  if (typeof maxHealth !== 'number' || !Number.isFinite(maxHealth)
    || maxHealth <= 0 || maxHealth > 100000
    || typeof willpower !== 'number' || !Number.isFinite(willpower)
    || willpower < 0 || willpower > 1000
    || typeof shieldRatio !== 'number' || !Number.isFinite(shieldRatio)
    || shieldRatio < 0 || shieldRatio > 1) return null;
  return Math.min(100000, Math.round(maxHealth * (shieldRatio || 0.25)) + Math.round(willpower));
}
