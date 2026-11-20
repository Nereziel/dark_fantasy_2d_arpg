import { describe, expect, it } from 'vitest';
import { CLASS_IDS, CLASSES, type ClassId } from '../../src/game/data/classes';
import {
  DEFAULT_XP_CURVE, MAX_LEVEL,
  awardProgression, levelGrowth, rewardForActivity, xpRequiredForLevel,
  type ActivityKind, type ProgressionState, type XpCurve
} from '../../src/game/progression/progressionRules';

describe('Agent 16: XP threshold and configurable progression curves', () => {
  it('uses a deterministic increasing quadratic curve, with no threshold at cap', () => {
    expect(xpRequiredForLevel(1)).toBe(80);
    expect(xpRequiredForLevel(2)).toBe(170);
    expect(xpRequiredForLevel(3)).toBe(280);
    expect(xpRequiredForLevel(99)).toBe(103960);
    expect(xpRequiredForLevel(MAX_LEVEL)).toBe(0);
    expect(xpRequiredForLevel(98)).toBeLessThan(xpRequiredForLevel(99));
  });

  it('respects a custom curve including its own level cap', () => {
    const curve: XpCurve = Object.freeze({ base: 20, linear: 5, quadratic: 0, maxLevel: 3 });
    expect(xpRequiredForLevel(1, curve)).toBe(20);
    expect(xpRequiredForLevel(2, curve)).toBe(25);
    expect(xpRequiredForLevel(3, curve)).toBe(0);
    const result = awardProgression({ level: 1, xp: 0 }, 51, curve);
    expect(result).toEqual({
      state: { level: 3, xp: 0 }, levelsGained: 2,
      skillPointsGained: 2, talentPointsGained: 0,
      xpApplied: 45, xpDiscarded: 6
    });
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, MAX_LEVEL + 1])(
    'rejects invalid levels for the XP curve: %s', (level) => {
      expect(xpRequiredForLevel(level)).toBe(0);
    }
  );

  it.each([
    { ...DEFAULT_XP_CURVE, base: 0 },
    { ...DEFAULT_XP_CURVE, linear: -2 },
    { ...DEFAULT_XP_CURVE, quadratic: NaN },
    { ...DEFAULT_XP_CURVE, maxLevel: Infinity },
    { ...DEFAULT_XP_CURVE, maxLevel: 0 },
    { ...DEFAULT_XP_CURVE, maxLevel: MAX_LEVEL + 1 }
  ])('rejects invalid curve options: %j', (curve) => {
    expect(xpRequiredForLevel(1, curve)).toBe(0);
    expect(awardProgression({ level: 1, xp: 0 }, 100, curve)).toBeNull();
  });
});

describe('Agent 16: awarding XP and level-up points', () => {
  it('respects below-threshold, exact-threshold, and zero-XP boundaries', () => {
    const base: ProgressionState = Object.freeze({ level: 1, xp: 0 });
    expect(awardProgression(base, 0)).toEqual({
      state: base, levelsGained: 0, skillPointsGained: 0,
      talentPointsGained: 0, xpApplied: 0, xpDiscarded: 0
    });
    expect(awardProgression(base, 79)?.state).toEqual({ level: 1, xp: 79 });
    expect(awardProgression(base, 80)).toEqual({
      state: { level: 2, xp: 0 }, levelsGained: 1, skillPointsGained: 1,
      talentPointsGained: 0, xpApplied: 80, xpDiscarded: 0
    });
    expect(base).toEqual({ level: 1, xp: 0 });
  });

  it('carries unspent XP across multiple level-ups deterministically', () => {
    const base = { level: 1, xp: 0 };
    expect(awardProgression(base, 80 + 170 + 14)).toEqual({
      state: { level: 3, xp: 14 }, levelsGained: 2,
      skillPointsGained: 2, talentPointsGained: 0,
      xpApplied: 264, xpDiscarded: 0
    });
    const first = awardProgression(base, 264);
    expect(awardProgression(base, 264)).toEqual(first);
    expect(base).toEqual({ level: 1, xp: 0 });
  });

  it('grants one talent point each fifth level, and a skill point each level', () => {
    expect(awardProgression({ level: 4, xp: 400 }, 10)).toEqual({
      state: { level: 5, xp: 0 }, levelsGained: 1,
      skillPointsGained: 1, talentPointsGained: 1,
      xpApplied: 10, xpDiscarded: 0
    });
    const fromOne = awardProgression({ level: 1, xp: 0 }, 1_000_000);
    expect(fromOne?.levelsGained).toBeGreaterThanOrEqual(10);
    expect(fromOne?.skillPointsGained).toBe(fromOne?.levelsGained);
    // Each fifth reached level grants a talent, not each fifth XP gain.
    const toEleven = [2,3,4,5,6,7,8,9,10].reduce((sum, level) =>
      sum + xpRequiredForLevel(level), xpRequiredForLevel(1));
    expect(awardProgression({ level: 1, xp: 0 }, toEleven)?.talentPointsGained).toBe(2);
  });

  it('enforces cap without numeric overflow, discarding surplus XP', () => {
    const result = awardProgression({ level: 1, xp: 0 }, Number.MAX_SAFE_INTEGER);
    expect(result?.state).toEqual({ level: MAX_LEVEL, xp: 0 });
    expect(result?.levelsGained).toBe(MAX_LEVEL - 1);
    expect(result?.skillPointsGained).toBe(MAX_LEVEL - 1);
    expect(result?.talentPointsGained).toBe(20);
    expect(result?.xpApplied).toBeGreaterThan(0);
    expect(result?.xpApplied).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(result!.xpApplied + result!.xpDiscarded).toBe(Number.MAX_SAFE_INTEGER);
    expect(awardProgression({ level: MAX_LEVEL, xp: 0 }, 150)).toEqual({
      state: { level: MAX_LEVEL, xp: 0 }, levelsGained: 0,
      skillPointsGained: 0, talentPointsGained: 0,
      xpApplied: 0, xpDiscarded: 150
    });
  });

  it.each([-1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1.5])(
    'rejects invalid XP awards: %s', (xp) => {
      expect(awardProgression({ level: 1, xp: 0 }, xp)).toBeNull();
    }
  );

  it.each([
    { level: 0, xp: 0 }, { level: -1, xp: 0 }, { level: Infinity, xp: 0 },
    { level: NaN, xp: 0 }, { level: 1.2, xp: 0 },
    { level: 1, xp: NaN }, { level: 1, xp: -1 },
    { level: 1, xp: 80 }, { level: MAX_LEVEL, xp: 1 },
    { level: MAX_LEVEL + 1, xp: 0 }
  ])('rejects invalid/noncanonical saved progression: %j', (state) => {
    expect(awardProgression(state, 1)).toBeNull();
  });
});

