/** GPL-3.0-only — Aether & Ruin, Wave G / Prompt 28.
 * Pure, bounded Hollow King phase machine. This is NOT a combat authority.
 * The integrator owns runtime damage, add/hazard actors, quest and loot commits.
 */

export interface HollowKingPoint { readonly x: number; readonly y: number }
export interface HollowKingRect extends HollowKingPoint {
  readonly width: number;
  readonly height: number;
}
export interface HollowKingArena {
  readonly bounds: HollowKingRect;
  readonly bossSpawn: HollowKingPoint;
  /** A guaranteed non-hazard sanctuary used for avoiding arena softlocks. */
  readonly safePoint: HollowKingPoint;
  /** A traversable door approach that must never be covered by planned hazards. */
  readonly escapePoint: HollowKingPoint;
  /** The existing CRYPT_EXIT, possibly outside the boss room; never locked. */
  readonly exitPosition: HollowKingPoint;
  /** Caller-supplied authoritative wall footprints. */
  readonly walls: readonly HollowKingRect[];
}
export type HollowKingPhase = 1 | 2 | 3;
export type HollowKingMode = 'idle' | 'telegraph' | 'execute' | 'recovery' | 'dead';
export type HollowKingAbility =
  | 'royal_cleave' | 'grave_lunge'
  | 'raise_dead' | 'grave_circle'
  | 'rune_storm' | 'kings_judgment';
export type HollowKingShape = 'cone' | 'circle';

export interface HollowKingGeometry {
  readonly shape: HollowKingShape;
  readonly position: HollowKingPoint;
  readonly radius: number;
  /** Radians; for circular warnings this is 0. */
  readonly angleRadians: number;
  readonly arcDegrees: number;
}
export interface HollowKingWarning {
  readonly id: string;
  readonly ability: HollowKingAbility;
  readonly phase: HollowKingPhase;
  readonly geometry: HollowKingGeometry;
  readonly windupSeconds: number;
  readonly remainingSeconds: number;
  readonly opacity: number;
  readonly localizationKey: string;
}
export interface HollowKingHazard {
  readonly id: string;
  readonly position: HollowKingPoint;
  readonly radius: number;
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
  readonly type: 'grave_circle' | 'rune_storm';
}
export interface HollowKingAddRequest {
  readonly id: string;
  readonly enemyType: 'skeleton';
  readonly position: HollowKingPoint;
}
export interface HollowKingState {
  readonly version: 1;
  readonly encounterId: string;
  readonly seed: number;
  readonly actorId: 'crypt_lord-4';
  readonly enemyType: 'crypt_lord';
  readonly arena: HollowKingArena;
  readonly maxHealth: number;
  readonly health: number;
  readonly phase: HollowKingPhase;
  readonly mode: HollowKingMode;
  /** Monotonic optimistic concurrency token, not a wall clock. */
  readonly revision: number;
  readonly rotationIndex: number;
  readonly timerSeconds: number;
  readonly activeAbility: HollowKingAbility | null;
  readonly warning: HollowKingWarning | null;
  readonly hazards: readonly HollowKingHazard[];
  /** Reserved adds until resolvedAddIds are acknowledged by simulation. */
  readonly addRequests: readonly HollowKingAddRequest[];
  readonly introEmitted: boolean;
  readonly deathEmitted: boolean;
}
export interface HollowKingStepInput {
  readonly expectedRevision: number;
  /** Seconds; caller must split large frame deltas into <= 0.25s. */
  readonly deltaSeconds: number;
  /** Authoritative boss HP after combat: 0 .. maxHealth, never a damage command. */
  readonly currentHealth: number;
  readonly target: HollowKingPoint;
  /** Optional actor identity check, for adapters mixing enemy rosters. */
  readonly actorId?: string;
  /** Exact outstanding add request IDs the simulator has retired. */
  readonly resolvedAddIds?: readonly string[];
}
export type HollowKingActionPlan =
  | { readonly type: 'intro'; readonly id: string; readonly nameKey: string }
  | { readonly type: 'phaseChanged'; readonly id: string; readonly from: HollowKingPhase; readonly to: HollowKingPhase; readonly phaseKey: string }
  | { readonly type: 'telegraph'; readonly warning: HollowKingWarning }
  | { readonly type: 'hitWindow'; readonly warningId: string; readonly ability: HollowKingAbility; readonly maxDamage: number; readonly durationSeconds: number; readonly geometry: HollowKingGeometry }
  | { readonly type: 'spawnAdd'; readonly add: HollowKingAddRequest }
  | { readonly type: 'hazardStart'; readonly hazard: HollowKingHazard }
  | { readonly type: 'hazardExpire'; readonly id: string }
  | {
    readonly type: 'death';
    readonly id: string;
    readonly actorId: 'crypt_lord-4';
    readonly enemyType: 'crypt_lord';
    readonly defeatHookId: 'crypt_lord_slain';
    readonly questId: 'crypt_lord_fallen';
    readonly rewardPlanId: string;
  };

