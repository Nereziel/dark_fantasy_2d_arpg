import { describe, expect, it } from 'vitest';
import {
  ENEMY_ARCHETYPES,
  getEnemyArchetype,
  validateEnemyArchetype,
  type EnemyArchetypeConfig,
  type EnemyArchetypeId
} from '../../src/game/enemies/archetypeCatalog';

const IDS: readonly EnemyArchetypeId[] = [
  'meleeAggressor',
  'rangedAttacker',
  'defensive',
  'healer',
  'summoner',
  'ambusher',
  'charger',
  'caster',
  'support'
];

describe('Agent 13: isolated enemy archetype catalog', () => {
  it('defines exactly nine canonical, retrievable archetypes', () => {
    expect(Object.keys(ENEMY_ARCHETYPES).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const config = getEnemyArchetype(id);
      expect(config).toBe(ENEMY_ARCHETYPES[id]);
      expect(config?.id).toBe(id);
      expect(validateEnemyArchetype(config)).toBe(true);
    }
  });

  it('provides complete, finite and bounded tactical configuration for every role', () => {
    const required: readonly (keyof EnemyArchetypeConfig)[] = [
      'id', 'aggroRange', 'leashRange', 'attackRange', 'preferredDistance',
      'speedMultiplier', 'retreatThreshold', 'cooldownBias', 'targetPriority',
      'attackPolicy', 'movementPolicy'
    ];
    for (const config of Object.values(ENEMY_ARCHETYPES)) {
      expect(Object.keys(config).sort()).toEqual([...required].sort());
      for (const key of [
        'aggroRange', 'leashRange', 'attackRange', 'preferredDistance',
        'speedMultiplier', 'retreatThreshold', 'cooldownBias'
      ] as const) {
        expect(Number.isFinite(config[key]), `${config.id}.${key}`).toBe(true);
      }
      expect(config.aggroRange).toBeGreaterThan(0);
      expect(config.leashRange).toBeGreaterThanOrEqual(config.aggroRange);
      expect(config.attackRange).toBeGreaterThan(0);
      expect(config.attackRange).toBeLessThanOrEqual(config.aggroRange);
      expect(config.preferredDistance).toBeGreaterThanOrEqual(0);
      expect(config.preferredDistance).toBeLessThanOrEqual(config.attackRange);
      expect(config.speedMultiplier).toBeGreaterThan(0);
      expect(config.cooldownBias).toBeGreaterThan(0);
      expect(config.retreatThreshold).toBeGreaterThanOrEqual(0);
      expect(config.retreatThreshold).toBeLessThanOrEqual(1);
    }
  });

  it('distinguishes frontline, ranged and healing behavior instead of changing only numbers', () => {
    const melee = ENEMY_ARCHETYPES.meleeAggressor;
    const ranged = ENEMY_ARCHETYPES.rangedAttacker;
    const healer = ENEMY_ARCHETYPES.healer;
    expect(melee.attackPolicy).toBe('melee');
    expect(melee.movementPolicy).toBe('close');
    expect(melee.targetPriority).toBe('nearestEnemy');
    expect(ranged.attackPolicy).toBe('ranged');
    expect(ranged.movementPolicy).toBe('kite');
    expect(ranged.attackRange).toBeGreaterThan(melee.attackRange);
    expect(ranged.preferredDistance).toBeGreaterThan(melee.preferredDistance);
    expect(healer.attackPolicy).toBe('heal');
    expect(healer.movementPolicy).toBe('followAlly');
    expect(healer.targetPriority).toBe('lowestHealthAlly');
    expect(healer.retreatThreshold).toBeGreaterThan(melee.retreatThreshold);
    expect(new Set(Object.values(ENEMY_ARCHETYPES).map(role => role.attackPolicy)).size).toBe(9);
    expect(ENEMY_ARCHETYPES.ambusher.movementPolicy).toBe('flank');
    expect(ENEMY_ARCHETYPES.charger.movementPolicy).toBe('charge');
    expect(ENEMY_ARCHETYPES.defensive.movementPolicy).toBe('holdGround');
  });

  it('rejects unknown IDs and prototype properties without throwing', () => {
    for (const id of [
      'unknown', '', '__proto__', 'constructor', 'toString', 'MeleeAggressor',
      null, undefined, 1, Number.NaN, {}, []
    ]) {
      expect(getEnemyArchetype(id)).toBeUndefined();
    }
    expect(validateEnemyArchetype({ ...ENEMY_ARCHETYPES.meleeAggressor, id: '__proto__' })).toBe(false);
    expect(validateEnemyArchetype(Object.create(ENEMY_ARCHETYPES.meleeAggressor))).toBe(false);
  });

  it('rejects invalid and nonfinite numeric fields, cross-field range errors and unknown policies', () => {
    const base = ENEMY_ARCHETYPES.meleeAggressor;
    const patches: readonly Record<string, unknown>[] = [
      { aggroRange: 0 }, { aggroRange: -10 }, { aggroRange: Number.NaN },
      { aggroRange: Number.POSITIVE_INFINITY }, { leashRange: Number.NEGATIVE_INFINITY },
      { leashRange: base.aggroRange - 1 }, { attackRange: 0 },
      { attackRange: base.aggroRange + 1 }, { preferredDistance: -1 },
      { preferredDistance: base.attackRange + 1 }, { speedMultiplier: 0 },
      { speedMultiplier: Number.NaN }, { cooldownBias: 0 },
      { cooldownBias: Number.POSITIVE_INFINITY }, { retreatThreshold: -0.01 },
      { retreatThreshold: 1.01 }, { retreatThreshold: Number.NaN },
      { targetPriority: 'unknown' }, { attackPolicy: 'unknown' },
      { movementPolicy: 'unknown' }, { id: 'unknown' }
    ];
    for (const patch of patches) {
      expect(validateEnemyArchetype({ ...base, ...patch }), JSON.stringify(patch)).toBe(false);
    }
    for (const invalid of [null, 2, true, '', [], {}]) {
      expect(validateEnemyArchetype(invalid)).toBe(false);
    }
    const withoutField = { ...base } as Record<string, unknown>;
    delete withoutField.attackPolicy;
    expect(validateEnemyArchetype(withoutField)).toBe(false);
  });

  it('keeps the registry and configs immutable, and never mutates supplied values', () => {
    expect(Object.isFrozen(ENEMY_ARCHETYPES)).toBe(true);
    for (const config of Object.values(ENEMY_ARCHETYPES)) {
      expect(Object.isFrozen(config)).toBe(true);
    }
    const independentCopy = { ...ENEMY_ARCHETYPES.caster };
    expect(validateEnemyArchetype(independentCopy)).toBe(true);
    expect(independentCopy).toEqual(ENEMY_ARCHETYPES.caster);
  });
});
