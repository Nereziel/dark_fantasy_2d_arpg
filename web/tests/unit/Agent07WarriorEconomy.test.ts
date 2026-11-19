import { describe, expect, it } from 'vitest';
import {
  advanceWarriorCooldowns,
  applyWarriorRageDelta,
  canActivateWarriorSkill,
  spendAndStartCooldown,
  type WarriorActivationRequest,
  type WarriorEconomyState,
  type WarriorEconomySkill
} from '../../src/game/skills/warriorEconomy';

const cleave: WarriorEconomySkill = {
  id: 'cleave', cost: 15, cooldown: 2.5, range: 90,
  target: 'enemy', autoApproach: true, silenceRestricted: true, movementSkill: false
};

const state = (): WarriorEconomyState => ({
  rage: 40, maxRage: 100, cooldowns: { cleave: 0, charge: 0 }
});

const request = (overrides: Partial<WarriorActivationRequest> = {}): WarriorActivationRequest => ({
  skill: cleave,
  state: state(),
  actor: { x: 0, y: 0, alive: true },
  target: { x: 40, y: 0, alive: true },
  stunned: false,
  silenced: false,
  holdPosition: false,
  canMove: true,
  ...overrides
});

describe('Agent 07: Warrior Rage, cooldown and cast eligibility', () => {
  it('accepts an in-range attack and spends Rage only on a ready execution', () => {
    const input = request();
    expect(canActivateWarriorSkill(input)).toEqual({ status: 'ready' });
    const result = spendAndStartCooldown(input);
    expect(result.decision).toEqual({ status: 'ready' });
    expect(result.state).toEqual({
      rage: 25, maxRage: 100, cooldowns: { cleave: 2.5, charge: 0 }
    });
    expect(input.state).toEqual(state());
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.cooldowns)).toBe(true);
  });

  it('blocks insufficient Rage and active cooldowns without spending anything', () => {
    const lowRage = request({ state: { ...state(), rage: 14.99 } });
    expect(canActivateWarriorSkill(lowRage)).toEqual({ status: 'blocked', reason: 'rage' });
    expect(spendAndStartCooldown(lowRage).state).toEqual(lowRage.state);

    const coolingDown = request({ state: { ...state(), cooldowns: { cleave: 0.01 } } });
    expect(canActivateWarriorSkill(coolingDown)).toEqual({ status: 'blocked', reason: 'cooldown' });
    expect(spendAndStartCooldown(coolingDown).state).toEqual(coolingDown.state);
  });

  it('blocks dead, stunned and silenced casters; silence may exempt a basic attack', () => {
    expect(canActivateWarriorSkill(request({ actor: { x: 0, y: 0, alive: false } })))
      .toEqual({ status: 'blocked', reason: 'dead' });
    expect(canActivateWarriorSkill(request({ stunned: true })))
      .toEqual({ status: 'blocked', reason: 'stunned' });
    expect(canActivateWarriorSkill(request({ silenced: true })))
      .toEqual({ status: 'blocked', reason: 'silenced' });

    const basicAttack: WarriorEconomySkill = {
      ...cleave, id: 'basicAttack', cost: 0, cooldown: 0, silenceRestricted: false
    };
    expect(canActivateWarriorSkill(request({ skill: basicAttack, silenced: true })))
      .toEqual({ status: 'ready' });
  });

  it('rejects invalid enemy and ground targets instead of approaching them', () => {
    for (const target of [null, undefined, { x: Number.NaN, y: 1, alive: true },
      { x: 10, y: Number.POSITIVE_INFINITY, alive: true }, { x: 40, y: 0, alive: false }]) {
      expect(canActivateWarriorSkill(request({ target })))
        .toEqual({ status: 'blocked', reason: 'invalidTarget' });
    }
    const ground: WarriorEconomySkill = { ...cleave, target: 'ground' };
    expect(canActivateWarriorSkill(request({ skill: ground, target: { x: 5, y: 5 } })))
      .toEqual({ status: 'ready' });
    expect(canActivateWarriorSkill(request({ skill: ground, target: null })))
      .toEqual({ status: 'blocked', reason: 'invalidTarget' });
  });

  it('allows an out-of-range approach only when configured and movement is permitted', () => {
    const far = request({ target: { x: 140, y: 60, alive: true } });
    expect(canActivateWarriorSkill(far)).toEqual({
      status: 'approach', destination: { x: 140, y: 60 }, stopRange: 90
    });
    expect(spendAndStartCooldown(far).state).toEqual(far.state);
    expect(canActivateWarriorSkill(request({ ...far, holdPosition: true })))
      .toEqual({ status: 'blocked', reason: 'outOfRange' });
    expect(canActivateWarriorSkill(request({ ...far, canMove: false })))
      .toEqual({ status: 'blocked', reason: 'outOfRange' });
    expect(canActivateWarriorSkill(request({ ...far, skill: { ...cleave, autoApproach: false } })))
      .toEqual({ status: 'blocked', reason: 'outOfRange' });
  });

  it('blocks a movement skill while held or immobilized even with a target in range', () => {
    const charge: WarriorEconomySkill = {
      ...cleave, id: 'charge', cost: 0, cooldown: 8, range: 245, movementSkill: true
    };
    expect(canActivateWarriorSkill(request({ skill: charge, holdPosition: true })))
      .toEqual({ status: 'blocked', reason: 'movementBlocked' });
    expect(canActivateWarriorSkill(request({ skill: charge, canMove: false })))
      .toEqual({ status: 'blocked', reason: 'movementBlocked' });
    expect(canActivateWarriorSkill(request({ skill: charge }))).toEqual({ status: 'ready' });
  });

  it('allows target-free self-casts but requires a nonzero finite direction for aimed skills', () => {
    const self: WarriorEconomySkill = { ...cleave, target: 'self', range: 0 };
    expect(canActivateWarriorSkill(request({ skill: self, target: undefined })))
      .toEqual({ status: 'ready' });
    const directional: WarriorEconomySkill = { ...cleave, target: 'direction' };
    expect(canActivateWarriorSkill(request({ skill: directional, target: { x: 1, y: 0 } })))
      .toEqual({ status: 'ready' });
    expect(canActivateWarriorSkill(request({ skill: directional, target: { x: 0, y: 0 } })))
      .toEqual({ status: 'blocked', reason: 'invalidTarget' });
  });

  it('rejects malformed skill costs/ranges, bad state and invalid coordinates without mutation', () => {
    const invalid = [
      request({ skill: { ...cleave, cost: -1 } }),
      request({ skill: { ...cleave, cooldown: Number.NaN } }),
      request({ skill: { ...cleave, range: Number.POSITIVE_INFINITY } }),
      request({ state: { ...state(), rage: Number.NaN } }),
      request({ state: { ...state(), rage: 101 } }),
      request({ state: { ...state(), cooldowns: { cleave: -1 } } }),
      request({ actor: { x: Number.NaN, y: 0, alive: true } })
    ];
    for (const input of invalid) {
      const result = canActivateWarriorSkill(input);
      expect(result.status).toBe('blocked');
      expect(spendAndStartCooldown(input).decision).toEqual(result);
    }
  });

  it('does not mutate deeply frozen inputs and keeps blocked states unchanged', () => {
    const input = Object.freeze({
      ...request({ state: Object.freeze({
        rage: 5, maxRage: 100,
        cooldowns: Object.freeze({ cleave: 0 })
      }) }),
      actor: Object.freeze({ x: 0, y: 0, alive: true }),
      target: Object.freeze({ x: 10, y: 10, alive: true }),
      skill: Object.freeze({ ...cleave })
    });
    const output = spendAndStartCooldown(input);
    expect(output.decision).toEqual({ status: 'blocked', reason: 'rage' });
    expect(output.state).toEqual(input.state);
    expect(Object.isFrozen(output.state)).toBe(true);
    expect(Object.isFrozen(output.state.cooldowns)).toBe(true);
  });

  it('decrements multiple cooldowns to zero on fixed simulation ticks without mutating input', () => {
    const input = Object.freeze({
      rage: 30, maxRage: 100, cooldowns: Object.freeze({ cleave: 2.5, charge: 0.2, unused: 0 })
    });
    const first = advanceWarriorCooldowns(input, 0.3);
    expect(first).toEqual({
      rage: 30, maxRage: 100, cooldowns: { cleave: 2.2, charge: 0, unused: 0 }
    });
    expect(input.cooldowns.charge).toBe(0.2);
    const second = advanceWarriorCooldowns(first, 20);
    expect(second.cooldowns).toEqual({ cleave: 0, charge: 0, unused: 0 });
    expect(advanceWarriorCooldowns(input, -1)).toEqual(input);
    expect(advanceWarriorCooldowns(input, Number.NaN)).toEqual(input);
    expect(advanceWarriorCooldowns(input, Number.POSITIVE_INFINITY)).toEqual(input);
  });

  it('clamps Rage gained from basic hits and costs, and rejects invalid deltas', () => {
    const input = Object.freeze({ ...state(), rage: 95, cooldowns: Object.freeze({}) });
    expect(applyWarriorRageDelta(input, 8).rage).toBe(100);
    expect(applyWarriorRageDelta(input, -200).rage).toBe(0);
    expect(applyWarriorRageDelta(input, Number.MAX_VALUE).rage).toBe(100);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(applyWarriorRageDelta(input, bad)).toEqual(input);
    }
    expect(input.rage).toBe(95);
    expect(Object.isFrozen(applyWarriorRageDelta(input, 5).cooldowns)).toBe(true);
  });
});
