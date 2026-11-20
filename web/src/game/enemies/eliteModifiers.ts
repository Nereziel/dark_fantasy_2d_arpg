/**
 * GPL-3.0-only. Wave C / Agent 21: pure, detached elite modifier rules.
 *
 * No simulation mutation, actor snapshot edits, loot generation, damage rolls,
 * render calls or persistence. Consumers must execute all planned hits through
 * the canonical typedDamage/status systems and retain explicit event keys.
 */
export const ELITE_MODIFIER_IDS = Object.freeze([
  'extraHealth', 'increasedDamage', 'fast', 'fireAura',
  'frostAttacks', 'poisonAttacks', 'teleporting', 'shielded',
  'regenerating', 'summoner', 'explodesOnDeath', 'hazardousGround'
] as const);

export type EliteModifierId = (typeof ELITE_MODIFIER_IDS)[number];
export type EliteLootQualityTag = 'normal' | 'elite' | 'eliteEmpowered' | 'eliteMythic';
export type EliteVisualTag =
  | 'elite' | 'large' | 'enraged' | 'haste' | 'fireAura' | 'frost'
  | 'poison' | 'blink' | 'shield' | 'regeneration' | 'summoner'
  | 'deathBurst' | 'groundHazard';

export interface EliteStatMultipliers {
  readonly health: number;
  readonly damage: number;
  readonly speed: number;
}

export interface EliteModifierDefinition {
  readonly id: EliteModifierId;
  /** Relative sampling weight for compatible combination lottery. */
  readonly weight: number;
  readonly excludes: readonly EliteModifierId[];
  readonly requires: readonly EliteModifierId[];
  readonly statMultipliers: EliteStatMultipliers;
  readonly shieldFraction: number;
  readonly visualTags: readonly EliteVisualTag[];
  /** Seconds between periodic trigger proposals; absent for passive/on-hit/death. */
  readonly periodicIntervalSeconds?: number;
}

const NEUTRAL = Object.freeze({ health: 1, damage: 1, speed: 1 });
const EMPTY_IDS: readonly EliteModifierId[] = Object.freeze([]);
const MAX_BASE_STAT = 1_000_000;
const MAX_WORLD_COORD = 1_000_000;
const MAX_ACTIONS_PER_STEP = 64;
const MAX_TIME = 86_400;

function define(
  id: EliteModifierId,
  weight: number,
  options: {
    excludes?: readonly EliteModifierId[];
    requires?: readonly EliteModifierId[];
    multipliers?: Partial<EliteStatMultipliers>;
    shieldFraction?: number;
    visualTags?: readonly EliteVisualTag[];
    periodicIntervalSeconds?: number;
  } = {}
): EliteModifierDefinition {
  return Object.freeze({
    id, weight,
    excludes: Object.freeze([...(options.excludes ?? EMPTY_IDS)]),
    requires: Object.freeze([...(options.requires ?? EMPTY_IDS)]),
    statMultipliers: Object.freeze({ ...NEUTRAL, ...options.multipliers }),
    shieldFraction: options.shieldFraction ?? 0,
    visualTags: Object.freeze([...(options.visualTags ?? [])]),
    ...(options.periodicIntervalSeconds === undefined
      ? {} : { periodicIntervalSeconds: options.periodicIntervalSeconds })
  });
}

/** The exclusions and dependencies are symmetric/inclusive at validation time. */
export const ELITE_MODIFIERS: Readonly<Record<EliteModifierId, EliteModifierDefinition>> =
  Object.freeze({
    extraHealth: define('extraHealth', 10, { multipliers: { health: 1.5 }, visualTags: ['large'] }),
    increasedDamage: define('increasedDamage', 10, { multipliers: { damage: 1.35 }, visualTags: ['enraged'] }),
    fast: define('fast', 10, { multipliers: { speed: 1.4 }, visualTags: ['haste'] }),
    fireAura: define('fireAura', 6, {
      excludes: ['hazardousGround'], visualTags: ['fireAura'], periodicIntervalSeconds: 1
    }),
    frostAttacks: define('frostAttacks', 7, { excludes: ['poisonAttacks'], visualTags: ['frost'] }),
    poisonAttacks: define('poisonAttacks', 7, { excludes: ['frostAttacks'], visualTags: ['poison'] }),
    teleporting: define('teleporting', 4, {
      requires: ['fast'], visualTags: ['blink'], periodicIntervalSeconds: 7
    }),
    shielded: define('shielded', 6, {
      excludes: ['regenerating'], shieldFraction: 0.4, visualTags: ['shield']
    }),
    regenerating: define('regenerating', 6, {
      excludes: ['shielded'], visualTags: ['regeneration'], periodicIntervalSeconds: 1
    }),
    summoner: define('summoner', 5, {
      requires: ['extraHealth'], visualTags: ['summoner'], periodicIntervalSeconds: 8
    }),
    explodesOnDeath: define('explodesOnDeath', 5, { visualTags: ['deathBurst'] }),
    hazardousGround: define('hazardousGround', 5, {
      excludes: ['fireAura'], visualTags: ['groundHazard'], periodicIntervalSeconds: 5
    })
  });

