import { describe, expect, it } from 'vitest';
import {
  advanceCombatTimeline,
  cancelCombatTimeline,
  startCombatTimeline,
  type CombatTimelineEvent,
  type CombatTimelineState
} from '../../src/game/animation/combatTimeline';

const attack = () => startCombatTimeline({
  animation: 'attack',
  actionId: 'hero:basic',
  windupTicks: 3,
  recoveryTicks: 4
});

function progress(state: CombatTimelineState, steps: number[]): {
  state: CombatTimelineState;
  events: CombatTimelineEvent[];
} {
  let current = state;
  const events: CombatTimelineEvent[] = [];
  for (const step of steps) {
    const next = advanceCombatTimeline(current, step);
    current = next.state;
    events.push(...next.events);
  }
  return { state: current, events };
}

describe('Agent 08: deterministic hit-frame timeline', () => {
  it('emits impact exactly once when crossing the authoritative hit tick', () => {
    const started = attack();
    expect(started.state).toMatchObject({
      animation: 'attack', phase: 'windup', elapsedTicks: 0,
      impactTick: 3, totalTicks: 7, impactEmitted: false, movementLocked: true
    });
    expect(started.events).toEqual([{
      type: 'started', animation: 'attack', actionId: 'hero:basic', atTick: 0
    }]);

    const before = advanceCombatTimeline(started.state, 2);
    expect(before.state.phase).toBe('windup');
    expect(before.events).toEqual([]);

    const boundary = advanceCombatTimeline(before.state, 1);
    expect(boundary.state).toMatchObject({
      elapsedTicks: 3, phase: 'recovery', impactEmitted: true
    });
    expect(boundary.events).toEqual([{
      type: 'impact', animation: 'attack', actionId: 'hero:basic', atTick: 3
    }]);

    const after = advanceCombatTimeline(boundary.state, 2);
    expect(after.events).toEqual([]);
    const done = advanceCombatTimeline(after.state, 50);
    expect(done.state).toMatchObject({
      elapsedTicks: 7, phase: 'complete', movementLocked: false
    });
    expect(done.events).toEqual([{
      type: 'completed', animation: 'attack', actionId: 'hero:basic', atTick: 7
    }]);
    expect(advanceCombatTimeline(done.state, 50).events).toEqual([]);
  });

  it('is partition invariant: one large step and multiple fixed ticks emit identical cues', () => {
    const initial = startCombatTimeline({
      animation: 'cast', actionId: 'spell:1', windupTicks: 5, recoveryTicks: 6
    }).state;
    const large = advanceCombatTimeline(initial, 11);
    const stepped = progress(initial, Array.from({ length: 11 }, () => 1));
    const chunks = progress(initial, [2, 1, 4, 4]);
    expect(stepped).toEqual(large);
    expect(chunks).toEqual(large);
    expect(large.events.map(event => [event.type, event.atTick]))
      .toEqual([['impact', 5], ['completed', 11]]);
  });

  it('emits impact before completion if the recovery has zero ticks', () => {
    const state = startCombatTimeline({
      animation: 'attack', windupTicks: 2, recoveryTicks: 0
    }).state;
    const result = advanceCombatTimeline(state, 2);
    expect(result.events.map(event => event.type)).toEqual(['impact', 'completed']);
    expect(result.state).toMatchObject({
      phase: 'complete', impactEmitted: true, movementLocked: false
    });
  });

  it('cancellation before impact prevents damage cues forever, even on huge advances', () => {
    const state = progress(attack().state, [1]).state;
    const cancelled = cancelCombatTimeline(state);
    expect(cancelled.state).toMatchObject({
      phase: 'cancelled', elapsedTicks: 1, impactEmitted: false, movementLocked: false
    });
    expect(cancelled.events).toEqual([{
      type: 'cancelled', animation: 'attack', actionId: 'hero:basic', atTick: 1
    }]);
    expect(advanceCombatTimeline(cancelled.state, Number.MAX_VALUE))
      .toEqual({ state: cancelled.state, events: [] });
    expect(cancelCombatTimeline(cancelled.state).events).toEqual([]);
    expect(startCombatTimeline({ animation: 'walk' }).state.phase).toBe('loop');
  });

  it('cancels recovery without replaying an already emitted impact', () => {
    const impacted = advanceCombatTimeline(attack().state, 3).state;
    expect(impacted.impactEmitted).toBe(true);
    const cancelled = cancelCombatTimeline(impacted);
    expect(cancelled.events.map(event => event.type)).toEqual(['cancelled']);
    expect(advanceCombatTimeline(cancelled.state, 20).events).toEqual([]);
  });

  it('channels through sustain and recovery with one impact, not one per tick', () => {
    const start = startCombatTimeline({
      animation: 'channel', actionId: 'beam', windupTicks: 2,
      sustainTicks: 4, recoveryTicks: 3
    });
    expect(start.state).toMatchObject({ totalTicks: 9, movementLocked: true });
    const impact = advanceCombatTimeline(start.state, 2);
    expect(impact.state.phase).toBe('sustain');
    expect(impact.events.map(event => event.type)).toEqual(['impact']);
    expect(advanceCombatTimeline(impact.state, 3).events).toEqual([]);
    const recovery = advanceCombatTimeline(impact.state, 4);
    expect(recovery.state.phase).toBe('recovery');
    const finish = advanceCombatTimeline(recovery.state, 3);
    expect(finish.state.phase).toBe('complete');
    expect(finish.events.map(event => event.type)).toEqual(['completed']);
  });

  it('supports all animation states without inventing impacts for nonattacks', () => {
    for (const animation of ['idle', 'walk', 'run'] as const) {
      const started = startCombatTimeline({ animation });
      expect(started.state).toMatchObject({
        phase: 'loop', movementLocked: false, totalTicks: null, impactTick: null
      });
      expect(advanceCombatTimeline(started.state, 99).events).toEqual([]);
      expect(advanceCombatTimeline(started.state, 99).state).toEqual(started.state);
    }
    for (const animation of ['hit', 'block', 'dodge'] as const) {
      const started = startCombatTimeline({ animation, recoveryTicks: 3 });
      expect(started.state).toMatchObject({
        phase: 'recovery', totalTicks: 3, impactTick: null
      });
      expect(advanceCombatTimeline(started.state, 3).events.map(e => e.type))
        .toEqual(['completed']);
    }
    const death = startCombatTimeline({ animation: 'death' });
    expect(death.state).toMatchObject({ phase: 'dead', movementLocked: true });
    expect(cancelCombatTimeline(death.state)).toEqual({ state: death.state, events: [] });
    expect(advanceCombatTimeline(death.state, 100)).toEqual({ state: death.state, events: [] });
  });

  it('makes movement locks explicit and releases them only after completion or cancellation', () => {
    expect(startCombatTimeline({ animation: 'attack', movementLocked: false }).state.movementLocked)
      .toBe(false);
    expect(startCombatTimeline({ animation: 'cast' }).state.movementLocked).toBe(true);
    expect(startCombatTimeline({ animation: 'channel' }).state.movementLocked).toBe(true);
    expect(startCombatTimeline({ animation: 'hit' }).state.movementLocked).toBe(true);
    expect(startCombatTimeline({ animation: 'block' }).state.movementLocked).toBe(true);
    expect(startCombatTimeline({ animation: 'dodge' }).state.movementLocked).toBe(false);
    expect(startCombatTimeline({ animation: 'death', movementLocked: false }).state.movementLocked)
      .toBe(true);
  });

  it('ignores invalid or sub-tick deltas and caps extreme finite deltas safely', () => {
    const state = attack().state;
    for (const delta of [0, -1, Number.NaN, Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY, 0.5]) {
      expect(advanceCombatTimeline(state, delta))
        .toEqual({ state, events: [] });
    }
    const huge = advanceCombatTimeline(state, Number.MAX_VALUE);
    expect(huge.state).toMatchObject({ elapsedTicks: 7, phase: 'complete' });
    for (const value of [huge.state.elapsedTicks, huge.state.totalTicks, huge.state.impactTick]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('normalizes malformed animation specs to finite, bounded, fail-safe timings', () => {
    const malformed = Object.freeze({
      animation: 'cast' as const,
      windupTicks: Number.NaN,
      sustainTicks: Number.POSITIVE_INFINITY,
      recoveryTicks: -500,
      movementLocked: true
    });
    const result = startCombatTimeline(malformed);
    expect(result.state).toMatchObject({
      windupTicks: 1, sustainTicks: 0, recoveryTicks: 0, totalTicks: 1,
      impactTick: 1, phase: 'windup'
    });
    expect(malformed.recoveryTicks).toBe(-500);
    const invalid = startCombatTimeline({ animation: 'nonexistent' } as never);
    expect(invalid.state).toMatchObject({ animation: 'idle', phase: 'loop' });
  });

  it('never mutates input state and freezes returned states and event arrays', () => {
    const original = attack();
    expect(Object.isFrozen(original.state)).toBe(true);
    expect(Object.isFrozen(original.events)).toBe(true);
    const frozen = Object.freeze({ ...original.state });
    const advanced = advanceCombatTimeline(frozen, 3);
    expect(frozen.elapsedTicks).toBe(0);
    expect(frozen.impactEmitted).toBe(false);
    expect(Object.isFrozen(advanced.state)).toBe(true);
    expect(Object.isFrozen(advanced.events)).toBe(true);
    expect(Object.isFrozen(advanced.events[0])).toBe(true);
    expect(advanced.state).not.toBe(frozen);
  });
});
