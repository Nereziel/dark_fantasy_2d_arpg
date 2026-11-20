/**
 * Wave G / Prompt 27 — pure, deterministic mini-boss rules.
 * GPL-3.0-only. This planner never applies damage, spawns actors, pays rewards,
 * changes quest state or modifies collision/arena geometry.
 */
import type { EnemyType } from './enemies';

export const MINI_BOSS_IDS = Object.freeze([
  'bandit_captain', 'morrow_gravebound', 'brood_mother', 'corrupted_knight'
] as const);
export type MiniBossId = (typeof MINI_BOSS_IDS)[number];
export type MiniBossFamily = 'bandit' | 'undead' | 'beast' | 'corrupted';
export type MiniBossEffect = 'damage' | 'support' | 'hazard' | 'control' | 'summon' | 'charge';
export type MiniBossShape = 'cone' | 'circle' | 'line';
export type MiniBossStage = 'intro' | 'ready' | 'windup' | 'recovery' | 'dead';
export type MiniBossPhase = 1 | 2;

export const MAX_MINI_BOSS_DELTA = 1;
export const MAX_MINI_BOSS_ACTIONS = 3;
export const MAX_MINI_BOSS_SUMMONS = 2;
const MAX_TIMER = 10;
const MAX_HEALTH = 100_000;
const INTRO_SECONDS = 0.65;
const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1400;
const ACTOR_RADIUS = 18;
const IDENTIFIER = /^[a-z][a-z0-9_-]{0,63}$/;
const MAX_PROCESSED_OCCURRENCES = 256;

export interface MiniBossPoint {
  readonly x: number;
  readonly y: number;
}
export interface MiniBossAbility {
  readonly id: string;
  readonly effect: MiniBossEffect;
  readonly shape: MiniBossShape;
  readonly range: number;
  readonly radius: number;
  readonly windupSeconds: number;
  readonly recoverySeconds: number;
  readonly cooldownSeconds: number;
  readonly telegraphHookId: string;
  readonly impactHookId: string;
}
export interface MiniBossDefinition {
  readonly id: MiniBossId;
  readonly displayNameKey: string;
  readonly family: MiniBossFamily;
  /** Existing EnemyType only. Integrator maps unique boss actor IDs. */
  readonly enemyType: EnemyType;
  readonly baseHealth: number;
  readonly healthMultiplier: number;
  readonly phaseThreshold: number;
  readonly abilities: readonly [MiniBossAbility, MiniBossAbility];
  readonly maxSummonRequests: number;
  readonly introHookId: string;
  readonly arenaHookId: string;
  readonly phaseHookId: string;
  readonly deathHookId: string;
  readonly questId: string | null;
  readonly questEventId: string;
  readonly worldMarkerId: string | null;
}

function ability(id: string, effect: MiniBossEffect, shape: MiniBossShape,
  range: number, radius: number, windupSeconds: number, recoverySeconds: number,
  cooldownSeconds: number): MiniBossAbility {
  return Object.freeze({
    id, effect, shape, range, radius, windupSeconds, recoverySeconds, cooldownSeconds,
    telegraphHookId: `miniboss.${id}.telegraph`,
    impactHookId: `miniboss.${id}.impact`
  });
}
function definition(id: MiniBossId, family: MiniBossFamily, enemyType: EnemyType,
  baseHealth: number, healthMultiplier: number, phaseThreshold: number,
  abilities: readonly [MiniBossAbility, MiniBossAbility], maxSummonRequests = 0,
  questId: string | null = null, questEventId = `${id}_slain`,
  worldMarkerId: string | null = null): MiniBossDefinition {
  return Object.freeze({
    id, displayNameKey: `enemy.miniboss.${id}.name`, family, enemyType,
    baseHealth, healthMultiplier, phaseThreshold,
    abilities: Object.freeze(abilities), maxSummonRequests,
    introHookId: `miniboss.${id}.intro`,
    arenaHookId: `miniboss.${id}.arena`,
    phaseHookId: `miniboss.${id}.phase2`,
    deathHookId: `miniboss.${id}.death`,
    questId, questEventId, worldMarkerId
  });
}