export function getEliteModifier(value: unknown): EliteModifierDefinition | undefined {
  return typeof value === 'string' && Object.hasOwn(ELITE_MODIFIERS, value)
    ? ELITE_MODIFIERS[value as EliteModifierId] : undefined;
}

/** Canonical ordering is independent of user-provided modifier order. */
function readEliteSet(value: unknown): readonly EliteModifierId[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const unique = new Set<EliteModifierId>();
  for (const id of value) {
    if (!getEliteModifier(id) || unique.has(id as EliteModifierId)) return null;
    unique.add(id as EliteModifierId);
  }
  for (const id of unique) {
    const definition = ELITE_MODIFIERS[id];
    if (definition.requires.some(required => !unique.has(required))) return null;
    if (definition.excludes.some(excluded => unique.has(excluded))) return null;
  }
  return ELITE_MODIFIER_IDS.filter(id => unique.has(id));
}

/** [] is intentionally valid as a neutral non-elite; a spawned elite needs 1–3. */
export function validateEliteSet(value: unknown): value is readonly EliteModifierId[] {
  return readEliteSet(value) !== null;
}

export interface EliteRollContext {
  /** 0 for a normal enemy, 1–3 for elite tiers. */
  readonly count: number;
  /** Optional bounded candidate pool (order has no effect on the seed result). */
  readonly pool?: readonly EliteModifierId[];
  /** Every chosen combination must contain all these IDs. */
  readonly required?: readonly EliteModifierId[];
}

export interface EliteRandomSource {
  /** Must return one finite uniform variate in [0, 1). */
  next(): number;
}

function readIdList(value: unknown, allowUndefined: boolean): readonly EliteModifierId[] | null {
  if (value === undefined && allowUndefined) return ELITE_MODIFIER_IDS;
  if (!Array.isArray(value)) return null;
  const seen = new Set<EliteModifierId>();
  for (const id of value) {
    if (!getEliteModifier(id) || seen.has(id as EliteModifierId)) return null;
    seen.add(id as EliteModifierId);
  }
  return ELITE_MODIFIER_IDS.filter(id => seen.has(id));
}

/**
 * Sample entire *valid combinations*, not greedy individual modifiers:
 * prerequisites do not become impossible due to the draw order.
 * Exactly one seeded RNG draw is consumed for a successful nonzero roll.
 * Invalid configuration, impossible constraints or malformed RNG => null.
 */
