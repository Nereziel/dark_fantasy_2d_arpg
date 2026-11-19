import { describe, expect, it } from 'vitest';
import {
  BANDIT_CULTIST_MONSTERS,
  getBanditCultistMonster,
  type BanditCultistMonsterId
} from '../../src/game/enemies/families/banditsCultists';

const IDS: readonly BanditCultistMonsterId[] = [
  'banditFighter', 'banditArcher', 'banditRogue',
  'fanatic', 'cultMage', 'cultHealer'
];

describe('Agent 15: isolated Act I bandit and cultist definitions', () => {
  it('contains exactly six stable, unique, language-neutral monster IDs', () => {
    expect(BANDIT_CULTIST_MONSTERS.map(monster => monster.id)).toEqual(IDS);
    expect(new Set(BANDIT_CULTIST_MONSTERS.map(monster => monster.id)).size).toBe(6);
    expect(BANDIT_CULTIST_MONSTERS.filter(monster => monster.family === 'bandit')).toHaveLength(3);
    expect(BANDIT_CULTIST_MONSTERS.filter(monster => monster.family === 'cultist')).toHaveLength(3);
  });

  it('supports safe lookup for valid IDs and rejects malformed or inherited IDs', () => {
    for (const monster of BANDIT_CULTIST_MONSTERS) {
      expect(getBanditCultistMonster(monster.id)).toBe(monster);
    }
    for (const invalid of [
      '', 'BanditFighter', 'banditFighter ', 'unknown', '__proto__',
      'constructor', 'toString', null, undefined, -1, NaN, {}, []
    ]) {
      expect(getBanditCultistMonster(invalid)).toBeUndefined();
    }
  });

  it('maps each combat role to its intended independent AI archetype', () => {
    const roles = [
      ['banditFighter', 'meleeAggressor', 'melee'],
      ['banditArcher', 'rangedAttacker', 'ranged'],
      ['banditRogue', 'ambusher', 'melee'],
      ['fanatic', 'charger', 'melee'],
      ['cultMage', 'caster', 'magic'],
      ['cultHealer', 'healer', 'support']
    ] as const;
    for (const [id, archetypeId, attackStyle] of roles) {
      expect(getBanditCultistMonster(id)).toMatchObject({ archetypeId, attackStyle });
    }
  });

  it('provides finite positive combat statistics and valid positioning distances', () => {
    for (const monster of BANDIT_CULTIST_MONSTERS) {
      for (const key of [
        'health', 'speed', 'baseDamage', 'aggroRange',
        'attackRange', 'preferredDistance'
      ] as const) {
        expect(Number.isFinite(monster[key]), `${monster.id}.${key}`).toBe(true);
        expect(monster[key], `${monster.id}.${key}`).toBeGreaterThan(0);
      }
      expect(monster.preferredDistance).toBeLessThanOrEqual(monster.attackRange);
      expect(monster.attackRange).toBeLessThanOrEqual(monster.aggroRange);
      expect(monster.spriteKey.length).toBeGreaterThan(0);
      expect(monster.animationKey.length).toBeGreaterThan(0);
      expect(monster.lootTableId.length).toBeGreaterThan(0);
      expect(monster.abilities.length).toBeGreaterThan(0);
    }
  });

  it('offers tactical differences between frontline, ranged, ambusher and charger roles', () => {
    const fighter = getBanditCultistMonster('banditFighter')!;
    const archer = getBanditCultistMonster('banditArcher')!;
    const rogue = getBanditCultistMonster('banditRogue')!;
    const fanatic = getBanditCultistMonster('fanatic')!;
    expect(archer.attackRange).toBeGreaterThan(fighter.attackRange * 2);
    expect(archer.preferredDistance).toBeGreaterThan(fighter.preferredDistance);
    expect(rogue.speed).toBeGreaterThan(fighter.speed);
    expect(rogue.abilities.some(ability => ability.id === 'backstab' && ability.kind === 'damage')).toBe(true);
    expect(fanatic.abilities.some(ability => ability.id === 'recklessRush' && ability.kind === 'damage')).toBe(true);
  });

  it('defines executable-looking typed action metadata, not labels-only abilities', () => {
    for (const monster of BANDIT_CULTIST_MONSTERS) {
      const abilityIds = new Set<string>();
      for (const ability of monster.abilities) {
        expect(abilityIds.has(ability.id)).toBe(false);
        abilityIds.add(ability.id);
        expect(ability.id.length).toBeGreaterThan(0);
        expect(Number.isFinite(ability.cooldown)).toBe(true);
        expect(ability.cooldown).toBeGreaterThan(0);
        expect(Number.isFinite(ability.range)).toBe(true);
        expect(ability.range).toBeGreaterThan(0);
        expect(ability.range).toBeLessThanOrEqual(monster.aggroRange);
        if (ability.kind === 'damage' || ability.kind === 'heal') {
          expect(Number.isFinite(ability.amount)).toBe(true);
          expect(ability.amount).toBeGreaterThan(0);
          expect(ability.target).toBe(ability.kind === 'heal' ? 'lowestHealthAlly' : 'enemy');
        } else {
          expect(Number.isFinite(ability.magnitude)).toBe(true);
          expect(ability.magnitude).toBeGreaterThan(0);
          expect(ability.magnitude).toBeLessThanOrEqual(1);
          expect(Number.isFinite(ability.duration)).toBe(true);
          expect(ability.duration).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives cultists real healing, ally buff, spell and debuff action metadata', () => {
    const healer = getBanditCultistMonster('cultHealer')!;
    const mage = getBanditCultistMonster('cultMage')!;
    const fanatic = getBanditCultistMonster('fanatic')!;
    expect(healer.abilities).toContainEqual(expect.objectContaining({
      id: 'unholyMend', kind: 'heal', target: 'lowestHealthAlly',
      amount: expect.any(Number), cooldown: expect.any(Number), range: expect.any(Number)
    }));
    expect(healer.abilities.some(ability => ability.kind === 'buff' && ability.target === 'nearbyAllies')).toBe(true);
    expect(mage.abilities.some(ability => ability.kind === 'damage' && ability.target === 'enemy')).toBe(true);
    expect(mage.abilities.some(ability => ability.kind === 'debuff' && ability.target === 'enemy')).toBe(true);
    expect(fanatic.abilities.some(ability => ability.kind === 'buff' && ability.target === 'nearbyAllies')).toBe(true);
  });

  it('exposes immutable catalog entries, ability collections and ability metadata', () => {
    expect(Object.isFrozen(BANDIT_CULTIST_MONSTERS)).toBe(true);
    for (const monster of BANDIT_CULTIST_MONSTERS) {
      expect(Object.isFrozen(monster)).toBe(true);
      expect(Object.isFrozen(monster.abilities)).toBe(true);
      for (const ability of monster.abilities) {
        expect(Object.isFrozen(ability)).toBe(true);
      }
    }
  });

  it('returns stable objects and never mutates the catalog during lookup', () => {
    const originalIds = BANDIT_CULTIST_MONSTERS.map(monster => monster.id);
    for (let index = 0; index < 5; index += 1) {
      for (const id of IDS) {
        const monster = getBanditCultistMonster(id);
        expect(monster).toBe(BANDIT_CULTIST_MONSTERS.find(candidate => candidate.id === id));
      }
    }
    expect(BANDIT_CULTIST_MONSTERS.map(monster => monster.id)).toEqual(originalIds);
  });
});
