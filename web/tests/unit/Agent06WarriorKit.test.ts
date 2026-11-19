import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../src/game/skills/skills';
import {
  WARRIOR_ABILITIES,
  getWarriorAbility,
  type WarriorAbilityDefinition,
  type WarriorAbilityId
} from '../../src/game/skills/warriorKit';

const IDS: readonly WarriorAbilityId[] = [
  'basicAttack', 'cleave', 'charge', 'groundSlam',
  'warCry', 'whirlwind', 'execute'
];

describe('Agent 06: independent Warrior ability catalog', () => {
  it('exposes exactly the seven stable, unique Warrior IDs', () => {
    expect(Object.keys(WARRIOR_ABILITIES).sort()).toEqual([...IDS].sort());
    expect(new Set(IDS).size).toBe(7);
    for (const id of IDS) {
      expect(WARRIOR_ABILITIES[id].id).toBe(id);
      expect(getWarriorAbility(id)).toBe(WARRIOR_ABILITIES[id]);
    }
  });

  it('defines finite, positive ranges, cooldowns, timing and valid Rage economics', () => {
    for (const ability of Object.values(WARRIOR_ABILITIES)) {
      for (const value of [
        ability.range, ability.cooldown, ability.rageCost, ability.rageGain,
        ability.power, ability.windup, ability.hit, ability.recovery
      ]) {
        expect(Number.isFinite(value), ability.id).toBe(true);
        expect(value, ability.id).toBeGreaterThanOrEqual(0);
      }
      expect(ability.range, ability.id).toBeGreaterThan(0);
      expect(ability.cooldown, ability.id).toBeGreaterThan(0);
      expect(ability.windup, ability.id).toBeGreaterThan(0);
      expect(ability.hit, ability.id).toBeGreaterThanOrEqual(ability.windup);
      expect(ability.recovery, ability.id).toBeGreaterThan(0);
      expect(ability.tags.length, ability.id).toBeGreaterThan(0);
      expect(ability.animationKey.length, ability.id).toBeGreaterThan(0);
      expect(ability.autoApproach, ability.id).toEqual(expect.any(Boolean));
      for (const effect of ability.effects) {
        expect(effect.duration).toBeGreaterThan(0);
        expect(effect.magnitude).toBeGreaterThanOrEqual(0);
        expect(effect.chance).toBeGreaterThanOrEqual(0);
        expect(effect.chance).toBeLessThanOrEqual(1);
        expect([effect.duration, effect.magnitude, effect.chance].every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('preserves the existing Cleave and Charge numbers without modifying SKILLS', () => {
    const liveCleave = SKILLS.WARRIOR.rmb;
    const liveCharge = SKILLS.WARRIOR.slot1;
    for (const [catalog, live] of [
      [WARRIOR_ABILITIES.cleave, liveCleave],
      [WARRIOR_ABILITIES.charge, liveCharge]
    ] as const) {
      expect(catalog.id).toBe(live.id);
      expect(catalog.range).toBe(live.range);
      expect(catalog.cooldown).toBe(live.cooldown);
      expect(catalog.rageCost).toBe(live.cost);
      expect(catalog.power).toBe(live.power);
    }
    expect(WARRIOR_ABILITIES.charge.aimMode).toBe('DIRECTION');
    expect(WARRIOR_ABILITIES.charge.effects.some(effect => effect.id === 'stunned')).toBe(true);
  });

  it('encodes attack generation, AOE, self buff, movement, channeling and conditional finisher', () => {
    const basic = WARRIOR_ABILITIES.basicAttack;
    expect(basic.tags).toContain('MELEE');
    expect(basic.rageGain).toBeGreaterThan(0);
    expect(basic.rageCost).toBe(0);
    expect(basic.autoApproach).toBe(true);

    for (const id of ['cleave', 'groundSlam', 'whirlwind'] as const) {
      expect(WARRIOR_ABILITIES[id].tags).toContain('AREA');
      expect(WARRIOR_ABILITIES[id].radius).toBeGreaterThan(0);
    }
    expect(WARRIOR_ABILITIES.warCry.tags).toContain('BUFF');
    expect(WARRIOR_ABILITIES.warCry.target).toBe('self');
    expect(WARRIOR_ABILITIES.warCry.aimMode).toBe('SELF');
    expect(WARRIOR_ABILITIES.warCry.effects.some(effect => effect.recipient === 'self')).toBe(true);
    expect(WARRIOR_ABILITIES.charge.tags).toContain('MOVEMENT');
    expect(WARRIOR_ABILITIES.charge.autoApproach).toBe(false);
    expect(WARRIOR_ABILITIES.whirlwind.tags).toContain('CHANNELING');
    expect(WARRIOR_ABILITIES.whirlwind.channel?.duration).toBeGreaterThan(0);
    expect(WARRIOR_ABILITIES.whirlwind.channel?.tickInterval).toBeGreaterThan(0);

    const finisher = WARRIOR_ABILITIES.execute;
    expect(finisher.tags).toContain('FINISHER');
    expect(finisher.condition?.kind).toBe('targetHealthAtOrBelow');
    expect(finisher.condition?.threshold).toBeGreaterThan(0);
    expect(finisher.condition?.threshold).toBeLessThan(1);
    expect(finisher.condition?.bonusPower).toBeGreaterThan(finisher.power);
    expect(finisher.autoApproach).toBe(true);
  });

  it('uses compatible, explicit targeting and only allows approach for entity attacks', () => {
    for (const ability of Object.values(WARRIOR_ABILITIES)) {
      expect(['SELF', 'TARGET_ENTITY', 'GROUND_POSITION', 'DIRECTION', 'AREA']).toContain(ability.aimMode);
      if (ability.autoApproach) {
        expect(ability.target).toBe('enemy');
        expect(ability.aimMode).toBe('TARGET_ENTITY');
      }
      if (ability.target === 'self') expect(ability.autoApproach).toBe(false);
    }
  });

  it('returns undefined for unknown, inherited, or malformed identifiers', () => {
    for (const invalid of [
      '', 'CleAWe', 'unknown', 'constructor', '__proto__', 'toString',
      null, undefined, 0, Number.NaN, {}, ['cleave']
    ]) {
      expect(getWarriorAbility(invalid)).toBeUndefined();
    }
  });

  it('publishes immutable definitions, nested effects and optional execution metadata', () => {
    expect(Object.isFrozen(WARRIOR_ABILITIES)).toBe(true);
    for (const ability of Object.values(WARRIOR_ABILITIES) as WarriorAbilityDefinition[]) {
      expect(Object.isFrozen(ability)).toBe(true);
      expect(Object.isFrozen(ability.tags)).toBe(true);
      expect(Object.isFrozen(ability.effects)).toBe(true);
      for (const effect of ability.effects) expect(Object.isFrozen(effect)).toBe(true);
      if (ability.condition) expect(Object.isFrozen(ability.condition)).toBe(true);
      if (ability.channel) expect(Object.isFrozen(ability.channel)).toBe(true);
    }
  });
});