/** Distinct enemy archetypes and mechanics; these do not register new EnemyType. */
export const MINI_BOSS_DEFINITIONS: Readonly<Record<MiniBossId, MiniBossDefinition>> = Object.freeze({
  bandit_captain: definition('bandit_captain', 'bandit', 'banditFighter', 330, 3, 0.5, [
    ability('captain_banner', 'support', 'circle', 280, 105, 0.85, 0.5, 4.6),
    ability('captain_cleave', 'damage', 'cone', 130, 95, 0.75, 0.7, 2.7)
  ]),
  morrow_gravebound: definition('morrow_gravebound', 'undead', 'wraith', 270, 3.75, 0.45, [
    ability('morrow_grasp', 'control', 'line', 240, 43, 0.85, 0.5, 3.2),
    ability('morrow_mist', 'hazard', 'circle', 220, 110, 1.1, 0.65, 4.2)
  ], 0, 'morrow_gravebound', 'morrow_gravebound_slain', 'act1.grave_warden'),
  brood_mother: definition('brood_mother', 'beast', 'spider', 350, 3, 0.5, [
    ability('brood_web', 'control', 'circle', 220, 82, 0.72, 0.4, 2.8),
    ability('brood_call', 'summon', 'circle', 180, 65, 1.05, 0.65, 3.8)
  ], MAX_MINI_BOSS_SUMMONS),
  corrupted_knight: definition('corrupted_knight', 'corrupted', 'skeleton', 390, 3.9, 0.4, [
    ability('knight_charge', 'charge', 'line', 280, 55, 0.85, 0.8, 3.6),
    ability('knight_pulse', 'damage', 'circle', 180, 110, 1.0, 0.55, 3.1)
  ])
});

export interface MiniBossState {
  readonly bossId: MiniBossId;
  /** Stable occurrence ID supplied by integrator; no random IDs are generated. */
  readonly occurrenceId: string;
  readonly stage: MiniBossStage;
  readonly phase: MiniBossPhase;
  readonly remainingSeconds: number;
  readonly introPlayed: boolean;
  readonly rotationCursor: 0 | 1;
  readonly activeAbilityId: string | null;
  /** Locked telegraph point: strikes never silently track a moving player. */
  readonly lockedPoint: MiniBossPoint | null;
  readonly cooldowns: Readonly<Record<string, number>>;
  readonly summonsRequested: number;
  /** Set once a guaranteed reward proposal has been consumed. */
  readonly deathPlanned: boolean;
}
export interface MiniBossTarget extends MiniBossPoint {
  readonly id: string;
  readonly alive: boolean;
}
export interface MiniBossArena {
  readonly center: MiniBossPoint;
  /** Presentation / leash suggestion; never constructs an impassable wall. */
  readonly radius: number;
}
export interface MiniBossStepInput {
  readonly deltaSeconds: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly alive: boolean;
  readonly position: MiniBossPoint;
  readonly target: MiniBossTarget | null;
  readonly arena: MiniBossArena;
}

export type MiniBossActionPlan =
  | { readonly kind: 'intro'; readonly bossId: MiniBossId; readonly hookId: string;
      readonly arenaHookId: string; readonly nameKey: string }
  | { readonly kind: 'phase'; readonly bossId: MiniBossId; readonly phase: 2;
      readonly hookId: string }
  | { readonly kind: 'telegraph' | 'impact'; readonly bossId: MiniBossId;
      readonly abilityId: string; readonly effect: MiniBossEffect;
      readonly point: MiniBossPoint; readonly shape: MiniBossShape;
      readonly range: number; readonly radius: number;
      readonly durationSeconds: number; readonly hookId: string }
  | { readonly kind: 'summon'; readonly bossId: MiniBossId;
      readonly abilityId: string; readonly enemyType: 'spider';
      readonly count: 1; readonly point: MiniBossPoint }
  | { readonly kind: 'hazard' | 'support'; readonly bossId: MiniBossId;
      readonly abilityId: string; readonly point: MiniBossPoint;
      readonly radius: number; readonly hookId: string }
  | { readonly kind: 'move'; readonly bossId: MiniBossId;
      readonly mode: 'approach' | 'return'; readonly point: MiniBossPoint }
  | { readonly kind: 'death'; readonly bossId: MiniBossId; readonly hookId: string };

