/** Prompt 53 / #108 — pure, provisional difficulty rules. GPL-3.0-only.
 * No UI, persistence, random source or simulation mutation. A future runtime
 * integration must lock the mode for an encounter and its reward settlement,
 * choose support from the existing roster (not increase its size), and retain
 * one-shot reward guards. These values are tuning candidates, not live balance.
 */
import type { LootDifficulty } from '../loot/lootTables';
import type { ZoneId } from '../core/types';
import { MAX_LEVEL } from './progressionRules';

export const DIFFICULTY_MODES = Object.freeze(
  ['normal', 'veteran', 'nightmare', 'hell'] as const satisfies readonly LootDifficulty[]
);
export interface DifficultyProfile {
  readonly health: number;
  readonly damage: number;
  readonly aggression: number;
  readonly cooldown: number;
  readonly eliteChanceBonus: number;
  readonly supportChanceBonus: number;
  readonly xp: number;
  readonly gold: number;
}
const PROFILES: Readonly<Record<LootDifficulty, DifficultyProfile>> = Object.freeze({
  normal: Object.freeze({ health: 1, damage: 1, aggression: 1, cooldown: 1,
    eliteChanceBonus: 0, supportChanceBonus: 0, xp: 1, gold: 1 }),
  veteran: Object.freeze({ health: 1.12, damage: 1.15, aggression: 1.10, cooldown: .94,
    eliteChanceBonus: .08, supportChanceBonus: .08, xp: 1.15, gold: 1.10 }),
  nightmare: Object.freeze({ health: 1.26, damage: 1.32, aggression: 1.20, cooldown: .87,
    eliteChanceBonus: .16, supportChanceBonus: .16, xp: 1.35, gold: 1.25 }),
  hell: Object.freeze({ health: 1.40, damage: 1.50, aggression: 1.30, cooldown: .80,
    eliteChanceBonus: .25, supportChanceBonus: .24, xp: 1.60, gold: 1.45 })
});
export function isDifficultyMode(value: unknown): value is LootDifficulty {
  return typeof value === 'string' && Object.hasOwn(PROFILES, value);
}
export function difficultyProfile(mode: unknown): DifficultyProfile | null {
  return isDifficultyMode(mode) ? PROFILES[mode] : null;
}

/** Only existing regions are defined. New acts must explicitly add bands. */
const REGION_BANDS: Readonly<Record<ZoneId, readonly [number, number]>> = {
  wilderness: [1, 10],
  crypt: [3, 12]
};
function validLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= MAX_LEVEL;
}
function isRegion(value: unknown): value is ZoneId {
  return typeof value === 'string' && Object.hasOwn(REGION_BANDS, value);
}
/** Authored encounter progression, never live player level, selects the tier. */
export function regionEnemyLevel(region: unknown, authoredLevel: unknown): number | null {
  if (!isRegion(region) || !validLevel(authoredLevel)) return null;
  const [minimum, maximum] = REGION_BANDS[region];
  return Math.max(minimum, Math.min(maximum, authoredLevel));
}
function validChance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
function validRoll(value: unknown): value is number {
  return validChance(value) && value < 1;
}
interface EncounterInput {
  mode: unknown;
  region: unknown;
  authoredLevel: unknown;
  eliteChance: unknown;
  supportChance: unknown;
  /** Independent samples supplied by the caller's existing seeded RNG. */
  eliteRoll: unknown;
  supportRoll: unknown;
}
export interface EncounterDifficultyPlan {
  readonly enemyLevel: number;
  readonly profile: DifficultyProfile;
  readonly elite: boolean;
  /** Prefer a support/tactical unit in an eligible existing roster slot. */
  readonly support: boolean;
}
export function planEncounterDifficulty(input: EncounterInput): EncounterDifficultyPlan | null {
  if (!input || typeof input !== 'object') return null;
  const profile = difficultyProfile(input.mode);
  const enemyLevel = regionEnemyLevel(input.region, input.authoredLevel);
  if (!profile || enemyLevel === null
    || !validChance(input.eliteChance) || !validChance(input.supportChance)
    || !validRoll(input.eliteRoll) || !validRoll(input.supportRoll)) return null;
  return {
    enemyLevel, profile,
    elite: input.eliteRoll < Math.min(1, input.eliteChance + profile.eliteChanceBonus),
    support: input.supportRoll < Math.min(1, input.supportChance + profile.supportChanceBonus)
  };
}

interface RewardInput {
  mode: unknown;
  region: unknown;
  authoredLevel: unknown;
  playerLevel: unknown;
  /** Base encounter rewards calculated from enemy level, NOT player level. */
  baseXp: unknown;
  baseGold: unknown;
}
const MAX_BASE_REWARD = 1_000_000;
function validReward(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= 0 && value <= MAX_BASE_REWARD;
}
/** Combat rewards only. Never call for a one-shot quest or guaranteed item.
 * Overlevel combat rewards taper to 20%; underlevel heroes get no farm bonus.
 * Loot uses the existing difficulty tables and the same bounded enemy level.
 */
export function scaleEncounterReward(input: RewardInput): {
  xp: number; gold: number; lootDifficulty: LootDifficulty; enemyLevel: number;
} | null {
  if (!input || typeof input !== 'object' || !isDifficultyMode(input.mode)) return null;
  const enemyLevel = regionEnemyLevel(input.region, input.authoredLevel);
  if (enemyLevel === null || !validLevel(input.playerLevel)
    || !validReward(input.baseXp) || !validReward(input.baseGold)) return null;
  const profile = PROFILES[input.mode];
  const penalty = Math.max(.2, 1 - Math.max(0, input.playerLevel - enemyLevel) * .08);
  return {
    xp: Math.round(input.baseXp * profile.xp * penalty),
    gold: Math.round(input.baseGold * profile.gold * penalty),
    lootDifficulty: input.mode, enemyLevel
  };
}
