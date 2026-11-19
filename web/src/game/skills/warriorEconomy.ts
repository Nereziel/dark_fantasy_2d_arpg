/**
 * GPL-3.0-only — isolated Warrior combat economy (no runtime integration).
 *
 * All times are seconds and positions are simulation-world coordinates.
 * Direction targets carry a direction vector; enemy/ground targets carry a point.
 * Inputs remain untouched. Returned decisions and state snapshots are frozen.
 */

export type WarriorTargetMode = 'enemy' | 'ground' | 'self' | 'direction';

export interface WarriorEconomySkill {
  readonly id: string;
  readonly cost: number;
  readonly cooldown: number;
  readonly range: number;
  readonly target: WarriorTargetMode;
  readonly autoApproach: boolean;
  readonly silenceRestricted: boolean;
  readonly movementSkill: boolean;
}

export interface WarriorEconomyState {
  readonly rage: number;
  readonly maxRage: number;
  readonly cooldowns: Readonly<Record<string, number>>;
}

export interface WarriorActor {
  readonly x: number;
  readonly y: number;
  readonly alive: boolean;
}

export interface WarriorTarget {
  readonly x: number;
  readonly y: number;
  /** Required and true for an enemy target; ignored for ground/direction aims. */
  readonly alive?: boolean;
}

export interface WarriorActivationRequest {
  readonly skill: WarriorEconomySkill;
  readonly state: WarriorEconomyState;
  readonly actor: WarriorActor;
  readonly target?: WarriorTarget | null;
  readonly stunned: boolean;
  readonly silenced: boolean;
  readonly holdPosition: boolean;
  readonly canMove: boolean;
}

export type WarriorBlockedReason =
  | 'invalidSkill'
  | 'invalidState'
  | 'invalidTarget'
  | 'dead'
  | 'stunned'
  | 'silenced'
  | 'cooldown'
  | 'rage'
  | 'outOfRange'
  | 'movementBlocked';

export type WarriorActivationDecision =
  | Readonly<{ status: 'ready' }>
  | Readonly<{ status: 'approach'; destination: Readonly<{ x: number; y: number }>; stopRange: number }>
  | Readonly<{ status: 'blocked'; reason: WarriorBlockedReason }>;

export interface WarriorSpendResult {
  readonly decision: WarriorActivationDecision;
  readonly state: WarriorEconomyState;
}

const READY: WarriorActivationDecision = Object.freeze({ status: 'ready' });