export interface MiniBossStepResult {
  readonly state: MiniBossState;
  readonly actions: readonly MiniBossActionPlan[];
}
export interface MiniBossDefeatContext {
  /** Authoritative ledger; never evict IDs without an integrator migration. */
  readonly processedOccurrenceIds: readonly string[];
}
export interface MiniBossRewardProposal {
  readonly bossId: MiniBossId;
  readonly occurrenceId: string;
  readonly defeatEventId: string;
  readonly rewardProposalId: string;
  readonly questId: string | null;
  readonly worldMarkerId: string | null;
  readonly enemyType: EnemyType;
  /** Reuse bossGuaranteedLoot(context) exactly once; no item/gold/XP here. */
  readonly lootTableId: 'boss';
  readonly minimumRarity: 'EPIC';
  readonly guaranteed: true;
}
export interface MiniBossDefeatResult {
  readonly state: MiniBossState;
  readonly proposal: MiniBossRewardProposal | null;
}

const own = (x: object, k: string): boolean => Object.prototype.hasOwnProperty.call(x, k);
const validId = (x: unknown): x is string => typeof x === 'string' && IDENTIFIER.test(x);
const finite = (x: unknown, lo: number, hi: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const plainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const hasKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(o).length === keys.length && Object.getOwnPropertySymbols(o).length === 0
  && keys.every(k => own(o, k));
function point(p: unknown): p is MiniBossPoint {
  return plainRecord(p) && hasKeys(p, ['x', 'y'])
    && finite(p.x, 0, WORLD_WIDTH) && finite(p.y, 0, WORLD_HEIGHT);
}
function distance(a: MiniBossPoint, b: MiniBossPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function copyPoint(p: MiniBossPoint): MiniBossPoint {
  return Object.freeze({ x: p.x, y: p.y });
}
function ownState(s: MiniBossState): MiniBossState {
  return Object.freeze({
    ...s, lockedPoint: s.lockedPoint === null ? null : copyPoint(s.lockedPoint),
    cooldowns: Object.freeze({ ...s.cooldowns })
  });
}
function result(state: MiniBossState, actions: MiniBossActionPlan[]): MiniBossStepResult {
  const immutable = actions.map(action => {
    if ('point' in action) return Object.freeze({ ...action, point: copyPoint(action.point) });
    return Object.freeze({ ...action });
  });
  return Object.freeze({ state: ownState(state), actions: Object.freeze(immutable) });
}
export function getMiniBossDefinition(id: unknown): MiniBossDefinition | null {
  return typeof id === 'string' && own(MINI_BOSS_DEFINITIONS, id)
    ? MINI_BOSS_DEFINITIONS[id as MiniBossId]
    : null;
}

export function createMiniBossState(id: MiniBossId, occurrenceId: string): MiniBossState | null {
  const def = getMiniBossDefinition(id);
  if (!def || !validId(occurrenceId)
    || (id === 'morrow_gravebound' && occurrenceId !== 'morrow_gravebound')) return null;
  return ownState({
    bossId: def.id, occurrenceId, stage: 'intro', phase: 1,
    remainingSeconds: INTRO_SECONDS, introPlayed: false,
    rotationCursor: 0, activeAbilityId: null, lockedPoint: null,
    cooldowns: { [def.abilities[0].id]: 0, [def.abilities[1].id]: 0 },
    summonsRequested: 0, deathPlanned: false
  });
}

/** Strict, JSON-safe canonical state: no unknown fields, forged ability, or unbounded timer. */
export function validateMiniBossState(value: unknown): value is MiniBossState {
  if (!plainRecord(value) || !hasKeys(value, [
    'bossId', 'occurrenceId', 'stage', 'phase', 'remainingSeconds', 'introPlayed',
    'rotationCursor', 'activeAbilityId', 'lockedPoint', 'cooldowns',
    'summonsRequested', 'deathPlanned'
  ])) return false;
  const def = getMiniBossDefinition(value.bossId);
  if (!def || !validId(value.occurrenceId)
    || (def.id === 'morrow_gravebound' && value.occurrenceId !== 'morrow_gravebound')
    || (value.phase !== 1 && value.phase !== 2)
    || !['intro', 'ready', 'windup', 'recovery', 'dead'].includes(String(value.stage))
    || !finite(value.remainingSeconds, 0, MAX_TIMER)
    || (value.rotationCursor !== 0 && value.rotationCursor !== 1)
    || typeof value.introPlayed !== 'boolean'
    || typeof value.deathPlanned !== 'boolean'
    || !Number.isSafeInteger(value.summonsRequested)
    || (value.summonsRequested as number) < 0
    || (value.summonsRequested as number) > def.maxSummonRequests
    || !plainRecord(value.cooldowns)
    || !hasKeys(value.cooldowns, def.abilities.map(a => a.id))
    || def.abilities.some(a => !finite(value.cooldowns[a.id], 0, MAX_TIMER))) return false;

  if (value.stage === 'intro') {
    return value.activeAbilityId === null && value.lockedPoint === null
      && (value.remainingSeconds as number) <= INTRO_SECONDS && value.deathPlanned === false;
  }
  if (value.introPlayed !== true) return false;
  if (value.stage === 'windup') {
    const a = def.abilities.find(ability => ability.id === value.activeAbilityId);
    return !!a && point(value.lockedPoint) && (value.remainingSeconds as number) > 0
      && (value.remainingSeconds as number) <= a.windupSeconds && value.deathPlanned === false;
  }
  if (value.activeAbilityId !== null || value.lockedPoint !== null) return false;
  if (value.stage === 'recovery') {
    return (value.remainingSeconds as number) > 0
      && (value.remainingSeconds as number) <= Math.max(...def.abilities.map(a => a.recoverySeconds))
      && value.deathPlanned === false;
  }
  return value.remainingSeconds === 0
    && (value.stage !== 'ready' || value.deathPlanned === false);
}

function validInput(value: unknown): value is MiniBossStepInput {
  if (!plainRecord(value) || !hasKeys(value, [
    'deltaSeconds', 'health', 'maxHealth', 'alive', 'position', 'target', 'arena'
  ])) return false;
  if (!finite(value.deltaSeconds, 0, MAX_MINI_BOSS_DELTA)
    || !finite(value.maxHealth, 1, MAX_HEALTH)
    || !finite(value.health, 0, value.maxHealth)
    || typeof value.alive !== 'boolean' || value.alive !== (value.health > 0)
    || !point(value.position)
    || (value.position.x as number) < ACTOR_RADIUS
    || (value.position.x as number) > WORLD_WIDTH - ACTOR_RADIUS
    || (value.position.y as number) < ACTOR_RADIUS
    || (value.position.y as number) > WORLD_HEIGHT - ACTOR_RADIUS
    || !plainRecord(value.arena) || !hasKeys(value.arena, ['center', 'radius'])
    || !point(value.arena.center) || !finite(value.arena.radius, 80, 500)
    || distance(value.position, value.arena.center) > value.arena.radius) return false;
  const target = value.target;
  return target === null || (
    plainRecord(target) && hasKeys(target, ['id', 'x', 'y', 'alive'])
    && validId(target.id) && typeof target.alive === 'boolean'
    && finite(target.x, 0, WORLD_WIDTH) && finite(target.y, 0, WORLD_HEIGHT)
  );
}
function suitableTarget(input: MiniBossStepInput): MiniBossTarget | null {
  const target = input.target;
  return target?.alive === true
    && distance(target, input.arena.center) <= input.arena.radius
    ? target : null;
}

/**
 * Exactly one bounded transition per call (max 3 action plans); timer excess
 * is deliberately not carried across stages. All geometry is a suggestion:
 * runtime must validate navigation, collision, damage and actor budgets.
 */
export function stepMiniBoss(state: MiniBossState, input: MiniBossStepInput): MiniBossStepResult | null {
  if (!validateMiniBossState(state) || !validInput(input)) return null;
  const def = MINI_BOSS_DEFINITIONS[state.bossId];
  if (state.stage === 'dead') {
    return !input.alive ? result(state, []) : null; // Never resurrect a dead occurrence.
  }
  const dt = input.deltaSeconds;
  const cooldowns: Record<string, number> = {};
  for (const ability of def.abilities) {
    cooldowns[ability.id] = Math.max(0, state.cooldowns[ability.id]! - dt);
  }
  let next: MiniBossState = { ...state, cooldowns };
  const actions: MiniBossActionPlan[] = [];

  if (!input.alive) {
    next = { ...next, stage: 'dead', remainingSeconds: 0, activeAbilityId: null,
      lockedPoint: null, introPlayed: true, deathPlanned: false };
    actions.push({ kind: 'death', bossId: state.bossId, hookId: def.deathHookId });
    return result(next, actions);
  }

  if (next.phase === 1 && input.health / input.maxHealth <= def.phaseThreshold) {
    next = { ...next, phase: 2, rotationCursor: 0 };
    actions.push({ kind: 'phase', bossId: state.bossId, phase: 2, hookId: def.phaseHookId });
  }

  if (next.stage === 'intro') {
    if (!next.introPlayed) {
      actions.push({ kind: 'intro', bossId: state.bossId,
        hookId: def.introHookId, arenaHookId: def.arenaHookId,
        nameKey: def.displayNameKey });
    }
    const remainingSeconds = Math.max(0, next.remainingSeconds - dt);
    next = { ...next, introPlayed: true, remainingSeconds,
      stage: remainingSeconds === 0 ? 'ready' : 'intro' };
    return result(next, actions);
  }

  const target = suitableTarget(input);
  if (next.stage === 'windup') {
    // Missing/dead/out-of-arena targets cancel the strike, not just its UI cue.
    if (!target) {
      next = { ...next, stage: 'ready', remainingSeconds: 0,
        activeAbilityId: null, lockedPoint: null };
      return result(next, actions);
    }
    const remainingSeconds = Math.max(0, next.remainingSeconds - dt);
    if (remainingSeconds > 0) return result({ ...next, remainingSeconds }, actions);
    const ability = def.abilities.find(x => x.id === next.activeAbilityId);
    if (!ability || !next.lockedPoint) return null;
    const point = copyPoint(next.lockedPoint);
    actions.push({
      kind: 'impact', bossId: state.bossId, abilityId: ability.id,
      effect: ability.effect, point, shape: ability.shape, radius: ability.radius,
      range: ability.range, durationSeconds: 0, hookId: ability.impactHookId
    });
    if (ability.effect === 'summon' && next.summonsRequested < def.maxSummonRequests) {
      actions.push({ kind: 'summon', bossId: state.bossId, abilityId: ability.id,
        enemyType: 'spider', count: 1, point });
      next = { ...next, summonsRequested: next.summonsRequested + 1 };
    }
    if (ability.effect === 'hazard' || ability.effect === 'support') {
      actions.push({ kind: ability.effect, bossId: state.bossId,
        abilityId: ability.id, point, radius: ability.radius, hookId: ability.impactHookId });
    }
    next = { ...next, stage: 'recovery', remainingSeconds: ability.recoverySeconds,
      activeAbilityId: null, lockedPoint: null };
    return result(next, actions);
  }

  if (next.stage === 'recovery') {
    const remainingSeconds = Math.max(0, next.remainingSeconds - dt);
    return result({ ...next, stage: remainingSeconds === 0 ? 'ready' : 'recovery',
      remainingSeconds }, actions);
  }

  // Ready: select by deterministic rotation; phase 2 reverses opening priority.
  if (target !== null) {
    const toTarget = distance(input.position, target);
    for (let offset = 0; offset < def.abilities.length; offset++) {
      const abilityIndex = (next.rotationCursor + offset + (next.phase === 2 ? 1 : 0)) % 2 as 0 | 1;
      const ability = def.abilities[abilityIndex];
      if (cooldowns[ability.id]! > 0 || toTarget > ability.range
        || (ability.effect === 'summon' && next.summonsRequested >= def.maxSummonRequests)) continue;
      const point = copyPoint({ x: target.x, y: target.y });
      actions.push({
        kind: 'telegraph', bossId: state.bossId, abilityId: ability.id,
        effect: ability.effect, point, shape: ability.shape, radius: ability.radius,
        range: ability.range, durationSeconds: ability.windupSeconds,
        hookId: ability.telegraphHookId
      });
      cooldowns[ability.id] = ability.cooldownSeconds * (next.phase === 2 ? 0.8 : 1);
      next = { ...next, stage: 'windup', remainingSeconds: ability.windupSeconds,
        activeAbilityId: ability.id, lockedPoint: point, cooldowns,
        rotationCursor: ((abilityIndex + 1 - (next.phase === 2 ? 1 : 0) + 2) % 2) as 0 | 1 };
      return result(next, actions);
    }
    if (toTarget > Math.min(...def.abilities.map(a => a.range))) {
      actions.push({ kind: 'move', bossId: state.bossId, mode: 'approach',
        point: copyPoint(target) });
    }
  } else if (distance(input.position, input.arena.center) > 1) {
    actions.push({ kind: 'move', bossId: state.bossId, mode: 'return',
      point: copyPoint(input.arena.center) });
  }
  return result(next, actions);
}

/**
 * Consume one proposed defeat reward on authoritative alive→dead transition.
 * A processed-occurrence ledger also suppresses replay from an older snapshot.
 * Callers MUST atomically commit returned state and ledger before applying loot.
 */
export function planMiniBossDefeat(state: MiniBossState,
  context: MiniBossDefeatContext): MiniBossDefeatResult | null {
  if (!validateMiniBossState(state) || state.stage !== 'dead'
    || !plainRecord(context) || !hasKeys(context, ['processedOccurrenceIds'])
    || !Array.isArray(context.processedOccurrenceIds)
    || context.processedOccurrenceIds.length > MAX_PROCESSED_OCCURRENCES
    || context.processedOccurrenceIds.some(x => !validId(x))
    || new Set(context.processedOccurrenceIds).size !== context.processedOccurrenceIds.length) return null;
  const alreadyProcessed = state.deathPlanned
    || context.processedOccurrenceIds.includes(state.occurrenceId);
  const updated = ownState({ ...state, deathPlanned: true });
  if (alreadyProcessed) return Object.freeze({ state: updated, proposal: null });
  const def = MINI_BOSS_DEFINITIONS[state.bossId];
  const proposal: MiniBossRewardProposal = Object.freeze({
    bossId: state.bossId, occurrenceId: state.occurrenceId,
    defeatEventId: def.questEventId,
    rewardProposalId: `mini_boss.${state.bossId}.${state.occurrenceId}.boss_reward`,
    questId: def.questId, worldMarkerId: def.worldMarkerId,
    enemyType: def.enemyType, lootTableId: 'boss',
    minimumRarity: 'EPIC', guaranteed: true
  });
  return Object.freeze({ state: updated, proposal });
}