export function rollEliteModifiers(context: unknown, rng: unknown): readonly EliteModifierId[] | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const config = context as Record<string, unknown>;
  const count = config.count;
  if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > 3) return null;
  const pool = readIdList(config.pool, true);
  const required = config.required === undefined ? EMPTY_IDS : readIdList(config.required, false);
  if (!pool || !required || required.length > (count as number)) return null;
  if (required.some(id => !pool.includes(id))) return null;
  if (!rng || typeof rng !== 'object' || typeof (rng as Partial<EliteRandomSource>).next !== 'function')
    return null;
  if (count === 0) return Object.freeze([]);

  const candidates: EliteModifierId[][] = [];
  const weights: number[] = [];
  let total = 0;

  function visit(start: number, chosen: EliteModifierId[]): void {
    if (chosen.length === count) {
      const normalized = readEliteSet(chosen);
      if (!normalized || required!.some(id => !normalized.includes(id))) return;
      const weight = normalized.reduce((p, id) => p * ELITE_MODIFIERS[id].weight, 1);
      total += weight;
      candidates.push([...normalized]);
      weights.push(weight);
      return;
    }
    for (let i = start; i < pool!.length; i++) {
      // Enough candidates must remain to reach the requested size.
      if (chosen.length + pool!.length - i < (count as number)) break;
      chosen.push(pool![i]!);
      visit(i + 1, chosen);
      chosen.pop();
    }
  }
  visit(0, []);
  if (candidates.length === 0 || !Number.isFinite(total) || total <= 0) return null;

  let roll: number;
  try { roll = (rng as EliteRandomSource).next(); } catch { return null; }
  if (typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll >= 1) return null;
  let position = roll * total;
  for (let i = 0; i < candidates.length; i++) {
    if (position < weights[i]!) return Object.freeze([...candidates[i]!]);
    position -= weights[i]!;
  }
  // Floating-point roundoff cannot silently choose a different combination.
  return Object.freeze([...candidates[candidates.length - 1]!]);
}

export interface EliteBaseStats {
  readonly health: number;
  readonly baseDamage: number;
  readonly speed: number;
}

export interface EliteStatPlan {
  readonly maxHealth: number;
  readonly baseDamage: number;
  readonly speed: number;
  readonly shield: number;
  readonly delta: Readonly<{ health: number; baseDamage: number; speed: number }>;
  readonly modifierIds: readonly EliteModifierId[];
  readonly lootQualityTag: EliteLootQualityTag;
  readonly visualTags: readonly EliteVisualTag[];
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/.test(id);
}
function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export function applyEliteStats(base: unknown, modifiers: unknown): EliteStatPlan | null {
  const ids = readEliteSet(modifiers);
  if (!object(base) || !ids
      || !finite(base.health, Number.MIN_VALUE, MAX_BASE_STAT)
      || !finite(base.baseDamage, 0, MAX_BASE_STAT)
      || !finite(base.speed, 0, MAX_BASE_STAT)) return null;

  let maxHealth = base.health;
  let baseDamage = base.baseDamage;
  let speed = base.speed;
  let shieldFraction = 0;
  for (const id of ids) {
    const mod = ELITE_MODIFIERS[id];
    maxHealth *= mod.statMultipliers.health;
    baseDamage *= mod.statMultipliers.damage;
    speed *= mod.statMultipliers.speed;
    shieldFraction += mod.shieldFraction;
  }
  maxHealth = round(maxHealth);
  baseDamage = round(baseDamage);
  speed = round(speed);
  const shield = Math.round(maxHealth * shieldFraction);
  if (![maxHealth, baseDamage, speed, shield].every(v => finite(v, 0, MAX_BASE_STAT * 8)))
    return null;
  const visualTags = new Set<EliteVisualTag>(ids.length ? ['elite'] : []);
  ids.forEach(id => ELITE_MODIFIERS[id].visualTags.forEach(tag => visualTags.add(tag)));
  return Object.freeze({
    maxHealth, baseDamage, speed, shield,
    delta: Object.freeze({
      health: round(maxHealth - base.health),
      baseDamage: round(baseDamage - base.baseDamage),
      speed: round(speed - base.speed)
    }),
    modifierIds: Object.freeze([...ids]),
    lootQualityTag: (
      ids.length === 0 ? 'normal'
        : ids.length === 1 ? 'elite'
          : ids.length === 2 ? 'eliteEmpowered' : 'eliteMythic'
    ) satisfies EliteLootQualityTag,
    visualTags: Object.freeze([...visualTags])
  });
}

export interface ElitePoint { readonly x: number; readonly y: number }

