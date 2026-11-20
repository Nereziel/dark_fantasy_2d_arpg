import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/game/data/items';
import {
  ELITE_MODIFIER_IDS, ELITE_MODIFIERS, getEliteModifier,
  validateEliteSet, rollEliteModifiers, applyEliteStats,
  eliteOnHitPlan, eliteOnPeriodicPlan, eliteOnDeathPlan,
  type EliteModifierId
} from '../../src/game/enemies/eliteModifiers';

const IDs: readonly EliteModifierId[] = [
  'extraHealth', 'increasedDamage', 'fast', 'fireAura',
  'frostAttacks', 'poisonAttacks', 'teleporting', 'shielded',
  'regenerating', 'summoner', 'explodesOnDeath', 'hazardousGround'
];
const STATS = Object.freeze({ health: 100, baseDamage: 20, speed: 100 });
const POSITION = Object.freeze({ x: 400, y: 500 });

describe('Agent 21 — isolated elite modifiers (Prompt 17)', () => {
  it('defines exactly twelve stable, immutable effects and safe lookups', () => {
    expect(ELITE_MODIFIER_IDS).toEqual(IDs);
    expect(Object.keys(ELITE_MODIFIERS).sort()).toEqual([...IDs].sort());
    expect(new Set(IDs).size).toBe(12);
    expect(Object.isFrozen(ELITE_MODIFIER_IDS)).toBe(true);
    expect(Object.isFrozen(ELITE_MODIFIERS)).toBe(true);
    for (const id of IDs) {
      const entry = ELITE_MODIFIERS[id];
      expect(getEliteModifier(id)).toBe(entry);
      expect(entry.id).toBe(id);
      expect(entry.weight).toBeGreaterThan(0);
      expect(Number.isFinite(entry.weight)).toBe(true);
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.excludes)).toBe(true);
      expect(Object.isFrozen(entry.requires)).toBe(true);
      expect(Object.isFrozen(entry.statMultipliers)).toBe(true);
      expect(Object.isFrozen(entry.visualTags)).toBe(true);
      for (const numeric of Object.values(entry.statMultipliers)) {
        expect(Number.isFinite(numeric)).toBe(true);
        expect(numeric).toBeGreaterThan(0);
      }
    }
    for (const invalid of [
      'unknown', '__proto__', 'constructor', 'toString', '', null,
      undefined, 1, NaN, {}, ['fast']
    ]) expect(getEliteModifier(invalid)).toBeUndefined();
  });

  it('validates order-independent compatibility, exclusions, prerequisites and 0–3 cap', () => {
    expect(validateEliteSet([])).toBe(true); // neutral non-elite
    expect(validateEliteSet(['fast'])).toBe(true);
    expect(validateEliteSet(['fast', 'teleporting'])).toBe(true);
    expect(validateEliteSet(['teleporting', 'fast'])).toBe(true);
    expect(validateEliteSet(['extraHealth', 'summoner'])).toBe(true);
    expect(validateEliteSet(['fast', 'teleporting', 'explodesOnDeath'])).toBe(true);
    for (const invalid of [
      ['teleporting'], ['summoner'], ['frostAttacks', 'poisonAttacks'],
      ['poisonAttacks', 'frostAttacks'], ['shielded', 'regenerating'],
      ['fireAura', 'hazardousGround'], ['fast', 'fast'],
      ['extraHealth', 'increasedDamage', 'fast', 'shielded'],
      ['__proto__'], ['constructor'], ['unknown'],
      ['fast', 3], null, undefined, {}, 'fast'
    ]) expect(validateEliteSet(invalid), JSON.stringify(invalid)).toBe(false);
  });

  it('rolls feasible weighted sets with supplied seeded RNG, regardless of pool order', () => {
    const a = new SeededRng(0x12345);
    const b = new SeededRng(0x12345);
    const seqA = Array.from({ length: 100 }, () => rollEliteModifiers({ count: 3 }, a));
    const seqB = Array.from({ length: 100 }, () => rollEliteModifiers({ count: 3 }, b));
    expect(seqA).toEqual(seqB);
    expect(a.state).toBe(b.state);
    for (const set of seqA) {
      expect(set).not.toBeNull();
      expect(set).toHaveLength(3);
      expect(validateEliteSet(set)).toBe(true);
    }
    expect(new Set(seqA.map(ids => ids?.join(','))).size).toBeGreaterThan(3);

    const restricted = { count: 2, pool: ['teleporting', 'fast'] };
    expect(rollEliteModifiers(restricted, new SeededRng(3))).toEqual(['fast', 'teleporting']);
    expect(rollEliteModifiers({ ...restricted, pool: [...restricted.pool].reverse(), required: ['teleporting'] }, new SeededRng(3)))
      .toEqual(['fast', 'teleporting']);
    expect(rollEliteModifiers({ count: 2, required: ['extraHealth', 'summoner'] }, new SeededRng(2)))
      .toEqual(['extraHealth', 'summoner']);
  });

  it('distinguishes 0 modifiers from impossible or malformed selection, without RNG fallbacks', () => {
    let called = 0;
    const rng = { next: () => { called++; return 0.5; } };
    expect(rollEliteModifiers({ count: 0 }, rng)).toEqual([]);
    expect(called).toBe(0);
    expect(rollEliteModifiers({ count: 1, pool: ['teleporting'] }, rng)).toBeNull();
    expect(called).toBe(0);
    expect(rollEliteModifiers({ count: 1, pool: [] }, rng)).toBeNull();
    expect(rollEliteModifiers({ count: 2, required: ['shielded', 'regenerating'] }, rng)).toBeNull();
    for (const config of [
      {}, null, { count: -1 }, { count: 4 }, { count: NaN },
      { count: Infinity }, { count: 1.5 }, { count: 1, pool: 'fast' },
      { count: 1, pool: ['unknown'] }, { count: 1, pool: ['fast', 'fast'] },
      { count: 1, required: ['fast', 'fast'] }, { count: 1, required: ['fast', 'extraHealth'] },
      { count: 1, pool: ['poisonAttacks'], required: ['fast'] }
    ]) expect(rollEliteModifiers(config, rng), JSON.stringify(config)).toBeNull();
    expect(called).toBe(0);
    for (const value of [NaN, -0.1, 1, Infinity, -Infinity]) {
      expect(rollEliteModifiers({ count: 1 }, { next: () => value })).toBeNull();
    }
    expect(rollEliteModifiers({ count: 1 }, null)).toBeNull();
    expect(rollEliteModifiers({ count: 1 }, { next: () => { throw Error('bad RNG'); } })).toBeNull();
  });

  it('applies multiplicative stats once, projects shield and loot/visual tags, never mutates', () => {
    const modifiers = Object.freeze(['extraHealth', 'increasedDamage', 'fast'] as const);
    const plan = applyEliteStats(STATS, modifiers);
    expect(plan).toMatchObject({
      maxHealth: 150, baseDamage: 27, speed: 140, shield: 0,
      delta: { health: 50, baseDamage: 7, speed: 40 },
      lootQualityTag: 'eliteMythic'
    });
    expect(plan?.visualTags).toContain('elite');
    expect(plan?.modifierIds).toEqual(['extraHealth', 'increasedDamage', 'fast']);
    expect(applyEliteStats(STATS, [])).toMatchObject({
      maxHealth: 100, baseDamage: 20, speed: 100,
      shield: 0, lootQualityTag: 'normal'
    });
    expect(applyEliteStats(STATS, ['shielded'])).toMatchObject({
      maxHealth: 100, shield: 40, lootQualityTag: 'elite'
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan?.delta)).toBe(true);
    expect(Object.isFrozen(plan?.modifierIds)).toBe(true);
    expect(Object.isFrozen(plan?.visualTags)).toBe(true);
    expect(STATS).toEqual({ health: 100, baseDamage: 20, speed: 100 });
    expect(modifiers).toEqual(['extraHealth', 'increasedDamage', 'fast']);
    expect(applyEliteStats(STATS, ['fast', 'teleporting'])).toEqual(
      applyEliteStats(STATS, ['teleporting', 'fast'])
    );
  });

  it('rejects invalid numbers / modifier sets without emitting Infinity or silent adjustments', () => {
    for (const invalid of [
      { ...STATS, health: 0 }, { ...STATS, health: -1 },
      { ...STATS, health: NaN }, { ...STATS, speed: Infinity },
      { ...STATS, baseDamage: -1 }, { ...STATS, speed: -Infinity },
      { ...STATS, health: 1e15 }, { ...STATS, baseDamage: NaN },
      {}, null, []
    ]) expect(applyEliteStats(invalid, ['fast'])).toBeNull();
    expect(applyEliteStats(STATS, ['teleporting'])).toBeNull();
    expect(applyEliteStats(STATS, ['__proto__'])).toBeNull();
    expect(applyEliteStats(STATS, ['fast', 'fast'])).toBeNull();
  });

  it('only emits on-hit statuses after landed positive damage, with distinct CRIT behavior', () => {
    const hit = { sourceId: 'elite-1', targetId: 'player', hit: true, critical: false, damage: 12 };
    expect(eliteOnHitPlan(['frostAttacks'], hit)).toMatchObject([
      { kind: 'status', statusId: 'chilled', sourceId: 'elite-1', targetId: 'player', trigger: 'hit' }
    ]);
    expect(eliteOnHitPlan(['frostAttacks'], { ...hit, critical: true })).toMatchObject([
      { kind: 'status', statusId: 'frozen', trigger: 'critical' }
    ]);
    const poison = eliteOnHitPlan(['poisonAttacks'], hit);
    expect(poison).toMatchObject([{ kind: 'status', statusId: 'poisoned' }]);
    const normalStatus = poison?.find(action => action.kind === 'status');
    const criticalStatus = eliteOnHitPlan(['poisonAttacks'], { ...hit, critical: true })
      ?.find(action => action.kind === 'status');
    expect(criticalStatus?.magnitude).toBeGreaterThan(normalStatus?.magnitude ?? 0);
    for (const bad of [
      { ...hit, hit: false }, { ...hit, damage: 0 }, { ...hit, damage: NaN },
      { ...hit, damage: Infinity }, { ...hit, targetId: '' }, { ...hit, critical: 1 }
    ]) {
      const result = eliteOnHitPlan(['frostAttacks'], bad);
      if (bad.damage === 0 || bad.hit === false) expect(result).toEqual([]);
      else expect(result).toBeNull();
    }
    expect(eliteOnHitPlan([], hit)).toEqual([]);
    expect(eliteOnHitPlan(['frostAttacks', 'poisonAttacks'], hit)).toBeNull();
  });

  it('plans periodic fire/regen/hazards/summons/teleport without changing game state', () => {
    const ctx = Object.freeze({
      actorId: 'elite-1', position: POSITION, elapsedSeconds: 0.9, deltaSeconds: 0.2
    });
    const result = eliteOnPeriodicPlan(['fireAura', 'regenerating'], ctx);
    expect(result?.actions.some(x => x.kind === 'telegraph' && x.telegraphId === 'fireAura')).toBe(true);
    expect(result?.actions.some(x => x.kind === 'damage' && x.damageType === 'fire')).toBe(true);
    expect(result?.actions.some(x => x.kind === 'status' && x.statusId === 'regeneration')).toBe(true);
    expect(result?.suppressedActions).toBe(0);
    expect(eliteOnPeriodicPlan(['hazardousGround', 'extraHealth'], { ...ctx, elapsedSeconds: 4.9, deltaSeconds: 0.2 })
      ?.actions.some(x => x.kind === 'hazard')).toBe(true);
    expect(eliteOnPeriodicPlan(['extraHealth', 'summoner'], { ...ctx, elapsedSeconds: 7.9, deltaSeconds: 0.2 })
      ?.actions.some(x => x.kind === 'summon')).toBe(true);
    expect(eliteOnPeriodicPlan(['fast', 'teleporting'], { ...ctx, elapsedSeconds: 6.9, deltaSeconds: 0.2 })
      ?.actions.some(x => x.kind === 'teleport')).toBe(true);
    expect(eliteOnPeriodicPlan([], ctx)).toEqual({ actions: [], suppressedActions: 0 });
    expect(eliteOnPeriodicPlan(['fireAura'], { ...ctx, elapsedSeconds: 0.2, deltaSeconds: 0.2 })?.actions).toEqual([]);
    expect(eliteOnPeriodicPlan(['fireAura'], { ...ctx, elapsedSeconds: 0, deltaSeconds: 60 })?.suppressedActions)
      .toBeGreaterThan(0);
    expect(ctx.position).toEqual(POSITION);
  });

  it('enforces death one-shot by consumed marker and emits only plan descriptors', () => {
    const context = Object.freeze({
      actorId: 'elite-1', position: POSITION, alive: false, alreadyTriggered: false
    });
    const before = eliteOnDeathPlan(['explodesOnDeath'], context);
    expect(before?.eventKey).toBe('elite-1:explodesOnDeath');
    expect(before?.actions).toMatchObject([
      { kind: 'telegraph', telegraphId: 'deathExplosion' },
      { kind: 'damage', damageType: 'fire' }
    ]);
    expect(before?.actions.every(x => Object.isFrozen(x))).toBe(true);
    expect(eliteOnDeathPlan(['explodesOnDeath'], { ...context, alreadyTriggered: true }))
      .toEqual({ eventKey: null, actions: [] });
    expect(eliteOnDeathPlan(['explodesOnDeath'], { ...context, alive: true }))
      .toEqual({ eventKey: null, actions: [] });
    expect(eliteOnDeathPlan(['fast'], context)).toEqual({ eventKey: null, actions: [] });
    expect(eliteOnDeathPlan(['explodesOnDeath'], { ...context, position: { x: NaN, y: 0 } })).toBeNull();
    expect(eliteOnDeathPlan(['explodesOnDeath'], { ...context, actorId: '__proto__' })).toBeNull();
  });

  it('validates invalid periodic inputs, preserves event/position immutability and caps plans', () => {
    const ctx = { actorId: 'e1', position: POSITION, elapsedSeconds: 0, deltaSeconds: 1 };
    const result = eliteOnPeriodicPlan(['fireAura'], ctx);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.actions)).toBe(true);
    expect(result?.actions.every(x => Object.isFrozen(x))).toBe(true);
    for (const bad of [
      { ...ctx, elapsedSeconds: NaN }, { ...ctx, elapsedSeconds: -1 },
      { ...ctx, deltaSeconds: Infinity }, { ...ctx, deltaSeconds: -1 },
      { ...ctx, position: { x: -1, y: 0 } }, { ...ctx, actorId: '' },
      { ...ctx, position: { x: Number.MAX_VALUE, y: 2 } }
    ]) expect(eliteOnPeriodicPlan(['fireAura'], bad)).toBeNull();
  });
});
