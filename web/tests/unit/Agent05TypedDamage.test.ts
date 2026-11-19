import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/game/data/items';
import {
  resolveHealing, resolveTypedDamage, type DamageRequest, type DamageType,
  type RandomSource
} from '../../src/game/combat/typedDamage';

const steadyRng = (): RandomSource => ({ next: () => 0.5 });

function scriptedRng(rolls: number[]): { rng: RandomSource; calls: () => number } {
  let index = 0;
  return { rng: { next: () => rolls[index++] ?? 0.5 }, calls: () => index };
}

describe('Agent 05: isolated typed combat damage', () => {
  it('uses armor for physical damage, then applies physical resistance', () => {
    expect(resolveTypedDamage({ type: 'physical', base: 100, defenderArmor: 50, defenderLevel: 1 }, steadyRng())).toMatchObject({
      damage: 50, absorbed: 0, shieldRemaining: 0,
      critical: false, dodged: false, blocked: false
    });
    expect(resolveTypedDamage({ type: 'physical', base: 100, defenderArmor: 50, resistancePercent: 20 }, steadyRng()).damage).toBe(40);
  });

  it('bypasses armor for elemental/special damage but respects resistance', () => {
    const types: DamageType[] = ['physical', 'fire', 'frost', 'lightning', 'poison', 'holy', 'shadow', 'arcane'];
    for (const type of types) {
      expect(resolveTypedDamage({ type, base: 100, defenderArmor: 0 }, steadyRng()).damage).toBe(100);
    }
    for (const type of types.filter(type => type !== 'physical')) {
      expect(resolveTypedDamage({ type, base: 100, defenderArmor: 500, resistancePercent: 25 }, steadyRng()).damage).toBe(75);
    }
  });

  it('applies attacker multiplier, critical hit and block in that order', () => {
    const critical = resolveTypedDamage({ type: 'fire', base: 100, critChance: 100, critMultiplier: 1.7 }, steadyRng());
    expect(critical).toMatchObject({ damage: 170, critical: true, blocked: false });
    const blocked = resolveTypedDamage({ type: 'fire', base: 100, critChance: 100, blockChance: 100, blockReduction: 0.5 }, steadyRng());
    expect(blocked).toMatchObject({ damage: 85, critical: true, blocked: true });
    expect(resolveTypedDamage({ type: 'shadow', base: 50, multiplier: 2 }, steadyRng()).damage).toBe(100);
  });

  it('prioritizes a successful dodge over critical/block, retaining shields', () => {
    expect(resolveTypedDamage({ type: 'physical', base: 100, dodgeChance: 100, critChance: 100, blockChance: 100, shield: 20 }, steadyRng()))
      .toEqual({ damage: 0, absorbed: 0, shieldRemaining: 20, critical: false, dodged: true, blocked: false });
  });

  it('absorbs post-mitigation damage with a shield and preserves unused shield', () => {
    expect(resolveTypedDamage({ type: 'arcane', base: 100, shield: 60 }, steadyRng()))
      .toMatchObject({ damage: 40, absorbed: 60, shieldRemaining: 0 });
    expect(resolveTypedDamage({ type: 'arcane', base: 100, shield: 200 }, steadyRng()))
      .toMatchObject({ damage: 0, absorbed: 100, shieldRemaining: 100 });
  });

  it('consumes exactly three rolls per attempted hit, in dodge/crit/block order', () => {
    const dodged = scriptedRng([0.05, 0.05, 0.05]);
    const request: DamageRequest = { type: 'fire', base: 100, dodgeChance: 10, critChance: 50, blockChance: 50 };
    expect(resolveTypedDamage(request, dodged.rng).dodged).toBe(true);
    expect(dodged.calls()).toBe(3);

    const hit = scriptedRng([0.2, 0.1, 0.1]);
    expect(resolveTypedDamage(request, hit.rng)).toMatchObject({ damage: 85, dodged: false, critical: true, blocked: true });
    expect(hit.calls()).toBe(3);

    const zeroDamage = scriptedRng([0.5, 0.5, 0.5]);
    resolveTypedDamage({ type: 'poison', base: 0 }, zeroDamage.rng);
    expect(zeroDamage.calls()).toBe(3);
  });

  it('produces repeatable outcomes with the same seeded RNG sequence', () => {
    const request: DamageRequest = {
      type: 'physical', base: 125, multiplier: 1.15,
      defenderArmor: 30, defenderLevel: 3, resistancePercent: 15,
      critChance: 35, dodgeChance: 12, blockChance: 25, shield: 20
    };
    const a = new SeededRng(1979);
    const b = new SeededRng(1979);
    const sequenceA = Array.from({ length: 20 }, () => resolveTypedDamage(request, a));
    const sequenceB = Array.from({ length: 20 }, () => resolveTypedDamage(request, b));
    expect(sequenceA).toEqual(sequenceB);
    expect(a.state).toBe(b.state);
  });

  it('leaves even deeply frozen requests untouched', () => {
    const request: Readonly<DamageRequest> = Object.freeze({ type: 'physical', base: 100, shield: 65, defenderArmor: 25 });
    const before = { ...request };
    resolveTypedDamage(request, steadyRng());
    expect(request).toEqual(before);
  });

  it('clamps invalid numeric inputs without negative or nonfinite outputs', () => {
    const cases: DamageRequest[] = [
      { type: 'physical', base: -100, shield: -20 },
      { type: 'fire', base: Number.NaN, multiplier: Number.POSITIVE_INFINITY },
      { type: 'frost', base: Number.POSITIVE_INFINITY, shield: Number.NaN },
      { type: 'lightning', base: 100, multiplier: -10, defenderArmor: Number.NaN },
      { type: 'physical', base: 100, defenderArmor: Number.NaN, defenderLevel: -1, shield: Number.NEGATIVE_INFINITY },
      { type: 'shadow', base: 100, critChance: Number.NaN, blockChance: Number.POSITIVE_INFINITY, resistancePercent: -20 },
      { type: 'holy', base: 100, critChance: 500, critMultiplier: -1, blockChance: 1000, blockReduction: Number.NaN },
      { type: 'arcane', base: Number.MAX_VALUE, multiplier: Number.MAX_VALUE, shield: Number.MAX_VALUE }
    ];
    for (const request of cases) {
      const result = resolveTypedDamage(request, steadyRng());
      for (const value of [result.damage, result.absorbed, result.shieldRemaining]) {
        expect(Number.isFinite(value), JSON.stringify(request)).toBe(true);
        expect(value, JSON.stringify(request)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(resolveTypedDamage({ type: 'fire', base: 100, resistancePercent: 500 }, steadyRng()).damage).toBe(0);
    expect(resolveTypedDamage({ type: 'fire', base: 100, resistancePercent: -50 }, steadyRng()).damage).toBe(100);
    expect(resolveTypedDamage({ type: 'fire', base: 100, defenderArmor: Number.NaN, shield: Number.NaN }, steadyRng()).damage).toBe(100);
    expect(resolveTypedDamage({ type: 'fire', base: 100, blockChance: 100, blockReduction: 2 }, steadyRng()).damage).toBe(0);
  });

  it('ignores malformed RNG values except unconditional 100% probabilities', () => {
    const malformed = scriptedRng([Number.NaN, -1, Number.POSITIVE_INFINITY]);
    expect(resolveTypedDamage({ type: 'fire', base: 100, dodgeChance: 50, critChance: 50, blockChance: 50 }, malformed.rng))
      .toMatchObject({ damage: 100, dodged: false, critical: false, blocked: false });
    expect(malformed.calls()).toBe(3);
    const always = scriptedRng([1, 1, 1]);
    expect(resolveTypedDamage({ type: 'fire', base: 100, critChance: 100, blockChance: 100 }, always.rng))
      .toMatchObject({ damage: 85, critical: true, blocked: true });
  });
});

describe('Agent 05: isolated healing calculation', () => {
  it('caps healing at maximum health and ignores negative healing', () => {
    expect(resolveHealing(50, 60, 25)).toEqual({ health: 60, healed: 10 });
    expect(resolveHealing(0, 100, -5)).toEqual({ health: 0, healed: 0 });
    expect(resolveHealing(85, 100, 4)).toEqual({ health: 89, healed: 4 });
  });

  it('sanitizes invalid health and heal inputs without reviving above max', () => {
    expect(resolveHealing(120, 100, 20)).toEqual({ health: 100, healed: 0 });
    expect(resolveHealing(-20, 100, Number.NaN)).toEqual({ health: 0, healed: 0 });
    expect(resolveHealing(Number.POSITIVE_INFINITY, 100, 20)).toEqual({ health: 20, healed: 20 });
    expect(resolveHealing(20, Number.NaN, 20)).toEqual({ health: 0, healed: 0 });
    expect(resolveHealing(0, 50, Number.POSITIVE_INFINITY)).toEqual({ health: 0, healed: 0 });
    expect(resolveHealing(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE)).toEqual({ health: Number.MAX_SAFE_INTEGER, healed: 0 });
  });
});
