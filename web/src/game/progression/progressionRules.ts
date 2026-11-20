/** GPL-3.0-only — Prompt 12: pure, deterministic progression rules. */
import type { ClassId, PrimaryStats } from '../data/classes';

export const MAX_LEVEL = 100;

export interface XpCurve {
  readonly base: number;
  readonly linear: number;
  readonly quadratic: number;
  readonly maxLevel: number;
}

export const DEFAULT_XP_CURVE: Readonly<XpCurve> = Object.freeze({
  base: 80, linear: 80, quadratic: 10, maxLevel: MAX_LEVEL
});

export interface ProgressionState {
  readonly level: number;
  /** Unspent XP toward the next level, not a lifetime XP total. */
  readonly xp: number;
}

export interface ProgressionAward {
  readonly state: ProgressionState;
  readonly levelsGained: number;
  readonly skillPointsGained: number;
  readonly talentPointsGained: number;
  readonly xpApplied: number;
  readonly xpDiscarded: number;
}

export type ActivityKind = 'enemy' | 'quest' | 'boss' |
  'exploration' | 'dungeon' | 'event';

export interface LevelGrowth {
  readonly primary: PrimaryStats;
  readonly skillPoints: number;
  readonly talentPoints: number;
  readonly equipmentLevel: number;
}

export function xpRequiredForLevel(_level: number, _curve: XpCurve = DEFAULT_XP_CURVE): number {
  return 0;
}
export function awardProgression(
  _state: ProgressionState, _xp: number, _curve: XpCurve = DEFAULT_XP_CURVE
): ProgressionAward | null {
  return null;
}
export function rewardForActivity(_kind: ActivityKind, _difficulty: number, _level: number): number {
  return 0;
}
export function levelGrowth(_classId: ClassId, _level: number): LevelGrowth | null {
  return null;
}
