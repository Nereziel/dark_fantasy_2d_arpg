import { describe, expect, it } from 'vitest';
import {
  UNDEAD_BEAST_MONSTERS, getUndeadBeastMonster,
  type UndeadBeastMonsterDefinition
} from '../../src/game/enemies/families/undeadBeasts';

const EXPECTED_IDS = [
  'skeleton', 'skeletonArcher', 'skeletonMage', 'ghoul',
  'zombie', 'wolf', 'spider', 'corruptedBoar'
];
const ARCHETYPES = new Set([
  'meleeAggressor', 'rangedAttacker', 'defensive', 'healer', 'summoner',
  'ambusher', 'charger', 'caster', 'support'
]);

function monster(id: string): UndeadBeastMonsterDefinition {
  const result = getUndeadBeastMonster(id);
  expect(result, `missing monster: ${id}`).toBeDefined();
  return result!;
}

describe('Agent 14: isolated undead and beast monster data', () => {
  it('exposes exactly eight unique, stable, locale-neutral IDs in the required families', () => {
    expect(UNDEAD_BEAST_MONSTERS.map(def => def.id)).toEqual(EXPECTED_IDS);
    expect(new Set(UNDEAD_BEAST_MONSTERS.map(def => def.id)).size).toBe(8);
    expect(UNDEAD_BEAST_MONSTERS.filter(def => def.family === 'undead')).toHaveLength(5);
    expect(UNDEAD_BEAST_MONSTERS.filter(def => def.family === 'beast')).toHaveLength(3);
    for (const def of UNDEAD_BEAST_MONSTERS) {
      expect(getUndeadBeastMonster(def.id)).toBe(def);
      expect(def.id).toMatch(/^[a-z][a-zA-Z]*$/);
      expect(ARCHETYPES.has(def.archetypeId)).toBe(true);
    }
  });

  it('supplies complete, finite gameplay stats with useful range relationships', () => {
    for (const def of UNDEAD_BEAST_MONSTERS) {
      for (const value of [
        def.health, def.speed, def.baseDamage, def.aggroRange,
        def.attackRange, def.preferredDistance
      ]) {
        expect(Number.isFinite(value), def.id).toBe(true);
        expect(value, def.id).toBeGreaterThan(0);
      }
      expect(def.attackRange, def.id).toBeLessThanOrEqual(def.aggroRange);
      expect(def.preferredDistance, def.id).toBeLessThanOrEqual(def.aggroRange);
      expect(['melee', 'ranged', 'caster', 'ambush', 'charge']).toContain(def.attackStyle);
      for (const key of [def.lootTableId, def.spriteKey, def.animationKey]) {
        expect(key).toMatch(/^[a-z][a-zA-Z0-9_]*$/);
      }
    }
  });

  it('defines valid telegraphed abilities with unique IDs and no runtime callbacks', () => {
    const ids = new Set<string>();
    for (const def of UNDEAD_BEAST_MONSTERS) {
      expect(def.abilities.length, def.id).toBeGreaterThan(0);
      for (const ability of def.abilities) {
        expect(ability.id).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        expect(ids.has(ability.id), ability.id).toBe(false);
        ids.add(ability.id);
        expect(['melee', 'projectile', 'area', 'leap', 'charge']).toContain(ability.kind);
        expect(Number.isFinite(ability.cooldownSeconds)).toBe(true);
        expect(ability.cooldownSeconds).toBeGreaterThan(0);
        expect(Number.isFinite(ability.windupSeconds)).toBe(true);
        expect(ability.windupSeconds).toBeGreaterThanOrEqual(0);
        expect(ability.windupSeconds).toBeLessThan(ability.cooldownSeconds);
        expect(Number.isFinite(ability.range)).toBe(true);
        expect(ability.range).toBeGreaterThan(0);
        expect(ability.range).toBeLessThanOrEqual(def.aggroRange);
        expect(Number.isFinite(ability.damageMultiplier)).toBe(true);
        expect(ability.damageMultiplier).toBeGreaterThanOrEqual(0);
        if (ability.areaRadius !== undefined) {
          expect(Number.isFinite(ability.areaRadius)).toBe(true);
          expect(ability.areaRadius).toBeGreaterThan(0);
        }
        if (ability.statusEffectId !== undefined) {
          expect(['poison', 'bleed', 'slow']).toContain(ability.statusEffectId);
          expect(ability.statusDurationSeconds).toBeGreaterThan(0);
          expect(Number.isFinite(ability.statusDurationSeconds)).toBe(true);
        } else {
          expect(ability.statusDurationSeconds).toBeUndefined();
        }
      }
    }
  });

  it('distinguishes melee skeleton from ranged archer and caster mage', () => {
    const skeleton = monster('skeleton');
    const archer = monster('skeletonArcher');
    const mage = monster('skeletonMage');
    expect(skeleton).toMatchObject({ attackStyle: 'melee', archetypeId: 'meleeAggressor' });
    expect(archer).toMatchObject({ attackStyle: 'ranged', archetypeId: 'rangedAttacker' });
    expect(mage).toMatchObject({ attackStyle: 'caster', archetypeId: 'caster' });
    expect(archer.attackRange).toBeGreaterThan(skeleton.attackRange * 2);
    expect(mage.preferredDistance).toBeGreaterThan(skeleton.preferredDistance * 2);
    expect(archer.abilities.some(a => a.kind === 'projectile')).toBe(true);
    expect(mage.abilities.some(a => a.kind === 'area' && a.statusEffectId === 'slow')).toBe(true);
  });

  it('models fast ambushes, a slow durable zombie and a committed charging boar', () => {
    const ghoul = monster('ghoul');
    const zombie = monster('zombie');
    const wolf = monster('wolf');
    const spider = monster('spider');
    const boar = monster('corruptedBoar');
    expect(ghoul.archetypeId).toBe('ambusher');
    expect(wolf.archetypeId).toBe('ambusher');
    expect(ghoul.abilities.some(a => a.kind === 'leap')).toBe(true);
    expect(wolf.abilities.some(a => a.kind === 'leap')).toBe(true);
    expect(zombie.archetypeId).toBe('defensive');
    expect(zombie.health).toBeGreaterThan(ghoul.health);
    expect(zombie.speed).toBeLessThan(ghoul.speed);
    expect(spider.abilities.some(a => a.statusEffectId === 'poison')).toBe(true);
    expect(spider.abilities.some(a => a.statusEffectId === 'slow')).toBe(true);
    expect(boar).toMatchObject({ attackStyle: 'charge', archetypeId: 'charger' });
    expect(boar.abilities.some(a => a.kind === 'charge' && a.range >= 180)).toBe(true);
  });

  it('contains serializable frozen definitions, including nested abilities', () => {
    expect(Object.isFrozen(UNDEAD_BEAST_MONSTERS)).toBe(true);
    for (const def of UNDEAD_BEAST_MONSTERS) {
      expect(Object.isFrozen(def), def.id).toBe(true);
      expect(Object.isFrozen(def.abilities), def.id).toBe(true);
      for (const ability of def.abilities) expect(Object.isFrozen(ability)).toBe(true);
      expect(JSON.parse(JSON.stringify(def))).toEqual(def);
    }
  });

  it('rejects unknown, inherited and invalid IDs without coercion or exceptions', () => {
    for (const id of [undefined, null, '', 'SKELETON', 'skeleton_mage',
      '__proto__', 'toString', 'constructor', 14, NaN, Infinity,
      {}, { toString: () => { throw Error('must not coerce'); } }]) {
      expect(getUndeadBeastMonster(id)).toBeUndefined();
    }
  });
});