describe('Agent 16: activity rewards and difficulty scaling', () => {
  it('provides deterministic base rewards for every supported activity', () => {
    const kinds: readonly ActivityKind[] = [
      'enemy', 'quest', 'boss', 'exploration', 'dungeon', 'event'
    ];
    expect(kinds.map(kind => rewardForActivity(kind, 1, 1)))
      .toEqual([40, 120, 220, 35, 180, 90]);
  });

  it('rewards higher-level challenges while reducing trivial farming', () => {
    const equal = rewardForActivity('enemy', 10, 10);
    const difficult = rewardForActivity('enemy', 12, 10);
    const trivial = rewardForActivity('enemy', 1, 10);
    expect([equal, difficult, trivial]).toEqual([69, 83, 14]);
    expect(difficult).toBeGreaterThan(equal);
    expect(trivial).toBeLessThan(equal);
    expect(rewardForActivity('enemy', 1, 100)).toBeGreaterThanOrEqual(1);
    expect(rewardForActivity('enemy', 100, 1)).toBe(80);
  });

  it.each([
    ['enemy', 0, 1], ['enemy', NaN, 1], ['enemy', Infinity, 1],
    ['enemy', -1, 1], ['enemy', 1.25, 1],
    ['enemy', 1, 0], ['enemy', 1, MAX_LEVEL + 1],
    ['enemy', 1, NaN], ['missing', 1, 1]
  ])('never rewards invalid activity input %s/%s/%s', (kind, difficulty, level) => {
    expect(rewardForActivity(kind as ActivityKind, difficulty as number, level as number)).toBe(0);
  });
});

describe('Agent 16: per-class level growth', () => {
  it('grants zero initial growth and typed, class-specific increases thereafter', () => {
    expect(levelGrowth('WARRIOR', 1)).toEqual({
      primary: { strength: 0, dexterity: 0, intelligence: 0, vitality: 0, willpower: 0 },
      skillPoints: 0, talentPoints: 0, equipmentLevel: 1
    });
    expect(levelGrowth('WARRIOR', 2)).toEqual({
      primary: { strength: 2, dexterity: 1, intelligence: 0, vitality: 2, willpower: 0 },
      skillPoints: 1, talentPoints: 0, equipmentLevel: 2
    });
    expect(levelGrowth('MAGE', 5)).toEqual({
      primary: { strength: 0, dexterity: 1, intelligence: 2, vitality: 0, willpower: 2 },
      skillPoints: 1, talentPoints: 1, equipmentLevel: 5
    });
    expect(levelGrowth('WARRIOR', 10)?.primary.strength).toBe(3);
  });

  it('returns fresh immutable calculations and does not mutate class bases', () => {
    const originals = structuredClone(CLASSES);
    for (const id of CLASS_IDS) {
      const first = levelGrowth(id, 10)!;
      expect(first).toEqual(levelGrowth(id, 10));
      expect(Object.values(first.primary).every(v => Number.isSafeInteger(v) && v >= 0)).toBe(true);
      expect(Object.values(first.primary).reduce((sum, n) => sum + n, 0)).toBe(6);
      first.primary.strength = 999;
      expect(levelGrowth(id, 10)?.primary.strength).not.toBe(999);
    }
    expect(CLASSES).toEqual(originals);
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, MAX_LEVEL + 1])(
    'rejects invalid target levels: %s', (level) => {
      expect(levelGrowth('WARRIOR', level)).toBeNull();
    }
  );

  it('rejects an unknown class ID without casting/mutating definitions', () => {
    expect(levelGrowth('MISSING' as ClassId, 2)).toBeNull();
  });
});