export type ElitePlannedAction =
  | Readonly<{
      kind: 'status'; sourceId: string; targetId: string;
      statusId: 'chilled' | 'frozen' | 'poisoned' | 'regeneration';
      trigger: 'hit' | 'critical' | 'periodic';
      durationSeconds: number; magnitude: number; eventKey?: string;
    }>
  | Readonly<{
      kind: 'telegraph'; sourceId: string; eventKey: string;
      telegraphId: 'fireAura' | 'teleport' | 'hazardousGround' | 'deathExplosion';
      position: ElitePoint; radius: number; delaySeconds: number;
    }>
  | Readonly<{
      kind: 'damage'; sourceId: string; eventKey: string;
      damageType: 'fire'; baseMultiplier: number; radius: number;
      position: ElitePoint; delaySeconds: number;
    }>
  | Readonly<{
      kind: 'hazard'; sourceId: string; eventKey: string;
      damageType: 'poison'; baseMultiplier: number; radius: number;
      position: ElitePoint; durationSeconds: number; tickIntervalSeconds: number;
    }>
  | Readonly<{
      kind: 'summon'; sourceId: string; eventKey: string;
      enemyType: 'skeleton'; count: number; maxActive: number;
    }>
  | Readonly<{
      kind: 'teleport'; sourceId: string; eventKey: string;
      maxDistance: number; castSeconds: number;
    }>;

function freezeActions(actions: readonly ElitePlannedAction[]): readonly ElitePlannedAction[] {
  return Object.freeze(actions.map(action => Object.freeze(action)));
}

export interface EliteHitContext {
  readonly sourceId: string;
  readonly targetId: string;
  /** True only if the canonical damage resolver actually landed the strike. */
  readonly hit: boolean;
  readonly critical: boolean;
  readonly damage: number;
}

export function eliteOnHitPlan(modifiers: unknown, context: unknown): readonly ElitePlannedAction[] | null {
  const ids = readEliteSet(modifiers);
  if (!ids || !object(context) || !validId(context.sourceId) || !validId(context.targetId)
      || typeof context.hit !== 'boolean' || typeof context.critical !== 'boolean'
      || !finite(context.damage, 0, MAX_BASE_STAT * 8)) return null;
  if (!context.hit || context.damage === 0) return freezeActions([]);
  const actions: ElitePlannedAction[] = [];
  if (ids.includes('frostAttacks')) actions.push({
    kind: 'status', sourceId: context.sourceId, targetId: context.targetId,
    statusId: context.critical ? 'frozen' : 'chilled',
    trigger: context.critical ? 'critical' : 'hit',
    durationSeconds: context.critical ? 0.75 : 2.5,
    magnitude: context.critical ? 1 : 0.35
  });
  if (ids.includes('poisonAttacks')) actions.push({
    kind: 'status', sourceId: context.sourceId, targetId: context.targetId,
    statusId: 'poisoned',
    trigger: context.critical ? 'critical' : 'hit',
    durationSeconds: 4,
    magnitude: context.critical ? 0.36 : 0.18
  });
  return freezeActions(actions);
}

export interface ElitePeriodicContext {
  readonly actorId: string;
  readonly position: ElitePoint;
  /** Absolute simulation seconds; never wall-clock time. */
  readonly elapsedSeconds: number;
  readonly deltaSeconds: number;
}

export interface ElitePeriodicPlan {
  readonly actions: readonly ElitePlannedAction[];
  /** Excess event descriptors intentionally skipped by the per-step cap. */
  readonly suppressedActions: number;
}

function readPosition(value: unknown): ElitePoint | null {
  if (!object(value) || !finite(value.x, 0, MAX_WORLD_COORD) || !finite(value.y, 0, MAX_WORLD_COORD))
    return null;
  return Object.freeze({ x: value.x, y: value.y });
}

function periodEvent(
  id: EliteModifierId, actorId: string, position: ElitePoint, eventKey: string
): readonly ElitePlannedAction[] {
  switch (id) {
    case 'fireAura':
      return [
        { kind: 'telegraph', sourceId: actorId, eventKey: eventKey + ':tell',
          telegraphId: 'fireAura', position, radius: 105, delaySeconds: 0.2 },
        { kind: 'damage', sourceId: actorId, eventKey: eventKey + ':impact',
          damageType: 'fire', position, radius: 105, baseMultiplier: 0.45, delaySeconds: 0.2 }
      ];
    case 'regenerating':
      // Status runtime owns the eventual HoT tick; never heal here.
      return [{
        kind: 'status', sourceId: actorId, targetId: actorId,
        statusId: 'regeneration', trigger: 'periodic',
        durationSeconds: 1.1, magnitude: 0.03, eventKey
      }];
    case 'summoner':
      return [{ kind: 'summon', sourceId: actorId, eventKey,
        enemyType: 'skeleton', count: 1, maxActive: 2 }];
    case 'teleporting':
      // Coordinator finds a valid unblocked destination, not this planner.
      return [
        { kind: 'telegraph', sourceId: actorId, eventKey: eventKey + ':tell',
          telegraphId: 'teleport', position, radius: 80, delaySeconds: 0.4 },
        { kind: 'teleport', sourceId: actorId, eventKey: eventKey + ':move',
          maxDistance: 220, castSeconds: 0.4 }
      ];
    case 'hazardousGround':
      return [
        { kind: 'telegraph', sourceId: actorId, eventKey: eventKey + ':tell',
          telegraphId: 'hazardousGround', position, radius: 75, delaySeconds: 0.3 },
        { kind: 'hazard', sourceId: actorId, eventKey: eventKey + ':spawn',
          damageType: 'poison', baseMultiplier: 0.3, radius: 75, position,
          durationSeconds: 4, tickIntervalSeconds: 1 }
      ];
    default: return [];
  }
}

