import type { SkillAimMode } from '../input/skillAiming';

/**
 * Pure, integration-ready Warrior skill data. All distances are world units
 * (pixels), timings are seconds, and power is an attack-damage multiplier.
 * This catalog does not cast skills or alter the existing SKILLS runtime.
 */
export type WarriorAbilityId =
  | 'basicAttack'
  | 'cleave'
  | 'charge'
  | 'groundSlam'
  | 'warCry'
  | 'whirlwind'
  | 'execute';

export type WarriorAbilityTag =
  | 'MELEE'
  | 'PHYSICAL'
  | 'AREA'
  | 'MOVEMENT'
  | 'CHANNELING'
  | 'BUFF'
  | 'CONTROL'
  | 'FINISHER';

export type WarriorAbilityTarget = 'enemy' | 'self';

export interface WarriorAbilityEffect {
  /** Status ID for coordinator mapping into the canonical status registry. */
  readonly id: 'stunned' | 'warCry';
  readonly recipient: 'self' | 'enemy';
  /** Seconds for which the status remains active. */
  readonly duration: number;
  /** Status strength: 1 for stun, fractional damage bonus for War Cry. */
  readonly magnitude: number;
  /** Deterministic probability specification (0..1), not an RNG roll. */
  readonly chance: number;
}

export interface WarriorAbilityCondition {
  readonly kind: 'targetHealthAtOrBelow';
  /** Inclusive target current/max HP fraction. */
  readonly threshold: number;
  /** Power multiplier when the condition is met, instead of base power. */
  readonly bonusPower: number;
}

export interface WarriorAbilityChannel {
  /** Total active channel time in seconds. */
  readonly duration: number;
  /** Seconds between successive damage ticks, beginning at hit. */
  readonly tickInterval: number;
}

export interface WarriorAbilityDefinition {
  readonly id: WarriorAbilityId;
  readonly range: number;
  readonly cooldown: number;
  readonly rageCost: number;
  readonly rageGain: number;
  readonly power: number;
  readonly target: WarriorAbilityTarget;
  readonly aimMode: SkillAimMode;
  readonly tags: readonly WarriorAbilityTag[];
  /** Stable animation reference only; no new Phaser asset is assumed. */
  readonly animationKey: string;
  /** Cast preparation duration before the earliest valid hit. */
  readonly windup: number;
  /** Absolute hit instant since start of cast, not an extra delay. */
  readonly hit: number;
  /** Recovery duration after the hit/channel. */
  readonly recovery: number;
  readonly effects: readonly WarriorAbilityEffect[];
  /** Applies only to enemy-targeted attacks and must respect hold-position. */
  readonly autoApproach: boolean;
  /** Area radius for skills tagged AREA. */
  readonly radius?: number;
  readonly condition?: WarriorAbilityCondition;
  readonly channel?: WarriorAbilityChannel;
}

/** Ensure consumers cannot accidentally mutate static rules across sessions. */
function defineAbility(definition: WarriorAbilityDefinition): Readonly<WarriorAbilityDefinition> {
  return Object.freeze({
    ...definition,
    tags: Object.freeze([...definition.tags]),
    effects: Object.freeze(definition.effects.map(effect => Object.freeze({ ...effect }))),
    ...(definition.condition ? { condition: Object.freeze({ ...definition.condition }) } : {}),
    ...(definition.channel ? { channel: Object.freeze({ ...definition.channel }) } : {})
  });
}

/**
 * Values for Cleave/Charge deliberately mirror the currently live
 * SKILLS.WARRIOR entries; the coordinator will merge rather than replace
 * those slots when activating the full seven-skill loop.
 */
