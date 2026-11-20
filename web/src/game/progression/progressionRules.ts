/**
 * GPL-3.0-only — Prompt 12: pure, deterministic progression rules.
 *
 * This module has no runtime, UI, save, clock or RNG dependencies.
 * XP is the *remainder toward the next level*, matching current CharacterProgress.
 * The coordinator must explicitly integrate the new curve and points into saves/UI.
 */
import { isClassId, type ClassId, type PrimaryStats } from '../data/classes';

/** A bounded progression avoids unbounded level loops and XP overflow. */
export const MAX_LEVEL = 100;

export interface XpCurve {
  /** XP required to advance from level 1. */
  readonly base: number;
  /** Additional XP for each level after level 1. */
  readonly linear: number;
  /** Quadratic cost of increasingly high levels. */
  readonly quadratic: number;
  /** Last attainable level; at this level there is no next-level requirement. */
  readonly maxLevel: number;
}

/**
 * At level L below cap: base + linear*(L-1) + quadratic*(L-1)^2.
 * Level 1 keeps the old 80-XP first threshold, but later thresholds diverge
 * deliberately from the existing runtime formula L*80.
 */
export const DEFAULT_XP_CURVE: Readonly<XpCurve> = Object.freeze({
  base: 80, linear: 80, quadratic: 10, maxLevel: MAX_LEVEL
});

export interface ProgressionState {
  readonly level: number;
  /** Nonnegative, integer XP below this level's next threshold; 0 at cap. */
  readonly xp: number;
}

/** Rewards are DELTAS; the owner of persistent skill/talent points applies them. */
export interface ProgressionAward {
  readonly state: ProgressionState;
  readonly levelsGained: number;
  readonly skillPointsGained: number;
  readonly talentPointsGained: number;
  /** Portion of awarded XP consumed by levels or retained toward the next one. */
  readonly xpApplied: number;
  /** XP not accepted because the character reached the hard cap. */
  readonly xpDiscarded: number;
}

/** Stable, localization-independent activity IDs. */
export type ActivityKind = 'enemy' | 'quest' | 'boss' |
  'exploration' | 'dungeon' | 'event';

/**
 * Per-level increases when REACHING `level`, not total attributes at that level.
 * `equipmentLevel` describes the new equipment eligibility tier.
 */
export interface LevelGrowth {
  readonly primary: PrimaryStats;
  readonly skillPoints: number;
  readonly talentPoints: number;
  readonly equipmentLevel: number;
}

const MAX_CURVE_TERM = 1_000_000;
const isBoundedInteger = (value: number, min: number, max: number): boolean =>
  Number.isSafeInteger(value) && value >= min && value <= max;

function validCurve(curve: XpCurve): boolean {
  return !!curve && typeof curve === 'object'
    && isBoundedInteger(curve.base, 1, MAX_CURVE_TERM)
    && isBoundedInteger(curve.linear, 0, MAX_CURVE_TERM)
    && isBoundedInteger(curve.quadratic, 0, MAX_CURVE_TERM)
    && isBoundedInteger(curve.maxLevel, 1, MAX_LEVEL);
}

function validLevel(level: number, maximum: number): boolean {
  return isBoundedInteger(level, 1, maximum);
}

/**
 * Returns 0 for invalid inputs or at the level cap; never emits a nonfinite
 * requirement. Curve coefficients must be nonnegative, bounded integers.
 */
export function xpRequiredForLevel(level: number, curve: XpCurve = DEFAULT_XP_CURVE): number {
  if (!validCurve(curve) || !validLevel(level, curve.maxLevel) || level === curve.maxLevel) return 0;
  const offset = level - 1;
  // All terms stay well inside safe integers for the maximum allowed curve/level.
  return curve.base + curve.linear * offset + curve.quadratic * offset * offset;
}

function validState(state: ProgressionState, curve: XpCurve): boolean {
  if (!state || typeof state !== 'object' || !validLevel(state.level, curve.maxLevel)
    || !Number.isSafeInteger(state.xp) || state.xp < 0) return false;
  return state.level === curve.maxLevel
    ? state.xp === 0
    : state.xp < xpRequiredForLevel(state.level, curve);
}

const talentPointsForLevel = (level: number): number => level % 5 === 0 ? 1 : 0;

/**
 * Awards nonnegative integer XP without mutating state.
 *
 * Invalid/noncanonical state, unsafe/fractional XP, or invalid curves return
 * null (never silently repair save data). Iteration is bounded by maxLevel.
 * The algorithm subtracts each threshold BEFORE adding remainder so even
 * Number.MAX_SAFE_INTEGER cannot overflow the XP accumulator.
 */