function blocked(reason: WarriorBlockedReason): WarriorActivationDecision {
  return Object.freeze({ status: 'blocked', reason });
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isFinitePoint(point: unknown): point is Readonly<{ x: number; y: number }> {
  if (!point || typeof point !== 'object') return false;
  const maybe = point as Partial<WarriorTarget>;
  return typeof maybe.x === 'number' && Number.isFinite(maybe.x)
    && typeof maybe.y === 'number' && Number.isFinite(maybe.y);
}

function isValidSkill(skill: unknown): skill is WarriorEconomySkill {
  if (!skill || typeof skill !== 'object') return false;
  const candidate = skill as Partial<WarriorEconomySkill>;
  return typeof candidate.id === 'string' && candidate.id.trim().length > 0
    && isFiniteNonnegative(candidate.cost)
    && isFiniteNonnegative(candidate.cooldown)
    && isFiniteNonnegative(candidate.range)
    && (candidate.target === 'enemy' || candidate.target === 'ground'
      || candidate.target === 'self' || candidate.target === 'direction')
    && typeof candidate.autoApproach === 'boolean'
    && typeof candidate.silenceRestricted === 'boolean'
    && typeof candidate.movementSkill === 'boolean';
}

function isValidState(state: unknown): state is WarriorEconomyState {
  if (!state || typeof state !== 'object') return false;
  const candidate = state as Partial<WarriorEconomyState>;
  return typeof candidate.maxRage === 'number' && Number.isFinite(candidate.maxRage)
    && candidate.maxRage > 0
    && isFiniteNonnegative(candidate.rage)
    && candidate.rage <= candidate.maxRage
    && !!candidate.cooldowns && typeof candidate.cooldowns === 'object'
    && !Array.isArray(candidate.cooldowns)
    && Object.values(candidate.cooldowns).every(isFiniteNonnegative);
}

/** Make a finite, deeply immutable economy snapshot even if input is malformed. */
function snapshotState(state: WarriorEconomyState): WarriorEconomyState {
  const maxRage = isFiniteNonnegative(state?.maxRage) ? state.maxRage : 0;
  const rage = isFiniteNonnegative(state?.rage) ? Math.min(maxRage, state.rage) : 0;
  const inputCooldowns = state?.cooldowns;
  const cooldowns = Object.fromEntries(
    inputCooldowns && typeof inputCooldowns === 'object' && !Array.isArray(inputCooldowns)
      ? Object.entries(inputCooldowns).map(([id, remaining]) => [
        id, isFiniteNonnegative(remaining) ? remaining : 0
      ])
      : []
  ) as Record<string, number>;
  return Object.freeze({ rage, maxRage, cooldowns: Object.freeze(cooldowns) });
}

/**
 * Classifies a requested cast without changing Rage, cooldowns or actor position.
 * An out-of-range enemy/ground aim can approach only when explicitly permitted.
 * The caller owns pathfinding and may reject an unreachable destination.
 */
export function canActivateWarriorSkill(request: WarriorActivationRequest): WarriorActivationDecision {
  if (!request || !isValidSkill(request.skill)) return blocked('invalidSkill');
  const { skill, state, actor, target } = request;
  if (!isValidState(state)
    || !actor || !isFinitePoint(actor) || typeof actor.alive !== 'boolean'
    || typeof request.stunned !== 'boolean' || typeof request.silenced !== 'boolean'
    || typeof request.holdPosition !== 'boolean' || typeof request.canMove !== 'boolean') {
    return blocked('invalidState');
  }
  if (!actor.alive) return blocked('dead');
  if (request.stunned) return blocked('stunned');
  if (request.silenced && skill.silenceRestricted) return blocked('silenced');

  const remaining = Object.hasOwn(state.cooldowns, skill.id) ? state.cooldowns[skill.id] : 0;
  if (remaining > 0) return blocked('cooldown');
  if (state.rage < skill.cost) return blocked('rage');
  if (skill.movementSkill && (request.holdPosition || !request.canMove)) {
    return blocked('movementBlocked');
  }

  if (skill.target === 'self') return READY;
  if (!isFinitePoint(target)
    || (skill.target === 'enemy' && target.alive !== true)
    || (skill.target === 'direction' && target.x === 0 && target.y === 0)) {
    return blocked('invalidTarget');
  }
  if (skill.target === 'direction') return READY;

  const distance = Math.hypot(actor.x - target.x, actor.y - target.y);
  if (!Number.isFinite(distance)) return blocked('invalidTarget');
  if (distance <= skill.range) return READY;
  if (!skill.autoApproach || request.holdPosition || !request.canMove) {
    return blocked('outOfRange');
  }
  return Object.freeze({
    status: 'approach',
    destination: Object.freeze({ x: target.x, y: target.y }),
    stopRange: skill.range
  });
}

/** Commit Rage/cooldown atomically only after a ready decision. */
export function spendAndStartCooldown(request: WarriorActivationRequest): WarriorSpendResult {
  const decision = canActivateWarriorSkill(request);
  const current = snapshotState(request?.state);
  if (decision.status !== 'ready') {
    return Object.freeze({ decision, state: current });
  }

  const skill = request.skill;
  const nextCooldowns = Object.freeze({ ...current.cooldowns, [skill.id]: skill.cooldown });
  const state = Object.freeze({
    rage: Math.max(0, current.rage - skill.cost),
    maxRage: current.maxRage,
    cooldowns: nextCooldowns
  });
  return Object.freeze({ decision, state });
}

/**
 * Advance all independent skill timers. Invalid or negative dt is ignored.
 * Malformed incoming timer values are normalized to zero, never propagated.
 */
export function advanceWarriorCooldowns(
  state: WarriorEconomyState,
  deltaSeconds: number
): WarriorEconomyState {
  const current = snapshotState(state);
  if (!isFiniteNonnegative(deltaSeconds) || deltaSeconds === 0) return current;
  const cooldowns = Object.fromEntries(
    Object.entries(current.cooldowns).map(([id, remaining]) => [
      id, Math.max(0, remaining - deltaSeconds)
    ])
  ) as Record<string, number>;
  return Object.freeze({
    rage: current.rage,
    maxRage: current.maxRage,
    cooldowns: Object.freeze(cooldowns)
  });
}

/**
 * Apply Rage from a hit, decay or another simulation-owned effect.
 * Finite positive/negative deltas clamp to [0, maxRage].
 * NaN/infinite deltas are rejected as no-ops.
 */
export function applyWarriorRageDelta(
  state: WarriorEconomyState,
  delta: number
): WarriorEconomyState {
  const current = snapshotState(state);
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return current;
  return Object.freeze({
    rage: Math.max(0, Math.min(current.maxRage, current.rage + delta)),
    maxRage: current.maxRage,
    cooldowns: current.cooldowns
  });
}