export interface HollowKingBossBar {
  readonly actorId: 'crypt_lord-4';
  readonly health: number;
  readonly maxHealth: number;
  readonly hpFraction: number;
  readonly phase: HollowKingPhase;
  readonly stage: 'phase1' | 'phase2' | 'phase3';
  readonly nameKey: 'boss.hollowKing.name';
  readonly phaseKey: string;
  readonly warning: HollowKingWarning | null;
  readonly exitLocked: false;
}
export interface HollowKingStepSuccess {
  readonly ok: true;
  readonly state: HollowKingState;
  readonly actions: readonly HollowKingActionPlan[];
  readonly bossUi: HollowKingBossBar;
}
export interface HollowKingStepFailure {
  readonly ok: false;
  readonly error: string;
}
export type HollowKingStepResult = HollowKingStepSuccess | HollowKingStepFailure;

const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1400;
const ACTOR_RADIUS = 18;
const MAX_ADDS = 3;
const MAX_HAZARDS = 2;
const MAX_WALLS = 64;
const MAX_TICK_SECONDS = 0.25;
const MAX_HEALTH = 100000;
const MAX_REVISION = 10000000;
const MAX_OUTPUTS = 8;
const SEED_MAX = 0xffffffff;

type Writable<T> = { -readonly [K in keyof T]: T[K] };
const ABILITIES: Readonly<Record<HollowKingPhase, readonly HollowKingAbility[]>> = Object.freeze({
  1: Object.freeze(['royal_cleave', 'grave_lunge'] as const),
  2: Object.freeze(['raise_dead', 'grave_circle'] as const),
  3: Object.freeze(['rune_storm', 'kings_judgment'] as const)
});
const ABILITY_SPECS: Readonly<Record<HollowKingAbility, {
  readonly shape: HollowKingShape; readonly radius: number;
  readonly arcDegrees: number; readonly windup: number; readonly damage: number;
}>> = Object.freeze({
  royal_cleave: { shape: 'cone', radius: 108, arcDegrees: 85, windup: 1.2, damage: 18 },
  grave_lunge: { shape: 'cone', radius: 112, arcDegrees: 35, windup: 1.05, damage: 20 },
  raise_dead: { shape: 'circle', radius: 64, arcDegrees: 360, windup: 0.95, damage: 0 },
  grave_circle: { shape: 'circle', radius: 40, arcDegrees: 360, windup: 0.9, damage: 12 },
  rune_storm: { shape: 'circle', radius: 44, arcDegrees: 360, windup: 0.65, damage: 16 },
  kings_judgment: { shape: 'cone', radius: 116, arcDegrees: 42, windup: 0.58, damage: 30 }
});
const MODES: readonly HollowKingMode[] = ['idle', 'telegraph', 'execute', 'recovery', 'dead'];
const PHASES: readonly HollowKingPhase[] = [1, 2, 3];

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function point(value: unknown): value is HollowKingPoint {
  return record(value) && finite(value.x) && finite(value.y);
}
function rect(value: unknown): value is HollowKingRect {
  if (!record(value) || !point(value)) return false;
  const width = (value as Record<string, unknown>)['width'];
  const height = (value as Record<string, unknown>)['height'];
  return finite(width) && finite(height) && width > 0 && height > 0;
}
function withinWorld(p: HollowKingPoint): boolean {
  return p.x >= ACTOR_RADIUS && p.y >= ACTOR_RADIUS
    && p.x <= WORLD_WIDTH - ACTOR_RADIUS && p.y <= WORLD_HEIGHT - ACTOR_RADIUS;
}
function inside(p: HollowKingPoint, bounds: HollowKingRect, margin: number): boolean {
  return p.x - margin >= bounds.x && p.y - margin >= bounds.y
    && p.x + margin <= bounds.x + bounds.width
    && p.y + margin <= bounds.y + bounds.height;
}
function touchesRect(p: HollowKingPoint, r: number, wall: HollowKingRect): boolean {
  const x = Math.max(wall.x, Math.min(p.x, wall.x + wall.width));
  const y = Math.max(wall.y, Math.min(p.y, wall.y + wall.height));
  return Math.hypot(x - p.x, y - p.y) < r;
}
function distance(a: HollowKingPoint, b: HollowKingPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clearFootprint(p: HollowKingPoint, r: number, a: HollowKingArena): boolean {
  return inside(p, a.bounds, r) && a.walls.every(w => !touchesRect(p, r, w));
}
function safePlacement(p: HollowKingPoint, r: number, a: HollowKingArena): boolean {
  return clearFootprint(p, r, a)
    && distance(p, a.safePoint) >= r + 58
    && distance(p, a.escapePoint) >= r + 58;
}
function validArena(arena: unknown): arena is HollowKingArena {
  if (!record(arena) || !rect(arena.bounds)
    || !point(arena.bossSpawn) || !point(arena.safePoint)
    || !point(arena.escapePoint) || !point(arena.exitPosition)
    || !Array.isArray(arena.walls) || arena.walls.length > MAX_WALLS) return false;
  const a = arena as unknown as HollowKingArena;
  if (a.bounds.x < 0 || a.bounds.y < 0
    || a.bounds.width < 250 || a.bounds.height < 250
    || a.bounds.x + a.bounds.width > WORLD_WIDTH
    || a.bounds.y + a.bounds.height > WORLD_HEIGHT
    || !withinWorld(a.exitPosition)
    || a.walls.some(w => !rect(w) || w.x < 0 || w.y < 0
      || w.x + w.width > WORLD_WIDTH || w.y + w.height > WORLD_HEIGHT)
    || !clearFootprint(a.bossSpawn, ACTOR_RADIUS, a)
    || !clearFootprint(a.safePoint, ACTOR_RADIUS, a)
    || !clearFootprint(a.escapePoint, ACTOR_RADIUS, a)
    || distance(a.bossSpawn, a.safePoint) < 110
    || distance(a.bossSpawn, a.escapePoint) < 110
    || distance(a.escapePoint, a.safePoint) < 90) return false;
  return true;
}
function validSeed(seed: unknown): seed is number {
  return Number.isSafeInteger(seed) && (seed as number) >= 0 && (seed as number) <= SEED_MAX;
}
function validEncounter(id: unknown, seed: number): id is string {
  return typeof id === 'string' && id === `crypt/${seed}/hollow-king`;
}
function phaseAt(health: number, maxHealth: number): HollowKingPhase {
  if (health / maxHealth < 0.35) return 3;
  if (health / maxHealth < 0.7) return 2;
  return 1;
}
function phaseKey(phase: HollowKingPhase): string {
  return `boss.hollowKing.phase${phase}`;
}
function activeAbility(value: unknown): value is HollowKingAbility {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ABILITY_SPECS, value);
}
function warningValid(w: unknown, a: HollowKingArena): w is HollowKingWarning {
  if (!record(w) || typeof w.id !== 'string' || w.id.length > 120
    || !activeAbility(w.ability) || !PHASES.includes(w.phase as HollowKingPhase)
    || !record(w.geometry) || !point(w.geometry.position)
    || !finite(w.geometry.radius) || w.geometry.radius <= 0 || w.geometry.radius > 120
    || !finite(w.geometry.angleRadians) || Math.abs(w.geometry.angleRadians) > Math.PI
    || !finite(w.geometry.arcDegrees) || w.geometry.arcDegrees <= 0 || w.geometry.arcDegrees > 360
    || (w.geometry.shape !== 'circle' && w.geometry.shape !== 'cone')
    || !finite(w.windupSeconds) || w.windupSeconds < 0.5 || w.windupSeconds > 2
    || !finite(w.remainingSeconds) || w.remainingSeconds < 0
    || w.remainingSeconds > w.windupSeconds
    || !finite(w.opacity) || w.opacity < 0.4 || w.opacity > 1
    || typeof w.localizationKey !== 'string'
    || w.localizationKey !== `boss.hollowKing.ability.${w.ability}`) return false;
  return safePlacement(w.geometry.position as HollowKingPoint, w.geometry.radius as number, a);
}
function hazardValid(h: unknown, a: HollowKingArena, encounter: string): h is HollowKingHazard {
  return record(h) && typeof h.id === 'string'
    && h.id.startsWith(`${encounter}/hazard/`) && h.id.length <= 140
    && (h.type === 'grave_circle' || h.type === 'rune_storm')
    && point(h.position) && finite(h.radius) && h.radius > 0 && h.radius <= 52
    && finite(h.durationSeconds) && h.durationSeconds > 0 && h.durationSeconds <= 3
    && finite(h.remainingSeconds) && h.remainingSeconds > 0
    && h.remainingSeconds <= h.durationSeconds
    && safePlacement(h.position, h.radius, a);
}
function addValid(add: unknown, a: HollowKingArena, encounter: string): add is HollowKingAddRequest {
  return record(add) && typeof add.id === 'string'
    && add.id.startsWith(`${encounter}/add/`) && add.id.length <= 140
    && add.enemyType === 'skeleton' && point(add.position)
    && safePlacement(add.position, ACTOR_RADIUS, a);
}
function freezeTree<T>(value: T): T {
  if (value && typeof value === 'object') {
    if (!Object.isFrozen(value)) {
      for (const child of Object.values(value)) freezeTree(child);
      Object.freeze(value);
    }
  }
  return value;
}
function copyArena(a: HollowKingArena): HollowKingArena {
  return {
    bounds: { x: a.bounds.x, y: a.bounds.y, width: a.bounds.width, height: a.bounds.height },
    bossSpawn: { ...a.bossSpawn }, safePoint: { ...a.safePoint },
    escapePoint: { ...a.escapePoint }, exitPosition: { ...a.exitPosition },
    walls: a.walls.map(w => ({ x: w.x, y: w.y, width: w.width, height: w.height }))
  };
}
function copyWarning(w: HollowKingWarning | null): HollowKingWarning | null {
  return w ? { ...w, geometry: { ...w.geometry, position: { ...w.geometry.position } } } : null;
}
function copyState(s: HollowKingState): Writable<HollowKingState> {
  return {
    ...s, arena: copyArena(s.arena), warning: copyWarning(s.warning),
    hazards: s.hazards.map(h => ({ ...h, position: { ...h.position } })),
    addRequests: s.addRequests.map(add => ({ ...add, position: { ...add.position } }))
  };
}

