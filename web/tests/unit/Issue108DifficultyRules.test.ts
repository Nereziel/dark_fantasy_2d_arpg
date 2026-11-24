/** Prompt 53 / #108 — pure rule contract. GPL-3.0-only. */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_MODES, difficultyProfile, regionEnemyLevel, planEncounterDifficulty,
  scaleEncounterReward, isDifficultyMode } from '../../src/game/progression/difficultyRules';

describe('bounded difficulty rules', () => {
  it('uses the existing loot difficulty IDs and keeps normal multipliers neutral', () => {
    expect(DIFFICULTY_MODES).toEqual(['normal', 'veteran', 'nightmare', 'hell']);
    expect(difficultyProfile('normal')).toEqual({
      health: 1, damage: 1, aggression: 1, cooldown: 1, eliteChanceBonus: 0,
      supportChanceBonus: 0, xp: 1, gold: 1
    });
    expect(isDifficultyMode('constructor')).toBe(false);
    expect(difficultyProfile('unknown')).toBeNull();
  });

  it('bounds authored enemy levels by region, not the player level', () => {
    expect(regionEnemyLevel('wilderness', 1)).toBe(1);
    expect(regionEnemyLevel('wilderness', 100)).toBe(10);
    expect(regionEnemyLevel('crypt', 1)).toBe(3);
    expect(regionEnemyLevel('crypt', 100)).toBe(12);
    for (const invalid of [NaN, Infinity, 0, -1, 1.5, 101]) {
      expect(regionEnemyLevel('wilderness', invalid)).toBeNull();
    }
    expect(regionEnemyLevel('constructor', 1)).toBeNull();
  });

  it('keeps the encounter size unchanged, but makes elite/support choices more likely', () => {
    const base = { region: 'wilderness', authoredLevel: 7, eliteChance: .1, supportChance: .1,
      eliteRoll: .2, supportRoll: .2 };
    const normal = planEncounterDifficulty({ ...base, mode: 'normal' });
    const hell = planEncounterDifficulty({ ...base, mode: 'hell' });
    expect(normal?.elite).toBe(false);
    expect(normal?.support).toBe(false);
    expect(hell?.elite).toBe(true);
    expect(hell?.support).toBe(true);
    expect(hell?.enemyLevel).toBe(normal?.enemyLevel);
    expect(hell?.profile.damage).toBeGreaterThan(normal!.profile.damage);
    expect(hell?.profile.cooldown).toBeLessThan(normal!.profile.cooldown);
    expect(hell).toEqual(planEncounterDifficulty({ ...base, mode: 'hell' }));
    expect(planEncounterDifficulty({ ...base, mode: 'hell', eliteChance: 1, eliteRoll: .999 })?.elite).toBe(true);
    for (const bad of [-.1, 1, NaN, Infinity]) {
      expect(planEncounterDifficulty({ ...base, mode: 'hell', eliteRoll: bad })).toBeNull();
    }
    expect(planEncounterDifficulty({ ...base, mode: 'normal', supportChance: 1.1 })).toBeNull();
  });

  it('scales combat rewards by regional encounter level, mode and overlevel penalty', () => {
    const base = { mode: 'normal', region: 'wilderness', authoredLevel: 5, playerLevel: 5,
      baseXp: 40, baseGold: 10 };
    expect(scaleEncounterReward(base)).toEqual({ xp: 40, gold: 10, lootDifficulty: 'normal', enemyLevel: 5 });
    const hell = scaleEncounterReward({ ...base, mode: 'hell' })!;
    expect(hell.xp).toBeGreaterThan(40);
    expect(hell.gold).toBeGreaterThan(10);
    expect(hell.lootDifficulty).toBe('hell');
    const overlevel = scaleEncounterReward({ ...base, mode: 'hell', playerLevel: 100 })!;
    expect(overlevel.xp).toBeLessThan(40);
    expect(overlevel.gold).toBeLessThan(10);
    expect(overlevel.enemyLevel).toBe(5);
    expect(scaleEncounterReward({ ...base, playerLevel: 1 })?.xp).toBe(40);
    expect(scaleEncounterReward({ ...base, baseXp: 0, baseGold: 0 })).toMatchObject({ xp: 0, gold: 0 });
    for (const bad of [NaN, Infinity, -1, .1, Number.MAX_SAFE_INTEGER]) {
      expect(scaleEncounterReward({ ...base, baseXp: bad })).toBeNull();
    }
    expect(scaleEncounterReward({ ...base, playerLevel: 101 })).toBeNull();
  });

  it('does not expose mutable profile configuration', () => {
    const first = difficultyProfile('veteran')!;
    expect(Object.isFrozen(first)).toBe(true);
    expect(difficultyProfile('veteran')).toEqual(first);
  });
});