/**
 * Deterministic tick boundary crossing, with fixed ordering and event keys.
 * Unemitted actions are reported, not executed later or silently converted.
 * Replay-safe execution requires the coordinator to deduplicate event keys.
 */
export function eliteOnPeriodicPlan(modifiers: unknown, context: unknown): ElitePeriodicPlan | null {
  const ids = readEliteSet(modifiers);
  if (!ids || !object(context) || !validId(context.actorId)
      || !finite(context.elapsedSeconds, 0, MAX_TIME)
      || !finite(context.deltaSeconds, 0, 60)) return null;
  const position = readPosition(context.position);
  if (!position) return null;
  const actions: ElitePlannedAction[] = [];
  let suppressedActions = 0;
  for (const id of ids) {
    const interval = ELITE_MODIFIERS[id].periodicIntervalSeconds;
    if (interval === undefined || context.deltaSeconds === 0) continue;
    // Add a sub-nanosecond tolerance only for floating-point boundary error.
    const firstTick = Math.floor((context.elapsedSeconds + 1e-10) / interval);
    const lastTick = Math.floor((context.elapsedSeconds + context.deltaSeconds + 1e-10) / interval);
    for (let tick = firstTick + 1; tick <= lastTick; tick++) {
      const planned = periodEvent(id, context.actorId, position, `${context.actorId}:${id}:${tick}`);
      const available = Math.max(0, MAX_ACTIONS_PER_STEP - actions.length);
      actions.push(...planned.slice(0, available));
      suppressedActions += Math.max(0, planned.length - available);
    }
  }
  return Object.freeze({ actions: freezeActions(actions), suppressedActions });
}

export interface EliteDeathContext {
  readonly actorId: string;
  readonly position: ElitePoint;
  readonly alive: boolean;
  /** External event ledger must mark the key consumed after first dispatch. */
  readonly alreadyTriggered: boolean;
}

export interface EliteDeathPlan {
  readonly eventKey: string | null;
  readonly actions: readonly ElitePlannedAction[];
}

/**
 * Stateless one-shot contract: actor death + unconsumed marker emits a stable
 * key. Simulation MUST record that key before dispatching damage, to prevent
 * duplicate death explosions across subsequent fixed ticks.
 */
export function eliteOnDeathPlan(modifiers: unknown, context: unknown): EliteDeathPlan | null {
  const ids = readEliteSet(modifiers);
  if (!ids || !object(context) || !validId(context.actorId)
      || typeof context.alive !== 'boolean' || typeof context.alreadyTriggered !== 'boolean')
    return null;
  const position = readPosition(context.position);
  if (!position) return null;
  if (context.alive || context.alreadyTriggered || !ids.includes('explodesOnDeath')) {
    return Object.freeze({ eventKey: null, actions: freezeActions([]) });
  }
  const eventKey = `${context.actorId}:explodesOnDeath`;
  return Object.freeze({
    eventKey,
    actions: freezeActions([
      { kind: 'telegraph', sourceId: context.actorId, eventKey: eventKey + ':tell',
        telegraphId: 'deathExplosion', position, radius: 140, delaySeconds: 0.6 },
      { kind: 'damage', sourceId: context.actorId, eventKey: eventKey + ':impact',
        damageType: 'fire', position, radius: 140, baseMultiplier: 1.8, delaySeconds: 0.6 }
    ])
  });
}