/** Pure structural/semantic validation, also suitable for JSON-restored snapshots. */
export function validateHollowKingState(value: unknown): value is HollowKingState {
  if (!record(value) || value.version !== 1 || !validSeed(value.seed)
    || !validEncounter(value.encounterId, value.seed)
    || value.actorId !== 'crypt_lord-4' || value.enemyType !== 'crypt_lord'
    || !validArena(value.arena)
    || !finite(value.maxHealth) || value.maxHealth <= 0 || value.maxHealth > MAX_HEALTH
    || !finite(value.health) || value.health < 0 || value.health > value.maxHealth
    || !PHASES.includes(value.phase as HollowKingPhase)
    || !MODES.includes(value.mode as HollowKingMode)
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
    || (value.revision as number) > MAX_REVISION
    || !Number.isSafeInteger(value.rotationIndex) || (value.rotationIndex as number) < 0
    || (value.rotationIndex as number) > MAX_REVISION
    || !finite(value.timerSeconds) || value.timerSeconds < 0 || value.timerSeconds > 4
    || typeof value.introEmitted !== 'boolean' || typeof value.deathEmitted !== 'boolean'
    || !Array.isArray(value.hazards) || value.hazards.length > MAX_HAZARDS
    || !Array.isArray(value.addRequests) || value.addRequests.length > MAX_ADDS) return false;
  const state = value as unknown as HollowKingState;
  if (state.phase < phaseAt(state.health, state.maxHealth)
    || (state.revision === 0 && (state.phase !== 1 || state.mode !== 'idle'
      || state.introEmitted || state.rotationIndex !== 0))
    || ((state.mode === 'dead') !== (state.health === 0))
    || (state.deathEmitted !== (state.mode === 'dead'))
    || (state.introEmitted && state.revision === 0)
    || (!state.introEmitted && state.revision > 0)
    || (state.mode === 'dead' && (state.timerSeconds !== 0 || state.warning !== null || state.activeAbility !== null))
    || (state.mode === 'idle' && (state.warning !== null || state.activeAbility !== null))
    || (state.mode === 'telegraph' && (state.warning === null
      || !warningValid(state.warning, state.arena)
      || state.warning.ability !== state.activeAbility
      || state.warning.phase !== state.phase
      || state.warning.remainingSeconds !== state.timerSeconds))
    || ((state.mode === 'execute' || state.mode === 'recovery')
      && (state.warning !== null || !activeAbility(state.activeAbility) || state.timerSeconds > 1))
    || (state.mode !== 'telegraph' && state.mode !== 'idle' && state.mode !== 'dead'
      && state.activeAbility === null)
    || state.hazards.some(h => !hazardValid(h, state.arena, state.encounterId))
    || state.addRequests.some(add => !addValid(add, state.arena, state.encounterId))
    || new Set(state.hazards.map(h => h.id)).size !== state.hazards.length
    || new Set(state.addRequests.map(a => a.id)).size !== state.addRequests.length) return false;
  return true;
}