export const WARRIOR_ABILITIES: Readonly<Record<WarriorAbilityId, WarriorAbilityDefinition>> =
  Object.freeze({
    basicAttack: defineAbility({
      id: 'basicAttack',
      range: 85,
      cooldown: 0.55,
      rageCost: 0,
      rageGain: 8,
      power: 1,
      target: 'enemy',
      aimMode: 'TARGET_ENTITY',
      tags: ['MELEE', 'PHYSICAL'],
      animationKey: 'warrior.basicAttack',
      windup: 0.12,
      hit: 0.18,
      recovery: 0.26,
      effects: [],
      autoApproach: true
    }),
    cleave: defineAbility({
      id: 'cleave',
      range: 90,
      cooldown: 2.5,
      rageCost: 15,
      rageGain: 0,
      power: 1.65,
      target: 'enemy',
      aimMode: 'TARGET_ENTITY',
      tags: ['MELEE', 'PHYSICAL', 'AREA'],
      animationKey: 'warrior.cleave',
      windup: 0.22,
      hit: 0.35,
      recovery: 0.4,
      radius: 105,
      effects: [],
      autoApproach: true
    }),
    charge: defineAbility({
      id: 'charge',
      range: 245,
      cooldown: 8,
      rageCost: 0,
      rageGain: 0,
      power: 1.25,
      target: 'enemy',
      aimMode: 'DIRECTION',
      tags: ['MELEE', 'PHYSICAL', 'MOVEMENT', 'CONTROL'],
      animationKey: 'warrior.charge',
      windup: 0.15,
      hit: 0.4,
      recovery: 0.25,
      effects: [{ id: 'stunned', recipient: 'enemy', duration: 1.5, magnitude: 1, chance: 1 }],
      autoApproach: false
    }),
    groundSlam: defineAbility({
      id: 'groundSlam',
      range: 145,
      cooldown: 9,
      rageCost: 25,
      rageGain: 0,
      power: 1.35,
      target: 'self',
      aimMode: 'SELF',
      tags: ['MELEE', 'PHYSICAL', 'AREA', 'CONTROL'],
      animationKey: 'warrior.groundSlam',
      windup: 0.5,
      hit: 0.65,
      recovery: 0.45,
      radius: 145,
      effects: [{ id: 'stunned', recipient: 'enemy', duration: 1.25, magnitude: 1, chance: 1 }],
      autoApproach: false
    }),
    warCry: defineAbility({
      id: 'warCry',
      range: 170,
      cooldown: 15,
      rageCost: 0,
      rageGain: 10,
      power: 0,
      target: 'self',
      aimMode: 'SELF',
      tags: ['BUFF'],
      animationKey: 'warrior.warCry',
      windup: 0.25,
      hit: 0.3,
      recovery: 0.35,
      effects: [{ id: 'warCry', recipient: 'self', duration: 8, magnitude: 0.2, chance: 1 }],
      autoApproach: false
    }),
    whirlwind: defineAbility({
      id: 'whirlwind',
      range: 120,
      cooldown: 12,
      rageCost: 35,
      rageGain: 0,
      power: 0.7,
      target: 'self',
      aimMode: 'SELF',
      tags: ['MELEE', 'PHYSICAL', 'AREA', 'CHANNELING'],
      animationKey: 'warrior.whirlwind',
      windup: 0.2,
      hit: 0.3,
      recovery: 0.4,
      radius: 120,
      channel: { duration: 2.1, tickInterval: 0.35 },
      effects: [],
      autoApproach: false
    }),
    execute: defineAbility({
      id: 'execute',
      range: 90,
      cooldown: 5,
      rageCost: 20,
      rageGain: 0,
      power: 1.4,
      target: 'enemy',
      aimMode: 'TARGET_ENTITY',
      tags: ['MELEE', 'PHYSICAL', 'FINISHER'],
      animationKey: 'warrior.execute',
      windup: 0.3,
      hit: 0.48,
      recovery: 0.5,
      condition: { kind: 'targetHealthAtOrBelow', threshold: 0.3, bonusPower: 2.8 },
      effects: [],
      autoApproach: true
    })
  });

/** Strict lookup: rejects prototypes, non-strings, and unknown IDs. */
export function getWarriorAbility(id: unknown): WarriorAbilityDefinition | undefined {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(WARRIOR_ABILITIES, id)
    ? WARRIOR_ABILITIES[id as WarriorAbilityId]
    : undefined;
}
