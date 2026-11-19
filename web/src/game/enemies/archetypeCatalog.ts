/**
 * Standalone, data-only enemy role configurations.
 *
 * Units: ranges are world units; retreatThreshold is the fraction of current
 * health remaining (0..1); cooldownBias multiplies the base attack cooldown.
 * The simulation/coordinator owns all decisions and timing. No AI runs here.
 */

export type EnemyArchetypeId =
  | 'meleeAggressor'
  | 'rangedAttacker'
  | 'defensive'
  | 'healer'
  | 'summoner'
  | 'ambusher'
  | 'charger'
  | 'caster'
  | 'support';

export type EnemyTargetPriority =
  | 'nearestEnemy'
  | 'lowestHealthEnemy'
  | 'highestThreatEnemy'
  | 'isolatedEnemy'
  | 'lowestHealthAlly';

export type EnemyAttackPolicy =
  | 'melee'
  | 'ranged'
  | 'guard'
  | 'heal'
  | 'summon'
  | 'ambush'
  | 'charge'
  | 'cast'
  | 'support';

export type EnemyMovementPolicy =
  | 'close'
  | 'kite'
  | 'holdGround'
  | 'followAlly'
  | 'flank'
  | 'charge'
  | 'maintainDistance';

export interface EnemyArchetypeConfig {
  readonly id: EnemyArchetypeId;
  /** Distance for first acquiring a hostile target. */
  readonly aggroRange: number;
  /** Maximum allowed distance from spawn/guard origin before disengaging. */
  readonly leashRange: number;
  readonly attackRange: number;
  /** Desired distance to target, always within attackRange. */
  readonly preferredDistance: number;
  /** Multiplier of the enemy's base movement speed. */
  readonly speedMultiplier: number;
  /** Health fraction at which defensive retreat is permitted. */
  readonly retreatThreshold: number;
  /** Multiplier of base ability cooldown; lower values attack more frequently. */
  readonly cooldownBias: number;
  readonly targetPriority: EnemyTargetPriority;
  readonly attackPolicy: EnemyAttackPolicy;
  readonly movementPolicy: EnemyMovementPolicy;
}

/** Stable IDs for the AI behavior planner; no dependency on Agent 12. */
export const ENEMY_ARCHETYPES: Readonly<Record<EnemyArchetypeId, EnemyArchetypeConfig>> = Object.freeze({
  meleeAggressor: Object.freeze({
    id: 'meleeAggressor',
    aggroRange: 340, leashRange: 560,
    attackRange: 80, preferredDistance: 62,
    speedMultiplier: 1.05, retreatThreshold: 0,
    cooldownBias: 1,
    targetPriority: 'nearestEnemy',
    attackPolicy: 'melee', movementPolicy: 'close'
  }),
  rangedAttacker: Object.freeze({
    id: 'rangedAttacker',
    aggroRange: 400, leashRange: 620,
    attackRange: 275, preferredDistance: 205,
    speedMultiplier: 0.92, retreatThreshold: 0.35,
    cooldownBias: 1.1,
    targetPriority: 'lowestHealthEnemy',
    attackPolicy: 'ranged', movementPolicy: 'kite'
  }),
  defensive: Object.freeze({
    id: 'defensive',
    aggroRange: 310, leashRange: 470,
    attackRange: 96, preferredDistance: 74,
    speedMultiplier: 0.85, retreatThreshold: 0.15,
    cooldownBias: 1.2,
    targetPriority: 'highestThreatEnemy',
    attackPolicy: 'guard', movementPolicy: 'holdGround'
  }),
  healer: Object.freeze({
    id: 'healer',
    aggroRange: 395, leashRange: 640,
    attackRange: 250, preferredDistance: 205,
    speedMultiplier: 0.9, retreatThreshold: 0.55,
    cooldownBias: 1.3,
    targetPriority: 'lowestHealthAlly',
    attackPolicy: 'heal', movementPolicy: 'followAlly'
  }),
  summoner: Object.freeze({
    id: 'summoner',
    aggroRange: 390, leashRange: 640,
    attackRange: 245, preferredDistance: 215,
    speedMultiplier: 0.78, retreatThreshold: 0.45,
    cooldownBias: 1.5,
    targetPriority: 'highestThreatEnemy',
    attackPolicy: 'summon', movementPolicy: 'maintainDistance'
  }),
  ambusher: Object.freeze({
    id: 'ambusher',
    aggroRange: 280, leashRange: 490,
    attackRange: 82, preferredDistance: 54,
    speedMultiplier: 1.3, retreatThreshold: 0.25,
    cooldownBias: 0.85,
    targetPriority: 'isolatedEnemy',
    attackPolicy: 'ambush', movementPolicy: 'flank'
  }),
  charger: Object.freeze({
    id: 'charger',
    aggroRange: 430, leashRange: 700,
    attackRange: 178, preferredDistance: 116,
    speedMultiplier: 1.4, retreatThreshold: 0.1,
    cooldownBias: 1.4,
    targetPriority: 'nearestEnemy',
    attackPolicy: 'charge', movementPolicy: 'charge'
  }),
  caster: Object.freeze({
    id: 'caster',
    aggroRange: 420, leashRange: 690,
    attackRange: 300, preferredDistance: 230,
    speedMultiplier: 0.8, retreatThreshold: 0.4,
    cooldownBias: 1.15,
    targetPriority: 'lowestHealthEnemy',
    attackPolicy: 'cast', movementPolicy: 'kite'
  }),
  support: Object.freeze({
    id: 'support',
    aggroRange: 400, leashRange: 650,
    attackRange: 240, preferredDistance: 198,
    speedMultiplier: 0.95, retreatThreshold: 0.5,
    cooldownBias: 1.05,
    targetPriority: 'lowestHealthAlly',
    attackPolicy: 'support', movementPolicy: 'followAlly'
  })
});