/** Caller supplies the validated boss-room geometry, not raw procedural walls. */
export function createHollowKingState(
  encounterId: string, seed: number, arena: HollowKingArena, maxHealth = 500
): HollowKingState {
  if (!validSeed(seed) || !validEncounter(encounterId, seed)
    || !validArena(arena) || !finite(maxHealth)
    || maxHealth <= 0 || maxHealth > MAX_HEALTH) {
    throw new RangeError('Invalid Hollow King encounter, seed, arena or maximum health');
  }
  const state: HollowKingState = {
    version: 1, encounterId, seed, actorId: 'crypt_lord-4', enemyType: 'crypt_lord',
    arena: copyArena(arena), maxHealth, health: maxHealth, phase: 1,
    mode: 'idle', revision: 0, rotationIndex: 0, timerSeconds: 0,
    activeAbility: null, warning: null, hazards: [], addRequests: [],
    introEmitted: false, deathEmitted: false
  };
  return freezeTree(state);
}

/** The UI is read-only and explicitly never requests an arena or portal lock. */
export function projectHollowKingBossBar(state: HollowKingState): HollowKingBossBar {
  if (!validateHollowKingState(state)) throw new RangeError('Invalid Hollow King state');
  const warning = state.mode === 'telegraph' ? copyWarning(state.warning) : null;
  return freezeTree({
    actorId: state.actorId, health: state.health, maxHealth: state.maxHealth,
    hpFraction: state.health / state.maxHealth, phase: state.phase,
    stage: `phase${state.phase}` as HollowKingBossBar['stage'],
    nameKey: 'boss.hollowKing.name' as const, phaseKey: phaseKey(state.phase),
    warning, exitLocked: false as const
  });
}