export function awardProgression(
  state: ProgressionState, xp: number, curve: XpCurve = DEFAULT_XP_CURVE
): ProgressionAward | null {
  if (!validCurve(curve) || !validState(state, curve)
    || !Number.isSafeInteger(xp) || xp < 0) return null;

  let level = state.level;
  let remainder = state.xp;
  let unspentAward = xp;
  let levelsGained = 0;
  let talentPointsGained = 0;

  while (level < curve.maxLevel) {
    const remainingToLevel = xpRequiredForLevel(level, curve) - remainder;
    if (unspentAward < remainingToLevel) {
      remainder += unspentAward;
      unspentAward = 0;
      break;
    }

    unspentAward -= remainingToLevel;
    level += 1;
    remainder = 0;
    levelsGained += 1;
    talentPointsGained += talentPointsForLevel(level);
  }

  return {
    state: { level, xp: remainder },
    levelsGained,
    skillPointsGained: levelsGained,
    talentPointsGained,
    xpApplied: xp - unspentAward,
    xpDiscarded: unspentAward
  };
}

/** Baseline XP granted by activity at level 1 with equal difficulty. */
const ACTIVITY_BASE_XP: Readonly<Record<ActivityKind, number>> = Object.freeze({
  enemy: 40,
  quest: 120,
  boss: 220,
  exploration: 35,
  dungeon: 180,
  event: 90
});

/**
 * `difficulty` is encounter/activity level (1..100), not a percentage.
 * Scale base rewards 8% per character level, then challenge factor changes
 * by 10% per level difference, clamped to [20%, 200%].
 * Invalid activities/levels return zero so no invalid XP may enter progression.
 */
export function rewardForActivity(kind: ActivityKind, difficulty: number, level: number): number {
  if (!Object.prototype.hasOwnProperty.call(ACTIVITY_BASE_XP, kind)
    || !validLevel(difficulty, MAX_LEVEL) || !validLevel(level, MAX_LEVEL)) return 0;

  const challengeFactor = Math.max(0.2, Math.min(2, 1 + (difficulty - level) * 0.1));
  return Math.round(ACTIVITY_BASE_XP[kind] * (1 + (level - 1) * 0.08) * challengeFactor);
}

/** Per-class, per-level attribute deltas. Every class gets five points/level. */
const GROWTH_BY_CLASS: Readonly<Record<ClassId, Readonly<PrimaryStats>>> = {
  WARRIOR: { strength: 2, dexterity: 1, intelligence: 0, vitality: 2, willpower: 0 },
  PALADIN: { strength: 1, dexterity: 0, intelligence: 1, vitality: 2, willpower: 1 },
  MAGE: { strength: 0, dexterity: 1, intelligence: 2, vitality: 0, willpower: 2 },
  ROGUE: { strength: 1, dexterity: 2, intelligence: 0, vitality: 1, willpower: 1 },
  NECROMANCER: { strength: 0, dexterity: 1, intelligence: 2, vitality: 1, willpower: 1 },
  WARLOCK: { strength: 0, dexterity: 0, intelligence: 2, vitality: 1, willpower: 2 }
};

/** Every tenth level earns an additional point in the class focus attribute. */
const CLASS_FOCUS: Readonly<Record<ClassId, keyof PrimaryStats>> = {
  WARRIOR: 'strength',
  PALADIN: 'vitality',
  MAGE: 'intelligence',
  ROGUE: 'dexterity',
  NECROMANCER: 'intelligence',
  WARLOCK: 'willpower'
};

/**
 * Returns a fresh, self-contained gain for reaching target level.
 * Level 1 is creation: no level-up points or attribute gains.
 * Invalid class/level returns null, without touching CLASSES or equipment.
 */
export function levelGrowth(classId: ClassId, level: number): LevelGrowth | null {
  if (!isClassId(classId) || !validLevel(level, MAX_LEVEL)) return null;
  const primary: PrimaryStats = level === 1
    ? { strength: 0, dexterity: 0, intelligence: 0, vitality: 0, willpower: 0 }
    : { ...GROWTH_BY_CLASS[classId] };
  if (level > 1 && level % 10 === 0) primary[CLASS_FOCUS[classId]] += 1;

  return {
    primary,
    skillPoints: level === 1 ? 0 : 1,
    talentPoints: level === 1 ? 0 : talentPointsForLevel(level),
    equipmentLevel: level
  };
}
