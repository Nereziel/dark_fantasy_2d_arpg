import { describe, expect, it } from 'vitest';
import {
  planEnemyBehavior,
  type EnemyBehaviorActor,
  type EnemyBehaviorContext,
  type EnemyBehaviorId
} from '../../src/game/enemies/behaviorPlanner';

const actor = (id: string, x: number, y: number, health = 100, maxHealth = 100): EnemyBehaviorActor =>
  ({ id, x, y, health, maxHealth, alive: health > 0 });

function context(archetypeId: EnemyBehaviorId, overrides: Partial<EnemyBehaviorContext> = {}): EnemyBehaviorContext {
  return {
    actor: actor('enemy', 0, 0),
    origin: { x: 0, y: 0 },
    target: actor('player', 60, 0),
    allies: [],
    config: {
      archetypeId,
      aggroRange: 250,
      attackRange: 85,
      preferredDistance: 40,
      leashRange: 300,
      specialRange: 180
    },
    attackCooldown: 0,
    abilityCooldown: 0,
    lineOfSight: true,
    navigation: {
      targetReachable: true,
      originReachable: true,
      repositionReachable: true,
      retreatReachable: true,
      patrolReachable: true
    },
    ...overrides
  };
}

describe('Agent 12 — deterministic enemy behavior planner', () => {
  it('selects different tactical actions for all nine archetypes', () => {
    expect(planEnemyBehavior(context('meleeAggressor'))).toEqual({ action: 'attack', targetId: 'player' });
    expect(planEnemyBehavior(context('rangedAttacker', { target: actor('player', 15, 0) })))
      .toEqual({ action: 'reposition', destination: { x: -25, y: 0 } });
    expect(planEnemyBehavior(context('defensive', { actor: actor('enemy', 0, 0, 15) })))
      .toEqual({ action: 'flee', destination: { x: -85, y: 0 } });

    const woundedAlly = { ...actor('ally', 25, 0, 30), lineOfSight: true, reachable: true };
    expect(planEnemyBehavior(context('healer', { allies: [woundedAlly] })))
      .toEqual({ action: 'heal', targetId: 'ally' });
    expect(planEnemyBehavior(context('summoner'))).toEqual({ action: 'summon' });
    expect(planEnemyBehavior(context('ambusher', {
      config: { ...context('ambusher').config, specialRange: 35 }
    }))).toEqual({ action: 'idle' });
    expect(planEnemyBehavior(context('charger', { target: actor('player', 150, 0) })))
      .toEqual({ action: 'cast', targetId: 'player' });
    expect(planEnemyBehavior(context('caster'))).toEqual({ action: 'cast', targetId: 'player' });
    expect(planEnemyBehavior(context('support', { allies: [woundedAlly] })))
      .toEqual({ action: 'cast', targetId: 'ally' });
  });

  it('never attacks when dead and returns home when the player dies', () => {
    expect(planEnemyBehavior(context('meleeAggressor', { actor: actor('enemy', 10, 0, 0) })))
      .toEqual({ action: 'dead' });
    expect(planEnemyBehavior(context('caster', {
      actor: actor('enemy', 90, 0),
      target: actor('player', 60, 0, 0)
    }))).toEqual({ action: 'return', destination: { x: 0, y: 0 } });
  });

  it('retreats when outside its leash, even with a visible nearby player', () => {
    expect(planEnemyBehavior(context('meleeAggressor', {
      actor: actor('enemy', 310, 0),
      target: actor('player', 315, 0)
    }))).toEqual({ action: 'return', destination: { x: 0, y: 0 } });
    expect(planEnemyBehavior(context('meleeAggressor', {
      target: actor('player', 301, 0)
    }))).toEqual({ action: 'idle' });
  });

  it('respects impassable navigation paths and missing line of sight', () => {
    const base = context('meleeAggressor');
    expect(planEnemyBehavior({ ...base, navigation: { ...base.navigation, targetReachable: false } }))
      .toEqual({ action: 'idle' });
    expect(planEnemyBehavior({ ...base, lineOfSight: false }))
      .toEqual({ action: 'chase', destination: { x: 60, y: 0 } });
    expect(planEnemyBehavior({
      ...base,
      actor: actor('enemy', 90, 0),
      target: null,
      navigation: { ...base.navigation, originReachable: false }
    })).toEqual({ action: 'idle' });
  });

  it('patrols only valid, reachable locations and otherwise idles', () => {
    const base = context('meleeAggressor', { target: null, patrolTarget: { x: 15, y: 20 } });
    expect(planEnemyBehavior(base)).toEqual({ action: 'patrol', destination: { x: 15, y: 20 } });
    expect(planEnemyBehavior({ ...base, navigation: { ...base.navigation, patrolReachable: false } }))
      .toEqual({ action: 'idle' });
    expect(planEnemyBehavior({ ...base, patrolTarget: { x: Number.NaN, y: 20 } }))
      .toEqual({ action: 'idle' });
  });

  it('uses preferred range without emitting unreachable moves', () => {
    const ranged = context('rangedAttacker', {
      target: actor('player', 15, 0),
      navigation: { ...context('rangedAttacker').navigation, repositionReachable: false }
    });
    expect(planEnemyBehavior(ranged)).toEqual({ action: 'attack', targetId: 'player' });
    expect(planEnemyBehavior(context('rangedAttacker', { target: actor('player', 180, 0) })))
      .toEqual({ action: 'chase', destination: { x: 180, y: 0 } });
    expect(planEnemyBehavior(context('defensive', {
      actor: actor('enemy', 0, 0, 10),
      navigation: { ...context('defensive').navigation, retreatReachable: false }
    }))).toEqual({ action: 'attack', targetId: 'player' });
  });

  it('honors attack and ability cooldowns independently', () => {
    expect(planEnemyBehavior(context('meleeAggressor', { attackCooldown: 0.4 })))
      .toEqual({ action: 'idle' });
    expect(planEnemyBehavior(context('caster', { abilityCooldown: 1 })))
      .toEqual({ action: 'idle' });
    expect(planEnemyBehavior(context('summoner', { abilityCooldown: 2 })))
      .toEqual({ action: 'attack', targetId: 'player' });
    expect(planEnemyBehavior(context('charger', { target: actor('player', 150, 0), abilityCooldown: 2 })))
      .toEqual({ action: 'chase', destination: { x: 150, y: 0 } });
  });

  it('heals the lowest relative-health ally with a stable ID tie-break', () => {
    const ally = (id: string, health: number, x = 30) =>
      ({ ...actor(id, x, 0, health), lineOfSight: true, reachable: true });
    const base = context('healer', {
      allies: [ally('z', 30), ally('a', 30), ally('b', 55)]
    });
    expect(planEnemyBehavior(base)).toEqual({ action: 'heal', targetId: 'a' });
    expect(planEnemyBehavior({
      ...base, allies: [{ ...ally('a', 30), reachable: false }, ally('z', 30)]
    })).toEqual({ action: 'heal', targetId: 'z' });
    expect(planEnemyBehavior({
      ...base, allies: [ally('far', 25, 200)]
    })).toEqual({ action: 'chase', destination: { x: 200, y: 0 } });
  });

  it('gates ambush and charge by range and unobstructed ability use', () => {
    const ambushConfig = { ...context('ambusher').config, specialRange: 35 };
    expect(planEnemyBehavior(context('ambusher', {
      config: ambushConfig,
      target: actor('player', 30, 0)
    }))).toEqual({ action: 'attack', targetId: 'player' });
    expect(planEnemyBehavior(context('charger', {
      target: actor('player', 150, 0),
      lineOfSight: false
    }))).toEqual({ action: 'chase', destination: { x: 150, y: 0 } });
  });

  it('rejects nonfinite coordinates, invalid configuration and cooldowns deterministically', () => {
    const base = context('caster');
    for (const invalid of [
      { ...base, actor: actor('enemy', Number.NaN, 0) },
      { ...base, origin: { x: Infinity, y: 0 } },
      { ...base, attackCooldown: -1 },
      { ...base, abilityCooldown: Number.NaN },
      { ...base, config: { ...base.config, attackRange: 0 } },
      { ...base, config: { ...base.config, aggroRange: Number.POSITIVE_INFINITY } },
      { ...base, config: { ...base.config, preferredDistance: -1 } },
      { ...base, lineOfSight: undefined },
      { ...base, navigation: { ...base.navigation, targetReachable: undefined } }
    ]) {
      expect(planEnemyBehavior(invalid as EnemyBehaviorContext)).toEqual({ action: 'idle' });
    }
  });

  it('is repeatable, does not mutate frozen input, and never emits nonfinite coordinates', () => {
    const ally = Object.freeze({ ...actor('ally', 22, 5, 25), lineOfSight: true, reachable: true });
    const base = context('healer', { allies: Object.freeze([ally]) });
    const frozen = Object.freeze({
      ...base,
      actor: Object.freeze(base.actor),
      target: Object.freeze(base.target),
      origin: Object.freeze(base.origin),
      config: Object.freeze(base.config),
      navigation: Object.freeze(base.navigation)
    });
    const first = planEnemyBehavior(frozen);
    for (let i = 0; i < 10; i++) expect(planEnemyBehavior(frozen)).toEqual(first);
    expect(first).toEqual({ action: 'heal', targetId: 'ally' });
    const huge = context('rangedAttacker', { target: actor('player', Number.MAX_VALUE, 0) });
    expect(planEnemyBehavior(huge)).toEqual({ action: 'idle' });
  });
});