/** Predicts one immutable death/reward proposal; step emits it once on alive→dead. */
export function planHollowKingDefeat(
  state: HollowKingState
): Extract<HollowKingActionPlan, { type: 'death' }> | null {
  if (!validateHollowKingState(state) || state.health <= 0 || state.deathEmitted) return null;
  return Object.freeze({
    type: 'death', id: `${state.encounterId}/death`,
    actorId: 'crypt_lord-4', enemyType: 'crypt_lord',
    defeatHookId: 'crypt_lord_slain', questId: 'crypt_lord_fallen',
    rewardPlanId: `${state.encounterId}/boss-guaranteed-loot`
  });
}

function inputError(state: HollowKingState, input: HollowKingStepInput): string | null {
  if (!record(input) || !Number.isSafeInteger(input.expectedRevision)
    || input.expectedRevision !== state.revision) return 'stale_revision';
  if (!finite(input.deltaSeconds) || input.deltaSeconds < 0
    || input.deltaSeconds > MAX_TICK_SECONDS) return 'invalid_delta';
  if (!finite(input.currentHealth) || input.currentHealth < 0
    || input.currentHealth > state.maxHealth || (state.mode === 'dead' && input.currentHealth !== 0)) {
    return 'invalid_health';
  }
  if (!point(input.target) || !clearFootprint(input.target, ACTOR_RADIUS, state.arena)) {
    return 'invalid_target';
  }
  if (input.actorId !== undefined && input.actorId !== state.actorId) return 'wrong_actor';
  if (input.resolvedAddIds !== undefined
    && (!Array.isArray(input.resolvedAddIds) || input.resolvedAddIds.length > MAX_ADDS
      || input.resolvedAddIds.some(id => typeof id !== 'string')
      || new Set(input.resolvedAddIds).size !== input.resolvedAddIds.length
      || input.resolvedAddIds.some(id => !state.addRequests.some(add => add.id === id)))) {
    return 'invalid_add_ack';
  }
  if (state.revision >= MAX_REVISION || state.rotationIndex >= MAX_REVISION) return 'sequence_exhausted';
  return null;
}