const TARGET_PRIORITIES: readonly EnemyTargetPriority[] = [
  'nearestEnemy', 'lowestHealthEnemy', 'highestThreatEnemy',
  'isolatedEnemy', 'lowestHealthAlly'
];
const ATTACK_POLICIES: readonly EnemyAttackPolicy[] = [
  'melee', 'ranged', 'guard', 'heal', 'summon',
  'ambush', 'charge', 'cast', 'support'
];
const MOVEMENT_POLICIES: readonly EnemyMovementPolicy[] = [
  'close', 'kite', 'holdGround', 'followAlly',
  'flank', 'charge', 'maintainDistance'
];
const NUMERIC_FIELDS = [
  'aggroRange', 'leashRange', 'attackRange', 'preferredDistance',
  'speedMultiplier', 'retreatThreshold', 'cooldownBias'
] as const;

/** Unknown/untrusted keys (including prototype names) resolve to undefined. */
export function getEnemyArchetype(id: unknown): EnemyArchetypeConfig | undefined {
  return typeof id === 'string' && Object.hasOwn(ENEMY_ARCHETYPES, id)
    ? ENEMY_ARCHETYPES[id as EnemyArchetypeId]
    : undefined;
}

function allowed<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

/**
 * Validate external archetype data without normalizing, mutating or executing it.
 * No runtime role policies, state transitions or global AI hooks are introduced.
 */
export function validateEnemyArchetype(value: unknown): value is EnemyArchetypeConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!Object.hasOwn(candidate, 'id') || !getEnemyArchetype(candidate.id)) return false;
  if (!Object.hasOwn(candidate, 'targetPriority') ||
      !allowed(TARGET_PRIORITIES, candidate.targetPriority)) return false;
  if (!Object.hasOwn(candidate, 'attackPolicy') ||
      !allowed(ATTACK_POLICIES, candidate.attackPolicy)) return false;
  if (!Object.hasOwn(candidate, 'movementPolicy') ||
      !allowed(MOVEMENT_POLICIES, candidate.movementPolicy)) return false;

  for (const field of NUMERIC_FIELDS) {
    if (!Object.hasOwn(candidate, field) ||
        typeof candidate[field] !== 'number' ||
        !Number.isFinite(candidate[field])) return false;
  }

  const aggro = candidate.aggroRange as number;
  const leash = candidate.leashRange as number;
  const range = candidate.attackRange as number;
  const preferred = candidate.preferredDistance as number;
  const speed = candidate.speedMultiplier as number;
  const retreat = candidate.retreatThreshold as number;
  const cooldown = candidate.cooldownBias as number;

  // Explicit finite caps also reject numerically valid but pathological data.
  return aggro > 0 && aggro <= 8192
    && leash >= aggro && leash <= 8192
    && range > 0 && range <= aggro
    && preferred >= 0 && preferred <= range
    && speed > 0 && speed <= 4
    && retreat >= 0 && retreat <= 1
    && cooldown > 0 && cooldown <= 4;
}