function targetedPosition(a: HollowKingArena, target: HollowKingPoint, radius: number): HollowKingPoint | null {
  const boss = a.bossSpawn;
  const options = [
    target,
    { x: boss.x + 92, y: boss.y + 55 },
    { x: boss.x - 92, y: boss.y + 55 },
    { x: boss.x + 92, y: boss.y - 55 },
    { x: boss.x - 92, y: boss.y - 55 },
    boss
  ];
  const match = options.find(p => safePlacement(p, radius, a));
  return match ? { ...match } : null;
}
function geometryFor(
  ability: HollowKingAbility, a: HollowKingArena, target: HollowKingPoint
): HollowKingGeometry | null {
  const spec = ABILITY_SPECS[ability];
  const boss = a.bossSpawn;
  const center = spec.shape === 'cone' || ability === 'raise_dead'
    ? (safePlacement(boss, spec.radius, a) ? { ...boss } : null)
    : targetedPosition(a, target, spec.radius);
  if (!center) return null;
  const angle = spec.shape === 'cone'
    ? Math.atan2(target.y - boss.y, target.x - boss.x) : 0;
  return {
    shape: spec.shape, position: center, radius: spec.radius,
    angleRadians: angle, arcDegrees: spec.arcDegrees
  };
}
function addCandidate(state: HollowKingState): HollowKingPoint | null {
  const boss = state.arena.bossSpawn;
  const positions = [
    { x: boss.x - 110, y: boss.y - 80 },
    { x: boss.x + 110, y: boss.y - 80 },
    { x: boss.x - 105, y: boss.y + 84 },
    { x: boss.x + 105, y: boss.y + 84 }
  ];
  return positions.find(p => safePlacement(p, ACTOR_RADIUS, state.arena)
    && state.addRequests.every(add => distance(add.position, p) >= 36)) ?? null;
}
function cooldown(phase: HollowKingPhase): number {
  return phase === 1 ? 0.8 : phase === 2 ? 0.6 : 0.38;
}
function recovery(phase: HollowKingPhase): number {
  return phase === 1 ? 0.7 : phase === 2 ? 0.52 : 0.36;
}

/**
 * Max one mode transition per tick, at most two hazard expiries and one
 * boss attack. In particular, a long animation frame never skips a windup.
 */
export function stepHollowKing(
  state: HollowKingState, input: HollowKingStepInput
): HollowKingStepResult {
  if (!validateHollowKingState(state)) return { ok: false, error: 'invalid_state' };
  const error = inputError(state, input);
  if (error) return { ok: false, error };
  if (state.mode === 'dead') {
    const dead = freezeTree(copyState(state));
    return freezeTree({
      ok: true as const, state: dead, actions: [] as HollowKingActionPlan[],
      bossUi: projectHollowKingBossBar(dead)
    });
  }
  const next = copyState(state);
  const actions: HollowKingActionPlan[] = [];
  next.revision += 1;
  next.health = input.currentHealth;

  // Existing hazards expire by their own bounded timer, even between attacks.
  const live: HollowKingHazard[] = [];
  for (const hazard of next.hazards) {
    const time = Math.max(0, hazard.remainingSeconds - input.deltaSeconds);
    if (time <= 0) actions.push({ type: 'hazardExpire', id: hazard.id });
    else live.push({ ...hazard, remainingSeconds: time });
  }
  next.hazards = live;
  if (input.resolvedAddIds?.length) {
    const resolved = new Set(input.resolvedAddIds);
    next.addRequests = next.addRequests.filter(a => !resolved.has(a.id));
  }

  const requiredPhase = phaseAt(next.health, next.maxHealth);
  if (requiredPhase > next.phase) {
    const from = next.phase;
    next.phase = requiredPhase;
    actions.push({
      type: 'phaseChanged',
      id: `${next.encounterId}/phase/${requiredPhase}`,
      from, to: requiredPhase, phaseKey: phaseKey(requiredPhase)
    });
    // Cancel the former phase's pending attack; no surprise impact on transition.
    next.mode = 'idle';
    next.timerSeconds = 0;
    next.activeAbility = null;
    next.warning = null;
    next.rotationIndex = 0;
  }
  if (next.health === 0) {
    const death = planHollowKingDefeat(state);
    if (death) actions.push(death);
    for (const hazard of next.hazards) actions.push({ type: 'hazardExpire', id: hazard.id });
    next.mode = 'dead';
    next.timerSeconds = 0;
    next.activeAbility = null;
    next.warning = null;
    next.hazards = [];
    next.addRequests = [];
    next.deathEmitted = true;
    next.introEmitted = true;
  } else {
    if (!next.introEmitted) {
      actions.push({
        type: 'intro', id: `${next.encounterId}/intro`,
        nameKey: 'boss.hollowKing.name'
      });
      next.introEmitted = true;
    }
    if (next.mode === 'idle') {
      next.timerSeconds = Math.max(0, next.timerSeconds - input.deltaSeconds);
      if (next.timerSeconds <= 0) {
        const rotation = ABILITIES[next.phase];
        const ability = rotation[(next.rotationIndex + (next.seed & 1)) % rotation.length]!;
        const geometry = geometryFor(ability, next.arena, input.target);
        if (geometry) {
          const spec = ABILITY_SPECS[ability];
          next.rotationIndex += 1;
          next.activeAbility = ability;
          next.mode = 'telegraph';
          next.timerSeconds = spec.windup;
          const warning: HollowKingWarning = {
            id: `${next.encounterId}/warning/${next.rotationIndex}`,
            ability, phase: next.phase, geometry, windupSeconds: spec.windup,
            remainingSeconds: spec.windup, opacity: 0.65,
            localizationKey: `boss.hollowKing.ability.${ability}`
          };
          next.warning = warning;
          actions.push({ type: 'telegraph', warning });
        } else {
          // Bounded fail-safe retry; do not spawn an invalid attack footprint.
          next.timerSeconds = 0.25;
        }
      }
    } else if (next.mode === 'telegraph') {
      next.timerSeconds = Math.max(0, next.timerSeconds - input.deltaSeconds);
      if (next.timerSeconds > 0) {
        next.warning = { ...next.warning!, remainingSeconds: next.timerSeconds };
      } else {
        const ability = next.activeAbility!;
        const warning = next.warning!;
        const spec = ABILITY_SPECS[ability];
        if (spec.damage > 0) {
          actions.push({
            type: 'hitWindow', warningId: warning.id, ability,
            maxDamage: spec.damage, durationSeconds: 0.16, geometry: warning.geometry
          });
        }
        if (ability === 'raise_dead' && next.addRequests.length < MAX_ADDS) {
          const position = addCandidate(next);
          if (position) {
            const add: HollowKingAddRequest = {
              id: `${next.encounterId}/add/${next.rotationIndex}`,
              enemyType: 'skeleton', position: { ...position }
            };
            next.addRequests = [...next.addRequests, add];
            actions.push({ type: 'spawnAdd', add });
          }
        }
        if ((ability === 'grave_circle' || ability === 'rune_storm')
          && next.hazards.length < MAX_HAZARDS) {
          const radius = ability === 'rune_storm' ? 40 : 36;
          const center = targetedPosition(next.arena, warning.geometry.position, radius);
          if (center) {
            const duration = ability === 'rune_storm' ? 1.8 : 1.6;
            const hazard: HollowKingHazard = {
              id: `${next.encounterId}/hazard/${next.rotationIndex}`,
              type: ability, position: center, radius, durationSeconds: duration,
              remainingSeconds: duration
            };
            next.hazards = [...next.hazards, hazard];
            actions.push({ type: 'hazardStart', hazard });
          }
        }
        next.warning = null;
        next.mode = 'execute';
        next.timerSeconds = 0.16;
      }
    } else if (next.mode === 'execute') {
      next.timerSeconds = Math.max(0, next.timerSeconds - input.deltaSeconds);
      if (next.timerSeconds <= 0) {
        next.mode = 'recovery';
        next.timerSeconds = recovery(next.phase);
      }
    } else if (next.mode === 'recovery') {
      next.timerSeconds = Math.max(0, next.timerSeconds - input.deltaSeconds);
      if (next.timerSeconds <= 0) {
        next.mode = 'idle';
        next.activeAbility = null;
        next.timerSeconds = cooldown(next.phase);
      }
    }
  }

  if (actions.length > MAX_OUTPUTS) return { ok: false, error: 'output_budget' };
  const finalState = freezeTree(next);
  if (!validateHollowKingState(finalState)) return { ok: false, error: 'invalid_transition' };
  return freezeTree({
    ok: true as const,
    state: finalState,
    actions: freezeTree(actions),
    bossUi: projectHollowKingBossBar(finalState)
  });
}
